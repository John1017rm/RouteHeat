(() => {
  'use strict';

  const CONFIG = window.ROUTEHEAT_SUPABASE || {};
  const TABLE = CONFIG.table || 'routeheat_routes';
  const SNAPSHOT_FUNCTION = CONFIG.snapshotFunction || 'neighborhood-snapshot';
  const ROUTES_KEY = 'routeheat.routes.v2';
  const OWNER_KEY = 'routeheat.cloud.owner.v1';
  const DELETIONS_KEY = 'routeheat.cloud.deletions.v1';
  const BLOCKLIST_KEY = 'routeheat.cloud.deletedRoutes.v1';
  const RESTORES_KEY = 'routeheat.cloud.restores.v1';
  const LAST_SYNC_KEY = 'routeheat.cloud.lastSync.v1';
  const SNAPSHOT_DELETIONS_KEY = 'routeheat.neighborhood.deletions.v1';
  const $ = selector => document.querySelector(selector);
  let client = null;
  let session = null;
  let syncing = false;
  let syncRequested = false;
  let cloudModalReturnFocus = null;

  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const localRoutes = () => readJson(ROUTES_KEY, []);
  async function fullLocalRoutes() {
    const history = window.RouteHeatHistory;
    try { await (history?.ready?.() || window.RouteHeatStorageReady); }
    catch {}
    try {
      const items = history?.read?.();
      if (Array.isArray(items)) return items;
    } catch {}
    return localRoutes();
  }
  const deletionQueue = () => readJson(DELETIONS_KEY, []);
  const deletionBlocklist = () => readJson(BLOCKLIST_KEY, []);
  const restoreQueue = () => readJson(RESTORES_KEY, []);
  const snapshotDeletionQueue = () => readJson(SNAPSHOT_DELETIONS_KEY, []).filter(item => item && item.routeId);
  const saveDeletions = items => localStorage.setItem(DELETIONS_KEY, JSON.stringify(items));
  const saveBlocklist = items => localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(items.slice(-500)));
  const saveRestores = items => localStorage.setItem(RESTORES_KEY, JSON.stringify(items.slice(-500)));
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
  const compactMirrorOnly = route => route?.localMirrorTrackOmitted === true
    && !(Array.isArray(route?.track) && route.track.length);
  const hasRecordedTrail = route => Array.isArray(route?.track) && route.track.length > 0;
  const compactNeighborhoodOnly = route => route?.localMirrorNeighborhoodDetailOmitted === true
    && !(Array.isArray(route?.neighborhoodSnapshot?.areas) && route.neighborhoodSnapshot.areas.length)
    && !(Array.isArray(route?.neighborhoodSnapshot?.phases) && route.neighborhoodSnapshot.phases.length);
  const hasNeighborhoodDetail = route => (Array.isArray(route?.neighborhoodSnapshot?.areas) && route.neighborhoodSnapshot.areas.length > 0)
    || (Array.isArray(route?.neighborhoodSnapshot?.phases) && route.neighborhoodSnapshot.phases.length > 0);
  function routeCopiesCanShareTrail(firstRoute, secondRoute) {
    if (!firstRoute || !secondRoute) return false;
    return exactRouteContentMatch(routeSignature(firstRoute), routeSignature(secondRoute));
  }
  function enrichPreferredRouteCopy(preferredRoute, alternateRoute) {
    if (!routeCopiesCanShareTrail(preferredRoute, alternateRoute)) return preferredRoute;
    let enriched = preferredRoute, changed = false;
    if (compactMirrorOnly(preferredRoute) && hasRecordedTrail(alternateRoute)) {
      enriched = {...preferredRoute};
      enriched.track = alternateRoute.track;
      if (Array.isArray(alternateRoute.trackBreaks)) enriched.trackBreaks = alternateRoute.trackBreaks;
      if (Array.isArray(alternateRoute.trackBreakTimes)) enriched.trackBreakTimes = alternateRoute.trackBreakTimes;
      enriched.recordedDistanceMeters = Math.max(Number(preferredRoute.recordedDistanceMeters) || 0, Number(alternateRoute.recordedDistanceMeters) || 0);
      enriched.localMirrorTrackOmitted = false;
      const alternateStops = new Map(), alternateStopsByTime = new Map();
      (alternateRoute.stops || []).forEach(stop => {
        if (stop?.id != null) alternateStops.set(String(stop.id), stop);
        const timestamp = timeKey(stop?.timestamp);
        if (timestamp && !alternateStopsByTime.has(timestamp)) alternateStopsByTime.set(timestamp, stop);
      });
      enriched.stops = (preferredRoute.stops || []).map((stop, index) => {
        const timestamp = timeKey(stop?.timestamp), sameIndex = alternateRoute.stops?.[index], alternate = (stop?.id != null ? alternateStops.get(String(stop.id)) : null) || (timestamp ? alternateStopsByTime.get(timestamp) : null) || (timeKey(sameIndex?.timestamp) === timestamp ? sameIndex : null), trackIndex = Number(alternate?.trackIndex);
        return Number.isInteger(trackIndex) && trackIndex >= 0 ? {...stop, trackIndex} : stop;
      });
      changed = true;
    }
    if (compactNeighborhoodOnly(enriched) && hasNeighborhoodDetail(alternateRoute)) {
      const preferredSnapshot = enriched.neighborhoodSnapshot, alternateSnapshot = alternateRoute.neighborhoodSnapshot, sameSnapshot = preferredSnapshot && alternateSnapshot && ((preferredSnapshot.inputHash && preferredSnapshot.inputHash === alternateSnapshot.inputHash) || preferredSnapshot.source?.generatedAt === alternateSnapshot.source?.generatedAt);
      if (sameSnapshot) {
        if (!changed) enriched = {...enriched};
        enriched.neighborhoodSnapshot = {...preferredSnapshot, areas:alternateSnapshot.areas || [], phases:alternateSnapshot.phases || []};
        enriched.localMirrorNeighborhoodDetailOmitted = false;
        changed = true;
      }
    }
    return changed ? enriched : preferredRoute;
  }
  function compareRouteCopies(firstRoute, secondRoute, firstCloudUpdatedAt = null, secondCloudUpdatedAt = null) {
    const version = compareRouteVersions(firstRoute, secondRoute, firstCloudUpdatedAt, secondCloudUpdatedAt);
    if (version) return version;
    if (compactMirrorOnly(firstRoute) && hasRecordedTrail(secondRoute)) return -1;
    if (compactMirrorOnly(secondRoute) && hasRecordedTrail(firstRoute)) return 1;
    if (compactNeighborhoodOnly(firstRoute) && hasNeighborhoodDetail(secondRoute)) return -1;
    if (compactNeighborhoodOnly(secondRoute) && hasNeighborhoodDetail(firstRoute)) return 1;
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
  function exactRouteContentMatch(first, second) {
    if (!first || !second || !first.startedAt || first.startedAt !== second.startedAt) return false;
    return first.stopCount === second.stopCount
      && first.firstStop === second.firstStop
      && first.lastStop === second.lastStop;
  }
  function remoteRowMatchesRoute(row, route) {
    if (!row || !route) return false;
    const routeId = routeIdOf(route), payloadId = routeIdOf(row.route_data), rowId = row.route_id == null ? '' : String(row.route_id);
    if (routeId && (routeId === rowId || routeId === payloadId)) return true;
    const target = routeSignature(route), candidate = routeSignature(row.route_data);
    if (!candidate.startedAt && row.started_at) candidate.startedAt = timeKey(row.started_at);
    return signaturesMatch(target, candidate);
  }
  function remoteRowsMatch(first, second) {
    if (!first || !second) return false;
    const firstRowId = first.route_id == null ? '' : String(first.route_id), secondRowId = second.route_id == null ? '' : String(second.route_id);
    const firstPayloadId = routeIdOf(first.route_data), secondPayloadId = routeIdOf(second.route_data);
    if (firstRowId && (firstRowId === secondRowId || firstRowId === secondPayloadId)) return true;
    if (firstPayloadId && (firstPayloadId === secondRowId || firstPayloadId === secondPayloadId)) return true;
    const firstSignature = routeSignature(first.route_data), secondSignature = routeSignature(second.route_data);
    if (!firstSignature.startedAt && first.started_at) firstSignature.startedAt = timeKey(first.started_at);
    if (!secondSignature.startedAt && second.started_at) secondSignature.startedAt = timeKey(second.started_at);
    return signaturesMatch(firstSignature, secondSignature);
  }
  const deletionTime = item => versionTime(item?.deletedAt ?? item?.deleted_at);
  const deletionIntentTime = item => versionTime(item?.deletionIntentAt ?? item?.routeData?.deletionIntentAt ?? item?.route_data?.deletionIntentAt);
  const explicitDeletionTime = item => {
    const intent = deletionIntentTime(item), deleted = deletionTime(item);
    return intent && deleted && Math.abs(intent - deleted) <= 1000 ? intent : 0;
  };
  const restoredTime = value => versionTime(value?.restoredAt ?? value?.routeData?.restoredAt ?? value?.route_data?.restoredAt);
  function deletionMatchesRoute(item, route) {
    if (!item || !route) return false;
    const itemRoute = item.routeData || item.route_data;
    const itemId = String(item.routeId ?? item.route_id ?? routeIdOf(itemRoute));
    const routeId = routeIdOf(route);
    if (itemId && routeId && itemId === routeId) return true;
    const signature = item.signature || routeSignature(itemRoute);
    return signaturesMatch({...signature, id: ''}, {...routeSignature(route), id: ''});
  }
  function winningRestoredRows(rows) {
    return (rows || []).filter(row => {
      if (row.deleted_at) return false;
      const restoreAt = restoredTime(row.route_data);
      if (!restoreAt) return false;
      const latestExplicitDelete = Math.max(0, ...(rows || [])
        .filter(candidate => candidate.deleted_at && remoteRowsMatch(row, candidate))
        .map(explicitDeletionTime));
      return restoreAt > latestExplicitDelete;
    });
  }
  async function matchingRemoteRows(userId, route) {
    const columns = 'route_id,route_data,started_at,updated_at,deleted_at', queries = [], routeId = routeIdOf(route), startedAt = versionTime(route?.startedAt);
    if (routeId) {
      queries.push(client.from(TABLE).select(columns).eq('user_id', userId).eq('route_id', routeId));
      queries.push(client.from(TABLE).select(columns).eq('user_id', userId).contains('route_data', {id: route.id}));
    }
    if (startedAt) queries.push(client.from(TABLE).select(columns).eq('user_id', userId).eq('started_at', new Date(startedAt).toISOString()));
    const results = await Promise.all(queries);
    const rows = new Map();
    results.forEach(({data, error}) => {
      if (error) throw error;
      (data || []).forEach(row => {
        if (remoteRowMatchesRoute(row, route)) rows.set(String(row.route_id), row);
      });
    });
    return [...rows.values()];
  }
  const chunks = (items, size = 5) => Array.from(
    {length: Math.ceil(items.length / size)},
    (_, index) => items.slice(index * size, index * size + size)
  );

  async function saveLocalRoutes(items) {
    const sorted = items.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const after = JSON.stringify(sorted);
    const history = window.RouteHeatHistory;
    if (history?.replace) {
      let current = [];
      try {
        const value = history.read?.();
        if (Array.isArray(value)) current = value.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      } catch {}
      if (JSON.stringify(current) === after) return false;
      if (history.replace(sorted) === false) throw new Error('Full route history could not be protected on this device.');
      window.dispatchEvent(new CustomEvent('routeheat:cloud-merged', {detail: {count: sorted.length}}));
      return true;
    }
    const before = localStorage.getItem(ROUTES_KEY) || '[]';
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

  function dispatchNeighborhoodState(status = null, message = '') {
    const resolved = status || (!navigator.onLine ? 'offline' : !CONFIG.snapshotFunction ? 'setup-error' : session?.user ? 'ready' : 'signed-out');
    const defaults = {ready:'Cloud is signed in and Neighborhood Snapshot is ready.',checking:'Checking Neighborhood Snapshot setup.','signed-out':'Sign in to Cloud before building Neighborhood Snapshots.',offline:'Offline · saved snapshots remain available.','setup-error':'Add snapshotFunction to Supabase config and deploy the included Edge Function.',error:'Neighborhood Snapshot service needs attention.'};
    window.dispatchEvent(new CustomEvent('routeheat:neighborhood-cloud-state',{detail:{status:resolved,message:message||defaults[resolved]||defaults.error}}));
  }

  async function neighborhoodFunctionError(error) {
    let message = String(error?.message || error || 'Neighborhood Snapshot request failed');
    const response = error?.context;
    if (response?.clone) {
      try { const payload = await response.clone().json(); message = String(payload?.message || payload?.error || message); }
      catch {}
      if (response.status === 404) return 'Neighborhood Snapshot Edge Function is not deployed yet.';
      if (response.status === 401) return 'Cloud session expired. Sign in again, then retry.';
      if (response.status === 429) return 'Snapshot limit reached. Wait a little while, then retry.';
    }
    if (/function.*not found|404/i.test(message)) return 'Neighborhood Snapshot Edge Function is not deployed yet.';
    if (/census.*key|missing key|secret/i.test(message)) return 'Census API key is not configured in Supabase yet.';
    if (/route.*not found/i.test(message)) return 'This route is not in Cloud yet. Sync once, then retry.';
    return friendlyError(message);
  }

  async function waitForCloudSync(maxMs = 20000) {
    const started=Date.now();let idleSince=0;
    while(Date.now()-started<maxMs){
      if(syncing||syncRequested)idleSince=0;
      else if(!idleSince)idleSince=Date.now();
      else if(Date.now()-idleSince>=160)return true;
      await new Promise(resolve=>setTimeout(resolve,80));
    }
    return false;
  }

  async function invokeSnapshotFunction(body, timeoutMs = 70000) {
    let timer;
    try{return await Promise.race([
      client.functions.invoke(SNAPSHOT_FUNCTION,{body}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Neighborhood Snapshot timed out. Your route is still saved; retry when the app is in front.')),timeoutMs);})
    ]);}finally{clearTimeout(timer);}
  }

  async function invokeNeighborhoodSnapshot(event) {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {}, routeId = String(detail.routeId || '').slice(0, 192), requestId = String(detail.requestId || '').slice(0, 192), fingerprint = String(detail.fingerprint || '').slice(0, 32), respond = payload => window.dispatchEvent(new CustomEvent('routeheat:neighborhood-result',{detail:{routeId,requestId,fingerprint,...payload}}));
    if (!routeId || !requestId) return;
    if (!CONFIG.snapshotFunction || !client) { const message='Neighborhood Snapshot Edge Function is not configured.';dispatchNeighborhoodState('setup-error',message);respond({status:'setup-error',message});return; }
    if (!navigator.onLine) { respond({status:'offline',message:'Offline · reconnect to build this snapshot.'});return; }
    if (!session?.user) { respond({status:'signed-out',message:'Sign in to Cloud before building a snapshot.'});return; }
    try {
      await syncNow(false);if(!await waitForCloudSync())throw new Error('Cloud sync is still busy. Wait a moment, then retry the snapshot.');
      const {data,error}=await invokeSnapshotFunction({routeId,forceRefresh:detail.forceRefresh===true});
      if(error)throw error;const snapshot=data?.snapshot??data;if(!snapshot||Number(snapshot.version)!==1)throw new Error('Neighborhood service returned an incomplete response');
      dispatchNeighborhoodState('ready');respond({status:'ready',snapshot});
    } catch(error) {
      const message=await neighborhoodFunctionError(error),status=/not deployed|not configured|Census API key/i.test(message)?'setup-error':/sign in|session expired/i.test(message)?'signed-out':/connection|offline/i.test(message)?'offline':'error';if(status!=='error')dispatchNeighborhoodState(status,message);respond({status,message});
    }
  }

  function queueNeighborhoodSnapshotDeletion(routeId) {
    const normalized=String(routeId||'').slice(0,192);if(!normalized)return false;
    const queue=snapshotDeletionQueue().filter(item=>String(item.routeId)!==normalized);
    queue.push({routeId:normalized,queuedAt:new Date().toISOString()});
    try{const raw=JSON.stringify(queue);localStorage.setItem(SNAPSHOT_DELETIONS_KEY,raw);window.dispatchEvent(new CustomEvent('routeheat:neighborhood-delete-queue-changed',{detail:{raw,count:queue.length}}));return true;}catch{return false;}
  }

  async function flushNeighborhoodSnapshotDeletions() {
    const queue=snapshotDeletionQueue();
    if(!queue.length||!client||!session?.user||!navigator.onLine||!CONFIG.snapshotFunction)return{removed:0,pending:queue.length};
    const pending=[];let removed=0;
    for(const item of queue){
      try{const {error}=await invokeSnapshotFunction({routeId:String(item.routeId),action:'delete'},30000);if(error)throw error;removed++;}
      catch{pending.push(item);}
    }
    try{const raw=JSON.stringify(pending);localStorage.setItem(SNAPSHOT_DELETIONS_KEY,raw);window.dispatchEvent(new CustomEvent('routeheat:neighborhood-delete-queue-changed',{detail:{raw,count:pending.length}}));}catch{}
    return{removed,pending:pending.length};
  }

  async function deleteNeighborhoodSnapshot(event) {
    const routeId=String(event.detail?.routeId||'').slice(0,192);if(!routeId)return;
    const queued=queueNeighborhoodSnapshotDeletion(routeId);if(event.detail&&typeof event.detail==='object')event.detail.queued=queued;
    if(queued)await flushNeighborhoodSnapshotDeletions();
  }

  function renderAccount() {
    const signedIn = !!session?.user;
    $('#cloudSignedOut').hidden = signedIn;
    $('#cloudSignedIn').hidden = !signedIn;
    dispatchNeighborhoodState();
    if (!signedIn) return;
    $('#cloudAccountEmail').textContent = session.user.email || 'Cloud account';
    const last = Number(localStorage.getItem(LAST_SYNC_KEY));
    $('#cloudLastSync').textContent = last
      ? `Last synced ${new Intl.DateTimeFormat([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(last)}`
      : 'Ready for first sync';
  }

  function openModal() {
    renderAccount();
    const modal = $('#cloudModal');
    if (!modal.classList.contains('open')) cloudModalReturnFocus = document.activeElement;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => (session ? $('#cloudSyncNow') : $('#cloudEmail'))?.focus(), 0);
  }

  function closeModal() {
    const modal = $('#cloudModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    const focus = cloudModalReturnFocus;
    cloudModalReturnFocus = null;
    if (focus?.isConnected && focus.getClientRects().length) setTimeout(() => focus.focus(), 0);
    else setTimeout(() => $('#cloudBtn')?.focus(), 0);
  }

  function ensureOwner(userId, routeItems = localRoutes()) {
    const owner = localStorage.getItem(OWNER_KEY);
    const routes = Array.isArray(routeItems) ? routeItems : localRoutes();
    if (owner && owner !== userId && routes.length) {
      throw new Error('This device contains routes linked to another cloud account. Export them before switching accounts.');
    }
    localStorage.setItem(OWNER_KEY, userId);
  }

  function rememberRestore(route) {
    if (route?.id == null) return;
    const restoredRoute = {...route};
    delete restoredRoute.deletionIntentAt;
    const restoreAt = restoredTime(restoredRoute);
    if (!restoreAt) return;
    const newerQueued = restoreQueue().find(item => deletionMatchesRoute(item, restoredRoute) && restoredTime(item) > restoreAt);
    if (!newerQueued) {
      const items = restoreQueue().filter(item => !deletionMatchesRoute(item, restoredRoute));
      items.push({routeId: routeIdOf(restoredRoute), restoredAt: restoreAt, routeData: restoredRoute});
      saveRestores(items);
    }
    saveDeletions(deletionQueue().filter(item => !deletionMatchesRoute(item, restoredRoute) || explicitDeletionTime(item) >= restoreAt));
    saveBlocklist(deletionBlocklist().filter(item => !deletionMatchesRoute(item, restoredRoute) || explicitDeletionTime(item) >= restoreAt));
  }

  function rememberDeletion(route) {
    if (route?.id == null) return;
    const routeId = routeIdOf(route);
    const startedAt = timeKey(route.startedAt);
    const items = deletionQueue().filter(item => item.routeId !== routeId && (!startedAt || timeKey(item.routeData?.startedAt) !== startedAt));
    const queuedRestores = restoreQueue();
    const latestRestore = Math.max(0, restoredTime(route), ...queuedRestores.filter(item => deletionMatchesRoute(item, route)).map(restoredTime));
    const deletedTime = Math.max(Date.now(), latestRestore + 1);
    const deletedAt = new Date(deletedTime).toISOString();
    const deletedRoute = {...route, deletionIntentAt: deletedTime};
    saveRestores(queuedRestores.filter(item => !deletionMatchesRoute(item, route) || restoredTime(item) > deletedTime));
    items.push({routeId, deletedAt, deletionIntentAt: deletedTime, routeData: deletedRoute});
    saveDeletions(items);
    const signature = routeSignature(route);
    const blocked = deletionBlocklist().filter(item => !signaturesMatch(item.signature || routeSignature(item.routeData), signature));
    blocked.push({deletedAt, deletionIntentAt: deletedTime, signature, routeData: deletedRoute});
    saveBlocklist(blocked);
  }

  async function flushRestores(userId) {
    const pending = restoreQueue();
    if (!pending.length) return;
    for (const item of pending) {
      let routeData = item.routeData;
      let restoreAt = restoredTime(item);
      if (!routeData || routeData.id == null || !restoreAt) {
        saveRestores(restoreQueue().filter(queued => String(queued.routeId ?? '') !== String(item.routeId ?? '') || restoredTime(queued) !== restoreAt));
        continue;
      }
      const matches = await matchingRemoteRows(userId, routeData);
      const remoteRestores = matches.filter(row => !row.deleted_at && restoredTime(row.route_data));
      const newestRemoteRestore = remoteRestores.reduce((newest, row) => restoredTime(row.route_data) > restoredTime(newest?.route_data) ? row : newest, null);
      const latestRemoteRestore = restoredTime(newestRemoteRestore?.route_data);
      const latestRemoteDeletion = Math.max(0, ...matches.filter(row => row.deleted_at).map(row => versionTime(row.deleted_at)));
      const latestExplicitDeletion = Math.max(0, ...matches.filter(row => row.deleted_at).map(explicitDeletionTime));
      if (latestRemoteRestore >= restoreAt && latestRemoteRestore > latestRemoteDeletion) {
        rememberRestore(newestRemoteRestore.route_data);
        continue;
      }
      if (latestExplicitDeletion > restoreAt && latestExplicitDeletion >= latestRemoteRestore) {
        saveRestores(restoreQueue().filter(queued => !deletionMatchesRoute(queued, routeData) || restoredTime(queued) > restoreAt));
        continue;
      }
      if (latestRemoteDeletion >= restoreAt) {
        const revisionCeiling = Math.max(Number(routeData.revision) || 0, ...matches.map(row => Number(row.route_data?.revision) || 0));
        restoreAt = Math.max(Date.now(), latestRemoteDeletion + 1, latestRemoteRestore + 1);
        routeData = {...routeData, restoredAt: restoreAt, updatedAt: restoreAt, revision: revisionCeiling + 1};
        delete routeData.deletionIntentAt;
        rememberRestore(routeData);
      }
      const confirmedRow = remoteRestores.find(row => String(row.route_id) === routeIdOf(routeData)
        && restoredTime(row.route_data) >= restoreAt && restoredTime(row.route_data) > latestRemoteDeletion);
      if (confirmedRow) {
        rememberRestore(confirmedRow.route_data);
        continue;
      }
      const restoredRoute = {
        ...routeData,
        restoredAt: restoreAt,
        updatedAt: Math.max(restoreAt, versionTime(routeData.updatedAt))
      };
      delete restoredRoute.deletionIntentAt;
      const canonical = routeRow(restoredRoute, userId);
      canonical.route_id = routeIdOf(restoredRoute);
      canonical.updated_at = new Date(restoredRoute.updatedAt).toISOString();
      canonical.deleted_at = null;
      const {data, error} = await client
        .from(TABLE)
        .upsert(canonical, {onConflict: 'user_id,route_id'})
        .select('route_id,route_data,updated_at,deleted_at');
      if (error) throw error;
      const confirmed = (data || []).some(row => String(row.route_id) === canonical.route_id && !row.deleted_at && restoredTime(row.route_data) >= restoreAt);
      if (!confirmed) throw new Error('Cloud restore could not be confirmed.');
      const aliasDeletedAt = new Date(Math.max(1, restoreAt - 1)).toISOString();
      for (const alias of matches) {
        if (String(alias.route_id) === canonical.route_id) continue;
        const {error: aliasError} = await client
          .from(TABLE)
          .update({deleted_at: aliasDeletedAt, updated_at: aliasDeletedAt})
          .eq('user_id', userId)
          .eq('route_id', alias.route_id);
        if (aliasError) throw aliasError;
      }
      rememberRestore(restoredRoute);
    }
  }

  async function flushDeletions(userId, routeItems = localRoutes()) {
    const pending = deletionQueue();
    if (!pending.length) return;
    for (const item of pending) {
      const routeData = item.routeData
        || routeItems.find(route => String(route.id) === item.routeId)
        || {id: item.routeId, startedAt: Date.parse(item.deletedAt) || Date.now(), endedAt: Date.parse(item.deletedAt) || Date.now(), stops: [], totes: [], track: []};
      const itemDeletedAt = deletionTime(item);
      const itemIntentAt = explicitDeletionTime(item);
      const matchingRows = await matchingRemoteRows(userId, routeData);
      const winningRestore = Math.max(0, ...winningRestoredRows(matchingRows).map(row => restoredTime(row.route_data)));
      if (winningRestore && (!itemIntentAt || winningRestore > itemIntentAt)) {
        const deletionStillWins = candidate => {
          if (!deletionMatchesRoute(candidate, routeData)) return true;
          const intentAt = explicitDeletionTime(candidate);
          return intentAt && intentAt >= winningRestore;
        };
        saveDeletions(deletionQueue().filter(deletionStillWins));
        saveBlocklist(deletionBlocklist().filter(deletionStillWins));
        continue;
      }
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
      saveDeletions(deletionQueue().filter(queued => queued.routeId !== item.routeId || deletionTime(queued) > itemDeletedAt));
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
      const localSnapshot = await fullLocalRoutes();
      ensureOwner(userId, localSnapshot);
      await flushRestores(userId);
      await flushDeletions(userId, localSnapshot);
      await flushNeighborhoodSnapshotDeletions();

      const {data: remoteRows, error: remoteError} = await client
        .from(TABLE)
        .select('route_id,route_data,updated_at,deleted_at')
        .eq('user_id', userId)
        .order('started_at', {ascending: false})
        .limit(1000);
      if (remoteError) throw remoteError;

      const restoredWinners = winningRestoredRows(remoteRows || []);
      if (restoredWinners.length) {
        const staleDeletion = item => {
          const routeData = item.routeData || item.route_data || {id: item.routeId ?? item.route_id};
          const intentAt = explicitDeletionTime(item);
          return restoredWinners.some(row => remoteRowMatchesRoute(row, routeData)
            && (!intentAt || restoredTime(row.route_data) > intentAt));
        };
        const queuedItems = deletionQueue(), blockedItems = deletionBlocklist();
        const currentQueue = queuedItems.filter(item => !staleDeletion(item));
        const currentBlocklist = blockedItems.filter(item => !staleDeletion(item));
        if (currentQueue.length !== queuedItems.length) saveDeletions(currentQueue);
        if (currentBlocklist.length !== blockedItems.length) saveBlocklist(currentBlocklist);
      }
      const deletedRows = (remoteRows || []).filter(row => row.deleted_at && !restoredWinners.some(restored => {
        const intentAt = explicitDeletionTime(row);
        return remoteRowsMatch(restored, row) && (!intentAt || restoredTime(restored.route_data) > intentAt);
      }));
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
      const deletionSources = [
        ...deletionBlocklist(),
        ...queuedItems,
        ...deletedRows
      ];
      const liveAliases = (remoteRows || []).filter(row => !row.deleted_at && row.route_data && isDeletedRoute(row.route_data, row.route_id));
      if (liveAliases.length) {
        for (const alias of liveAliases) {
          const source = deletionSources
            .filter(item => deletionMatchesRoute(item, alias.route_data))
            .sort((first, second) => deletionTime(second) - deletionTime(first))[0];
          const aliasDeletedMs = deletionTime(source) || Date.now();
          const aliasDeletedAt = new Date(aliasDeletedMs).toISOString();
          const intentTime = explicitDeletionTime(source);
          const aliasRouteData = intentTime ? {...alias.route_data, deletionIntentAt: intentTime} : alias.route_data;
          const {error: aliasError} = await client
            .from(TABLE)
            .update({route_data: aliasRouteData, deleted_at: aliasDeletedAt, updated_at: aliasDeletedAt})
            .eq('user_id', userId)
            .eq('route_id', alias.route_id);
          if (aliasError) throw aliasError;
        }
      }
      const local = localSnapshot.filter(saved => saved?.id != null && !isDeletedRoute(saved));
      const localById = new Map();
      local.forEach(saved => {
        const logicalId = routeIdOf(saved), current = localById.get(logicalId);
        if (!current) localById.set(logicalId, saved);
        else {
          const preferred = compareRouteCopies(saved, current) >= 0 ? saved : current;
          localById.set(logicalId, enrichPreferredRouteCopy(preferred, preferred === saved ? current : saved));
        }
      });
      const remoteById = new Map();
      (remoteRows || [])
        .filter(row => !row.deleted_at && row.route_data?.id != null && !isDeletedRoute(row.route_data, row.route_id))
        .forEach(row => {
          const logicalId = routeIdOf(row.route_data), current = remoteById.get(logicalId);
          const comparison = current
            ? compareRouteCopies(row.route_data, current.route_data, row.updated_at, current.updated_at)
            : 1;
          const canonicalTie = comparison === 0
            && String(row.route_id) === logicalId
            && String(current?.route_id) !== logicalId;
          if (!current) remoteById.set(logicalId, row);
          else {
            const preferred = comparison > 0 || canonicalTie ? row : current, alternate = preferred === row ? current : row;
            const enriched = enrichPreferredRouteCopy(preferred.route_data, alternate.route_data);
            remoteById.set(logicalId, {...preferred, route_data:enriched, routeheatNeedsRichnessRepair:preferred.routeheatNeedsRichnessRepair === true || enriched !== preferred.route_data});
          }
        });

      const merged = new Map();
      const upload = [];
      const logicalIds = new Set([...localById.keys(), ...remoteById.keys()]);
      logicalIds.forEach(logicalId => {
        const localRoute = localById.get(logicalId), remoteRow = remoteById.get(logicalId);
        if (!localRoute) {
          merged.set(logicalId, remoteRow.route_data);
          if (remoteRow.routeheatNeedsRichnessRepair) upload.push(remoteRow.route_data);
          return;
        }
        if (!remoteRow) {
          merged.set(logicalId, localRoute);
          upload.push(localRoute);
          return;
        }
        const comparison = compareRouteCopies(localRoute, remoteRow.route_data, null, remoteRow.updated_at);
        if (comparison >= 0) {
          const preferred = enrichPreferredRouteCopy(localRoute, remoteRow.route_data);
          merged.set(logicalId, preferred);
          upload.push(preferred);
        } else {
          const preferred = enrichPreferredRouteCopy(remoteRow.route_data, localRoute);
          merged.set(logicalId, preferred);
          if (preferred !== remoteRow.route_data) upload.push(preferred);
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
      await saveLocalRoutes([...merged.values()]);

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

  function dispatchDeletedRoutes(status, routes = [], message = '') {
    window.dispatchEvent(new CustomEvent('routeheat:cloud-deleted-routes', {
      detail: {status, routes, ...(message ? {message} : {})}
    }));
  }

  async function requestDeletedRoutes() {
    if (!client) {
      dispatchDeletedRoutes('error', [], 'Cloud backup is unavailable on this device.');
      return;
    }
    if (!session?.user) {
      dispatchDeletedRoutes('signed-out', [], 'Sign in to check cloud recovery.');
      return;
    }
    if (!navigator.onLine) {
      dispatchDeletedRoutes('offline', [], 'Connect to the internet to check cloud recovery.');
      return;
    }
    dispatchDeletedRoutes('checking', [], 'Checking cloud recovery...');
    try {
      const columns = 'route_id,route_data,started_at,updated_at,deleted_at';
      const [{data, error}, {data: liveRows, error: liveError}] = await Promise.all([
        client.from(TABLE).select(columns).eq('user_id', session.user.id).not('deleted_at', 'is', null).order('deleted_at', {ascending: false}).limit(1000),
        client.from(TABLE).select(columns).eq('user_id', session.user.id).is('deleted_at', null).limit(1000)
      ]);
      if (error) throw error;
      if (liveError) throw liveError;
      const restoredWinners = winningRestoredRows([...(data || []), ...(liveRows || [])]);
      const deletedRows = (data || []).filter(row => !restoredWinners.some(restored => {
        const intentAt = explicitDeletionTime(row);
        return remoteRowsMatch(restored, row) && (!intentAt || restoredTime(restored.route_data) > intentAt);
      }));
      const byRoute = new Map();
      deletedRows.forEach(row => {
        const routeData = row.route_data;
        if (!row.deleted_at || !routeData || typeof routeData !== 'object' || routeData.id == null || !routeData.endedAt || !Array.isArray(routeData.stops)) return;
        const candidate = {routeId: String(row.route_id), deletedAt: row.deleted_at, routeData};
        const signature = routeSignature(routeData), existing = [...byRoute.entries()].find(([, saved]) => {
          const savedId = routeIdOf(saved.routeData), candidateId = routeIdOf(routeData);
          return (savedId && candidateId && savedId === candidateId) || signaturesMatch(routeSignature(saved.routeData), signature);
        });
        const key = existing?.[0] || routeIdOf(routeData) || `${signature.startedAt}:${signature.stopCount}:${signature.firstStop}:${signature.lastStop}`;
        const current = existing?.[1];
        if (!current) {
          byRoute.set(key, {...candidate, updatedAt: row.updated_at});
          return;
        }
        const newestDeletedAt = versionTime(row.deleted_at) > versionTime(current.deletedAt) ? row.deleted_at : current.deletedAt;
        const comparison = compareRouteVersions(routeData, current.routeData, row.updated_at, current.updatedAt);
        const richer = routeData.stops.length > current.routeData.stops.length;
        const canonical = comparison === 0 && String(row.route_id) === routeIdOf(routeData) && current.routeId !== routeIdOf(current.routeData);
        if (comparison > 0 || (comparison === 0 && richer) || canonical) byRoute.set(key, {...candidate, deletedAt: newestDeletedAt, updatedAt: row.updated_at});
        else if (newestDeletedAt !== current.deletedAt) byRoute.set(key, {...current, deletedAt: newestDeletedAt});
      });
      const routes = [...byRoute.values()]
        .sort((first, second) => versionTime(second.deletedAt) - versionTime(first.deletedAt))
        .map(({updatedAt, ...candidate}) => candidate);
      dispatchDeletedRoutes('ready', routes, routes.length ? `${routes.length} deleted route${routes.length === 1 ? '' : 's'} found in cloud.` : 'No deleted cloud routes found.');
    } catch (error) {
      dispatchDeletedRoutes('error', [], friendlyError(error));
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
    window.addEventListener('online', () => { dispatchNeighborhoodState();syncNow(); });
    window.addEventListener('offline', () => {
      if (session) setStatus('offline', 'Offline. Local tracking remains available.');
      dispatchNeighborhoodState('offline');
    });
    window.addEventListener('routeheat:route-saved', () => syncNow());
    window.addEventListener('routeheat:route-deleted', event => {
      rememberDeletion(event.detail?.route);
      syncNow();
    });
    window.addEventListener('routeheat:route-restored', event => {
      rememberRestore(event.detail?.route);
      syncNow();
    });
    window.addEventListener('routeheat:request-deleted-routes', () => {
      requestDeletedRoutes();
    });
    window.addEventListener('routeheat:neighborhood-request', invokeNeighborhoodSnapshot);
    window.addEventListener('routeheat:neighborhood-delete', deleteNeighborhoodSnapshot);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncNow();
    });
  }

  async function init() {
    bindUi();
    if (!CONFIG.url || !CONFIG.publishableKey || !window.supabase?.createClient) {
      setStatus('error', 'Cloud backup could not load. Route tracking still works locally.');
      dispatchNeighborhoodState('setup-error','Cloud backup must be configured before Neighborhood Snapshot can run.');
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
