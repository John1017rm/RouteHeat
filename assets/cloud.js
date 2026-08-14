(() => {
  'use strict';

  const CONFIG = window.ROUTEHEAT_SUPABASE || {};
  const TABLE = CONFIG.table || 'routeheat_routes';
  const ROUTES_KEY = 'routeheat.routes.v2';
  const OWNER_KEY = 'routeheat.cloud.owner.v1';
  const DELETIONS_KEY = 'routeheat.cloud.deletions.v1';
  const BLOCKLIST_KEY = 'routeheat.cloud.deletedRoutes.v1';
  const LAST_SYNC_KEY = 'routeheat.cloud.lastSync.v1';
  const $ = selector => document.querySelector(selector);
  let client = null;
  let session = null;
  let syncing = false;
  let syncRequested = false;

  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const localRoutes = () => readJson(ROUTES_KEY, []);
  const deletionQueue = () => readJson(DELETIONS_KEY, []);
  const deletionBlocklist = () => readJson(BLOCKLIST_KEY, []);
  const saveDeletions = items => localStorage.setItem(DELETIONS_KEY, JSON.stringify(items));
  const saveBlocklist = items => localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(items.slice(-500)));
  const iso = value => value ? new Date(value).toISOString() : null;
  const routeIdOf = route => route?.id == null ? '' : String(route.id);
  const timeKey = value => {
    if (value == null) return '';
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(parsed) ? String(parsed) : String(value);
  };
  const routeSignature = route => {
    const stops = Array.isArray(route?.stops) ? route.stops : [];
    return {
      id: routeIdOf(route),
      startedAt: timeKey(route?.startedAt),
      endedAt: timeKey(route?.endedAt),
      stopCount: stops.length,
      firstStop: timeKey(stops[0]?.timestamp),
      lastStop: timeKey(stops.at(-1)?.timestamp)
    };
  };
  const versionNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  const versionTime = value => {
    if (value == null || value === '') return 0;
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  function routeVersion(route, cloudUpdatedAt = null) {
    return {
      schema: versionNumber(route?.schemaVersion ?? route?.schema),
      revision: versionNumber(route?.revision),
      updatedAt: versionTime(route?.updatedAt)
        || versionTime(cloudUpdatedAt)
        || versionTime(route?.endedAt)
        || versionTime(route?.startedAt)
    };
  }
  function compareRouteVersions(firstRoute, secondRoute, firstCloudUpdatedAt = null, secondCloudUpdatedAt = null) {
    const first = routeVersion(firstRoute, firstCloudUpdatedAt);
    const second = routeVersion(secondRoute, secondCloudUpdatedAt);
    if (first.schema !== second.schema) return first.schema > second.schema ? 1 : -1;
    if (first.revision !== second.revision) return first.revision > second.revision ? 1 : -1;
    if (first.updatedAt !== second.updatedAt) return first.updatedAt > second.updatedAt ? 1 : -1;
    return 0;
  }
  function signaturesMatch(first, second) {
    if (!first || !second) return false;
    if (first.id && second.id && first.id === second.id) return true;
    if (first.startedAt && second.startedAt && first.startedAt === second.startedAt) return true;
    if (first.stopCount !== second.stopCount) return false;
    if (first.firstStop && second.firstStop && first.lastStop && second.lastStop && first.firstStop === second.firstStop && first.lastStop === second.lastStop) return true;
    const startA = Number(first.startedAt), startB = Number(second.startedAt), endA = Number(first.endedAt), endB = Number(second.endedAt);
    return first.stopCount > 0
      && Number.isFinite(startA) && Number.isFinite(startB) && Math.abs(startA - startB) <= 300000
      && Number.isFinite(endA) && Number.isFinite(endB) && Math.abs(endA - endB) <= 300000;
  }
  const chunks = (items, size = 5) => Array.from(
    {length: Math.ceil(items.length / size)},
    (_, index) => items.slice(index * size, index * size + size)
  );

  function saveLocalRoutes(items) {
    const sorted = items.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const before = localStorage.getItem(ROUTES_KEY) || '[]';
    const after = JSON.stringify(sorted);
    if (before === after) return false;
    localStorage.setItem(ROUTES_KEY, after);
    window.dispatchEvent(new CustomEvent('routeheat:cloud-merged', {detail: {count: sorted.length}}));
    return true;
  }

  function routeRow(route, userId) {
    const updatedAt = routeVersion(route).updatedAt;
    return {
      user_id: userId,
      route_id: String(route.id),
      started_at: iso(route.startedAt),
      ended_at: iso(route.endedAt),
      stop_count: Array.isArray(route.stops) ? route.stops.length : 0,
      route_data: route,
      updated_at: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
      deleted_at: null
    };
  }

  function friendlyError(error) {
    const message = String(error?.message || error || 'Cloud sync failed');
    if (error?.code === '42P01' || /relation .* does not exist/i.test(message)) return 'Cloud table not ready. Run the supplied Supabase setup SQL.';
    if (/failed to fetch|network|load failed/i.test(message)) return 'No connection. RouteHeat will retry automatically.';
    if (/invalid login credentials/i.test(message)) return 'That email or password is not correct.';
    if (/password.*(least|characters|short)/i.test(message)) return 'Use a password with at least 8 characters.';
    if (/user already registered/i.test(message)) return 'That account already exists. Tap Sign in and sync.';
    if (/signups.*disabled|signup.*disabled/i.test(message)) return 'Account creation is closed. Sign in with the account you already created.';
    if (/cloud deletion could not be confirmed/i.test(message)) return 'The route stayed deleted on this device. Cloud removal is waiting to retry.';
    if (/rate limit/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
    return message.length > 120 ? `${message.slice(0, 117)}...` : message;
  }

  function setStatus(kind, message) {
    const button = $('#cloudBtn');
    const dot = $('#cloudDot');
    const text = $('#cloudText');
    const panel = $('#cloudStatus');
    button?.classList.remove('synced', 'syncing', 'error', 'offline');
    dot?.classList.remove('live', 'warn');
    if (kind) button?.classList.add(kind);
    if (kind === 'synced') {
      dot?.classList.add('live');
      if (text) text.textContent = 'Synced';
    } else if (kind === 'syncing') {
      dot?.classList.add('warn');
      if (text) text.textContent = 'Syncing';
    } else if (kind === 'offline') {
      dot?.classList.add('warn');
      if (text) text.textContent = 'Offline';
    } else if (kind === 'error') {
      if (text) text.textContent = 'Sync error';
    } else if (text) {
      text.textContent = 'Cloud off';
    }
    if (panel) {
      panel.textContent = message;
      panel.className = `cloud-status${kind ? ` ${kind}` : ''}`;
    }
  }

  function renderAccount() {
    const signedIn = !!session?.user;
    $('#cloudSignedOut').hidden = signedIn;
    $('#cloudSignedIn').hidden = !signedIn;
    if (!signedIn) return;
    $('#cloudAccountEmail').textContent = session.user.email || 'Cloud account';
    const last = Number(localStorage.getItem(LAST_SYNC_KEY));
    $('#cloudLastSync').textContent = last
      ? `Last synced ${new Intl.DateTimeFormat([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(last)}`
      : 'Ready for first sync';
  }

  function openModal() {
    renderAccount();
    $('#cloudModal').classList.add('open');
    $('#cloudModal').setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    $('#cloudModal').classList.remove('open');
    $('#cloudModal').setAttribute('aria-hidden', 'true');
  }

  function ensureOwner(userId) {
    const owner = localStorage.getItem(OWNER_KEY);
    const routes = localRoutes();
    if (owner && owner !== userId && routes.length) {
      throw new Error('This device contains routes linked to another cloud account. Export them before switching accounts.');
    }
    localStorage.setItem(OWNER_KEY, userId);
  }

  function rememberDeletion(route) {
    if (route?.id == null) return;
    const routeId = routeIdOf(route);
    const startedAt = timeKey(route.startedAt);
    const items = deletionQueue().filter(item => item.routeId !== routeId && (!startedAt || timeKey(item.routeData?.startedAt) !== startedAt));
    const deletedAt = new Date().toISOString();
    items.push({routeId, deletedAt, routeData: route});
    saveDeletions(items);
    const signature = routeSignature(route);
    const blocked = deletionBlocklist().filter(item => !signaturesMatch(item.signature || routeSignature(item.routeData), signature));
    blocked.push({deletedAt, signature, routeData: route});
    saveBlocklist(blocked);
  }

  async function flushDeletions(userId) {
    const pending = deletionQueue();
    if (!pending.length) return;
    for (const item of pending) {
      const routeData = item.routeData
        || localRoutes().find(route => String(route.id) === item.routeId)
        || {id: item.routeId, startedAt: Date.parse(item.deletedAt) || Date.now(), endedAt: Date.parse(item.deletedAt) || Date.now(), stops: [], totes: [], track: []};
      const tombstone = routeRow(routeData, userId);
      tombstone.route_id = item.routeId;
      tombstone.updated_at = item.deletedAt;
      tombstone.deleted_at = item.deletedAt;
      const {data, error} = await client
        .from(TABLE)
        .upsert(tombstone, {onConflict: 'user_id,route_id'})
        .select('route_id,deleted_at');
      if (error) throw error;
      const confirmed = (data || []).some(row => String(row.route_id) === item.routeId && row.deleted_at);
      if (!confirmed) throw new Error('Cloud deletion could not be confirmed.');
      if (routeData.startedAt != null) {
        const {error: legacyError} = await client
          .from(TABLE)
          .update({deleted_at: item.deletedAt, updated_at: item.deletedAt})
          .eq('user_id', userId)
          .eq('started_at', iso(routeData.startedAt));
        if (legacyError) throw legacyError;
      }
      saveDeletions(deletionQueue().filter(queued => queued.routeId !== item.routeId));
    }
  }

  async function syncNow(showComplete = false) {
    if (!client || !session?.user) return;
    if (syncing) {
      syncRequested = true;
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline', 'Offline. New changes will sync automatically when service returns.');
      return;
    }
    syncing = true;
    setStatus('syncing', 'Securely syncing route history...');
    try {
      const userId = session.user.id;
      ensureOwner(userId);
      await flushDeletions(userId);

      const {data: remoteRows, error: remoteError} = await client
        .from(TABLE)
        .select('route_id,route_data,updated_at,deleted_at')
        .eq('user_id', userId)
        .order('started_at', {ascending: false})
        .limit(1000);
      if (remoteError) throw remoteError;

      const deletedRows = (remoteRows || []).filter(row => row.deleted_at);
      const deleted = new Set(deletedRows.map(row => String(row.route_id)));
      const deletedDataIds = new Set(deletedRows.map(row => routeIdOf(row.route_data)).filter(Boolean));
      const deletedStarts = new Set(deletedRows.map(row => timeKey(row.route_data?.startedAt)).filter(Boolean));
      const queuedItems = deletionQueue();
      const queued = new Set(queuedItems.map(item => item.routeId));
      const queuedDataIds = new Set(queuedItems.map(item => routeIdOf(item.routeData)).filter(Boolean));
      const queuedStarts = new Set(queuedItems.map(item => timeKey(item.routeData?.startedAt)).filter(Boolean));
      const blockedSignatures = [
        ...deletionBlocklist().map(item => item.signature || routeSignature(item.routeData)),
        ...deletedRows.map(row => routeSignature(row.route_data)),
        ...queuedItems.map(item => routeSignature(item.routeData))
      ];
      const isDeletedRoute = (saved, rowId = '') => {
        const savedId = routeIdOf(saved), startedAt = timeKey(saved?.startedAt);
        return deleted.has(String(rowId || savedId))
          || (savedId && (deletedDataIds.has(savedId) || queued.has(savedId) || queuedDataIds.has(savedId)))
          || (startedAt && (deletedStarts.has(startedAt) || queuedStarts.has(startedAt)))
          || blockedSignatures.some(signature => signaturesMatch(routeSignature(saved), signature));
      };
      const liveAliases = (remoteRows || []).filter(row => !row.deleted_at && row.route_data && isDeletedRoute(row.route_data, row.route_id));
      if (liveAliases.length) {
        const aliasDeletedAt = new Date().toISOString();
        for (const alias of liveAliases) {
          const {error: aliasError} = await client
            .from(TABLE)
            .update({deleted_at: aliasDeletedAt, updated_at: aliasDeletedAt})
            .eq('user_id', userId)
            .eq('route_id', alias.route_id);
          if (aliasError) throw aliasError;
        }
      }
      const local = localRoutes().filter(saved => saved?.id != null && !isDeletedRoute(saved));
      const localById = new Map();
      local.forEach(saved => {
        const logicalId = routeIdOf(saved), current = localById.get(logicalId);
        if (!current || compareRouteVersions(saved, current) >= 0) localById.set(logicalId, saved);
      });
      const remoteById = new Map();
      (remoteRows || [])
        .filter(row => !row.deleted_at && row.route_data?.id != null && !isDeletedRoute(row.route_data, row.route_id))
        .forEach(row => {
          const logicalId = routeIdOf(row.route_data), current = remoteById.get(logicalId);
          const comparison = current
            ? compareRouteVersions(row.route_data, current.route_data, row.updated_at, current.updated_at)
            : 1;
          const canonicalTie = comparison === 0
            && String(row.route_id) === logicalId
            && String(current?.route_id) !== logicalId;
          if (!current || comparison > 0 || canonicalTie) remoteById.set(logicalId, row);
        });

      const merged = new Map();
      const upload = [];
      const logicalIds = new Set([...localById.keys(), ...remoteById.keys()]);
      logicalIds.forEach(logicalId => {
        const localRoute = localById.get(logicalId), remoteRow = remoteById.get(logicalId);
        if (!localRoute) {
          merged.set(logicalId, remoteRow.route_data);
          return;
        }
        if (!remoteRow) {
          merged.set(logicalId, localRoute);
          upload.push(localRoute);
          return;
        }
        const comparison = compareRouteVersions(localRoute, remoteRow.route_data, null, remoteRow.updated_at);
        if (comparison >= 0) {
          merged.set(logicalId, localRoute);
          upload.push(localRoute);
        } else {
          merged.set(logicalId, remoteRow.route_data);
        }
      });

      const rows = upload.map(route => routeRow(route, userId));
      for (const group of chunks(rows)) {
        const {error} = await client.from(TABLE).upsert(group, {onConflict: 'user_id,route_id'});
        if (error) throw error;
      }
      deletionQueue().forEach(item => {
        const deletedStart = timeKey(item.routeData?.startedAt);
        for (const [key, saved] of merged) {
          if (key === item.routeId || (deletedStart && timeKey(saved.startedAt) === deletedStart)) merged.delete(key);
        }
      });
      const finalBlocked = deletionBlocklist().map(item => item.signature || routeSignature(item.routeData));
      for (const [key, saved] of merged) {
        if (finalBlocked.some(signature => signaturesMatch(routeSignature(saved), signature))) merged.delete(key);
      }
      saveLocalRoutes([...merged.values()]);

      const now = Date.now();
      localStorage.setItem(LAST_SYNC_KEY, String(now));
      renderAccount();
      setStatus(
        'synced',
        showComplete
          ? `Cloud backup complete - ${merged.size} routes protected`
          : `${merged.size} routes protected in cloud`
      );
    } catch (error) {
      setStatus('error', friendlyError(error));
    } finally {
      syncing = false;
      if (syncRequested) {
        syncRequested = false;
        setTimeout(() => syncNow(showComplete), 0);
      }
    }
  }

  function credentials() {
    const email = $('#cloudEmail').value.trim().toLowerCase();
    const password = $('#cloudPassword').value;
    if (!email || !email.includes('@')) {
      setStatus('error', 'Enter a valid email address.');
      return null;
    }
    if (password.length < 8) {
      setStatus('error', 'Use a password with at least 8 characters.');
      return null;
    }
    return {email, password};
  }

  async function signIn() {
    const values = credentials();
    if (!values) return;
    $('#cloudSignIn').disabled = true;
    setStatus('syncing', 'Signing in securely...');
    try {
      const {data, error} = await client.auth.signInWithPassword(values);
      if (error) throw error;
      session = data.session;
      $('#cloudPassword').value = '';
      renderAccount();
      await syncNow(true);
    } catch (error) {
      setStatus('error', friendlyError(error));
    } finally {
      $('#cloudSignIn').disabled = false;
    }
  }

  async function createAccount() {
    const values = credentials();
    if (!values) return;
    $('#cloudCreateAccount').disabled = true;
    setStatus('syncing', 'Creating your secure cloud account...');
    try {
      const {data, error} = await client.auth.signUp(values);
      if (error) throw error;
      if (!data.session) {
        throw new Error('Account created, but email confirmation is still enabled. Turn off Confirm Email in Supabase, then sign in again.');
      }
      session = data.session;
      $('#cloudPassword').value = '';
      renderAccount();
      await syncNow(true);
    } catch (error) {
      setStatus('error', friendlyError(error));
    } finally {
      $('#cloudCreateAccount').disabled = false;
    }
  }

  async function signOut() {
    if (!client) return;
    const {error} = await client.auth.signOut();
    if (error) {
      setStatus('error', friendlyError(error));
      return;
    }
    session = null;
    renderAccount();
    setStatus('', 'Signed out. Local routes remain on this device.');
  }

  function bindUi() {
    $('#cloudBtn').addEventListener('click', openModal);
    $('#closeCloud').addEventListener('click', closeModal);
    $('#cloudModal').addEventListener('click', event => {
      if (event.target.id === 'cloudModal') closeModal();
    });
    $('#cloudSignIn').addEventListener('click', signIn);
    $('#cloudCreateAccount').addEventListener('click', createAccount);
    $('#cloudSyncNow').addEventListener('click', () => syncNow(true));
    $('#cloudSignOut').addEventListener('click', signOut);
    $('#cloudEmail').addEventListener('keydown', event => {
      if (event.key === 'Enter') $('#cloudPassword').focus();
    });
    $('#cloudPassword').addEventListener('keydown', event => {
      if (event.key === 'Enter') signIn();
    });
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', () => {
      if (session) setStatus('offline', 'Offline. Local tracking remains available.');
    });
    window.addEventListener('routeheat:route-saved', () => syncNow());
    window.addEventListener('routeheat:route-deleted', event => {
      rememberDeletion(event.detail?.route);
      syncNow();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
  }

  async function init() {
    bindUi();
    if (!CONFIG.url || !CONFIG.publishableKey || !window.supabase?.createClient) {
      setStatus('error', 'Cloud backup could not load. Route tracking still works locally.');
      return;
    }
    client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
      auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
    });
    const {data, error} = await client.auth.getSession();
    if (error) {
      setStatus('error', friendlyError(error));
      return;
    }
    session = data.session;
    renderAccount();
    if (session) syncNow();
    else setStatus('', 'Sign in to protect your route history.');
    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession;
      renderAccount();
      setTimeout(() => {
        if (session) syncNow();
        else setStatus('', 'Sign in to protect your route history.');
      }, 0);
    });
  }

  init().catch(error => setStatus('error', friendlyError(error)));
})();
