(() => {
  'use strict';

  const CONFIG = window.ROUTEHEAT_SUPABASE || {};
  const TABLE = CONFIG.table || 'routeheat_routes';
  const ROUTES_KEY = 'routeheat.routes.v2';
  const OWNER_KEY = 'routeheat.cloud.owner.v1';
  const DELETIONS_KEY = 'routeheat.cloud.deletions.v1';
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
  const saveDeletions = items => localStorage.setItem(DELETIONS_KEY, JSON.stringify(items));
  const iso = value => value ? new Date(value).toISOString() : null;
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
    return {
      user_id: userId,
      route_id: String(route.id),
      started_at: iso(route.startedAt),
      ended_at: iso(route.endedAt),
      stop_count: Array.isArray(route.stops) ? route.stops.length : 0,
      route_data: route,
      updated_at: new Date().toISOString(),
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
    if (!route?.id) return;
    const items = deletionQueue().filter(item => item.routeId !== String(route.id));
    items.push({routeId: String(route.id), deletedAt: new Date().toISOString()});
    saveDeletions(items);
  }

  async function flushDeletions(userId) {
    const pending = deletionQueue();
    if (!pending.length) return;
    for (const item of pending) {
      const {error} = await client
        .from(TABLE)
        .update({deleted_at: item.deletedAt, updated_at: item.deletedAt})
        .eq('user_id', userId)
        .eq('route_id', item.routeId);
      if (error) throw error;
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

      const deleted = new Set((remoteRows || []).filter(row => row.deleted_at).map(row => row.route_id));
      const queued = new Set(deletionQueue().map(item => item.routeId));
      const local = localRoutes().filter(route => route?.id && !deleted.has(String(route.id)) && !queued.has(String(route.id)));
      const rows = local.map(route => routeRow(route, userId));
      for (const group of chunks(rows)) {
        const {error} = await client.from(TABLE).upsert(group, {onConflict: 'user_id,route_id'});
        if (error) throw error;
      }

      const merged = new Map(local.map(route => [String(route.id), route]));
      (remoteRows || [])
        .filter(row => !row.deleted_at && row.route_data?.id)
        .forEach(row => {
          if (!merged.has(String(row.route_id))) merged.set(String(row.route_id), row.route_data);
        });
      deletionQueue().forEach(item => merged.delete(item.routeId));
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
