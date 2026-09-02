const DB_NAME = 'routeheat-storage';
const DB_VERSION = 2;
const STATE_STORE = 'state';
const JOURNAL_STORE = 'journal';
const ACTIVE_CHECKPOINT_STORE = 'activeCheckpoints';
const PRIMARY_KEY = 'primary';
const PREVIOUS_KEY = 'previous';
const ACTIVE_CURRENT_KEY = 'active-current';
const MARKER_KEY = 'routeheat.storage.commit.v1';

const requestResult = request => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const transactionDone = transaction => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
});

const normalizedValues = values => Object.fromEntries(
  Object.keys(values || {}).sort().map(key => [key, values[key] == null ? null : String(values[key])])
);

const canonicalValues = values => JSON.stringify(normalizedValues(values));

export function routeHeatChecksum(values) {
  const text = canonicalValues(values);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function snapshotValid(snapshot, validateValues) {
  return !!(snapshot
    && snapshot.formatVersion === 1
    && snapshot.values
    && snapshot.checksum === routeHeatChecksum(snapshot.values)
    && validateValues(snapshot.values));
}

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) database.createObjectStore(STATE_STORE, {keyPath: 'key'});
      if (!database.objectStoreNames.contains(JOURNAL_STORE)) database.createObjectStore(JOURNAL_STORE, {keyPath: 'sequence'});
      if (!database.objectStoreNames.contains(ACTIVE_CHECKPOINT_STORE)) database.createObjectStore(ACTIVE_CHECKPOINT_STORE, {keyPath: 'sequence'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB could not open'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked by another RouteHeat window'));
  });
}

function markerFromStorage(storage) {
  try {
    const marker = JSON.parse(storage?.getItem(MARKER_KEY) || 'null');
    return marker && typeof marker === 'object' ? marker : null;
  } catch {
    return null;
  }
}

export function createRouteHeatStorage(options = {}) {
  const keys = [...new Set(options.keys || [])];
  const arrayKeys = new Set(options.arrayKeys || []);
  const objectKeys = new Set(options.objectKeys || []);
  const journalLimit = Math.max(5, Math.min(100, Number(options.journalLimit) || 40));
  const activeKey = String(options.activeKey || '');
  const historyKey = String(options.historyKey || '');
  const activeCheckpointLimit = Math.max(6, Math.min(30, Number(options.activeCheckpointLimit) || 16));
  const local = options.localStorage || globalThis.localStorage;
  const indexedDb = options.indexedDB || globalThis.indexedDB;
  const emit = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  const getLogicalClock = typeof options.getLogicalClock === 'function' ? options.getLogicalClock : () => 0;
  let database = null;
  let backend = 'localStorage';
  let sequence = 0;
  let commitQueue = Promise.resolve();
  let initialRecoverySnapshots = [];

  const validateValues = values => {
    if (!values || typeof values !== 'object') return false;
    for (const key of keys) {
      const raw = values[key];
      if (raw == null || raw === '') continue;
      try {
        const parsed = JSON.parse(raw);
        if (arrayKeys.has(key) && !Array.isArray(parsed)) return false;
        if (objectKeys.has(key) && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) return false;
      } catch {
        if (arrayKeys.has(key) || objectKeys.has(key)) return false;
      }
    }
    return true;
  };

  const capture = overrides => Object.fromEntries(keys.map(key => {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) return [key, overrides[key]];
    try { return [key, local?.getItem(key) ?? null]; } catch { return [key, null]; }
  }));

  const apply = values => {
    const failures = [];
    keys.forEach(key => {
      try {
        if (values[key] == null) local?.removeItem(key);
        else local?.setItem(key, values[key]);
      } catch (error) {
        failures.push({key, error});
      }
    });
    return failures;
  };

  const stateRecords = async () => {
    if (!database) return {primary: null, previous: null, activeCurrent: null, journal: [], activeCheckpoints: []};
    const transaction = database.transaction([STATE_STORE, JOURNAL_STORE, ACTIVE_CHECKPOINT_STORE], 'readonly');
    const completed = transactionDone(transaction);
    const state = transaction.objectStore(STATE_STORE);
    const journal = transaction.objectStore(JOURNAL_STORE);
    const activeCheckpoints = transaction.objectStore(ACTIVE_CHECKPOINT_STORE);
    const [primary, previous, activeCurrent, entries, checkpoints] = await Promise.all([
      requestResult(state.get(PRIMARY_KEY)),
      requestResult(state.get(PREVIOUS_KEY)),
      requestResult(state.get(ACTIVE_CURRENT_KEY)),
      requestResult(journal.getAll()),
      requestResult(activeCheckpoints.getAll())
    ]);
    await completed;
    return {
      primary,
      previous,
      activeCurrent,
      journal: (entries || []).sort((first, second) => second.sequence - first.sequence),
      activeCheckpoints: (checkpoints || []).sort((first, second) => second.sequence - first.sequence)
    };
  };

  const activeRouteMeta = raw => {
    if (!activeKey || raw == null || raw === '') return null;
    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || Array.isArray(saved) || saved.endedAt || !saved.id) return null;
      const stops = Array.isArray(saved.stops) ? saved.stops.length : 0;
      const trackPoints = Array.isArray(saved.track) ? saved.track.length : 0;
      const totes = Array.isArray(saved.totes) ? saved.totes.length : 0;
      const phases = Array.isArray(saved.phases) ? saved.phases.length : 0;
      const updatedAt = Math.max(0, Number(saved.draftSavedAt || saved.updatedAt || saved.lastPosition?.timestamp || saved.stops?.at?.(-1)?.timestamp || saved.startedAt) || 0);
      return {routeId: String(saved.id), stops, trackPoints, totes, phases, updatedAt};
    } catch {
      return null;
    }
  };

  const parsedJson = raw => {
    if (typeof raw !== 'string' || !raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const routeIdentity = saved => String(saved?.id || (Number(saved?.startedAt) > 0 ? `started:${Number(saved.startedAt)}` : ''));

  const stopIdentity = stop => String(stop?.id || (Number(stop?.timestamp) > 0 ? `time:${Number(stop.timestamp)}` : ''));

  const compactFallbackCompatible = (preferred, fallback) => {
    const preferredStops = Array.isArray(preferred?.stops) ? preferred.stops : [];
    const fallbackStops = Array.isArray(fallback?.stops) ? fallback.stops : [];
    if (preferredStops.length !== fallbackStops.length) return false;
    const preferredKeys = preferredStops.map(stopIdentity);
    const fallbackKeys = fallbackStops.map(stopIdentity);
    if (preferredKeys.some(key => !key) || fallbackKeys.some(key => !key) || preferredKeys.some((key, index) => key !== fallbackKeys[index])) return false;
    const preferredRevision = Math.max(0, Number(preferred?.revision) || 0);
    const fallbackRevision = Math.max(0, Number(fallback?.revision) || 0);
    return preferredRevision === fallbackRevision;
  };

  const restoreCompactHistoryFields = (preferred, fallback) => {
    if (!preferred || !fallback || typeof preferred !== 'object' || typeof fallback !== 'object') return preferred;
    const restored = {...preferred};
    const compatible = compactFallbackCompatible(preferred, fallback);
    if (compatible && preferred.localMirrorTrackOmitted === true && Array.isArray(fallback.track) && fallback.track.length) {
      restored.track = fallback.track;
      restored.trackBreakTimes = Array.isArray(fallback.trackBreakTimes) ? fallback.trackBreakTimes : [];
      if (Array.isArray(fallback.trackBreaks)) restored.trackBreaks = fallback.trackBreaks;
      const fallbackStops = new Map((fallback.stops || []).map(stop => [stopIdentity(stop), stop]));
      restored.stops = (preferred.stops || []).map(stop => {
        const fallbackIndex = Number(fallbackStops.get(stopIdentity(stop))?.trackIndex);
        return Number.isInteger(fallbackIndex) && fallbackIndex >= 0 ? {...stop, trackIndex: fallbackIndex} : stop;
      });
      delete restored.localMirrorTrackOmitted;
    }
    if (compatible && preferred.localMirrorConnectionSamplesOmitted === true && Array.isArray(fallback.connectionSamples)) {
      restored.connectionSamples = fallback.connectionSamples;
      delete restored.localMirrorConnectionSamplesOmitted;
    }
    if (compatible && preferred.localMirrorNeighborhoodDetailOmitted === true && fallback.neighborhoodSnapshot && typeof fallback.neighborhoodSnapshot === 'object') {
      restored.neighborhoodSnapshot = fallback.neighborhoodSnapshot;
      delete restored.localMirrorNeighborhoodDetailOmitted;
    }
    return restored;
  };

  const mergedHistoryRaw = (preferredRaw, fallbackRaw) => {
    const preferred = parsedJson(preferredRaw);
    const fallback = parsedJson(fallbackRaw);
    if (!Array.isArray(preferred)) return Array.isArray(fallback) ? JSON.stringify(fallback) : preferredRaw;
    if (!Array.isArray(fallback) || !fallback.length) return preferredRaw;
    const fallbackById = new Map(fallback.map(saved => [routeIdentity(saved), saved]).filter(([id]) => id));
    const seen = new Set();
    const merged = preferred.map(saved => {
      const id = routeIdentity(saved);
      if (id) seen.add(id);
      return restoreCompactHistoryFields(saved, fallbackById.get(id));
    });
    fallback.forEach(saved => {
      const id = routeIdentity(saved);
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push(saved);
    });
    merged.sort((first, second) => Number(second?.startedAt || 0) - Number(first?.startedAt || 0)
      || Number(second?.endedAt || 0) - Number(first?.endedAt || 0)
      || routeIdentity(first).localeCompare(routeIdentity(second)));
    return JSON.stringify(merged);
  };

  const newestActiveRaw = (...rawValues) => {
    const candidates = rawValues.map((raw, order) => ({raw, order, meta: activeRouteMeta(raw)})).filter(item => item.meta);
    candidates.sort((first, second) => second.meta.updatedAt - first.meta.updatedAt
      || second.meta.stops - first.meta.stops
      || second.meta.trackPoints - first.meta.trackPoints
      || second.meta.totes - first.meta.totes
      || first.order - second.order);
    return candidates[0]?.raw ?? null;
  };

  const activeCoveredByFinishedHistory = (activeRaw, historyRaw) => {
    const active = parsedJson(activeRaw);
    const history = parsedJson(historyRaw);
    if (!active || !Array.isArray(history)) return false;
    const hasOpenRescue = active.reopenedForRescue === true
      || (Array.isArray(active.phases) && active.phases.some(phase => phase?.type === 'rescue' && !phase?.endedAt));
    const id = routeIdentity(active);
    const activeStops = Array.isArray(active.stops) ? active.stops.length : 0;
    const activeUpdatedAt = Math.max(Number(active.draftSavedAt) || 0, Number(active.updatedAt) || 0, Number(active.startedAt) || 0);
    return history.some(saved => {
      if (!saved?.endedAt || routeIdentity(saved) !== id || (Array.isArray(saved.stops) ? saved.stops.length : 0) < activeStops) return false;
      const finishedUpdatedAt = Math.max(Number(saved.updatedAt) || 0, Number(saved.endedAt) || 0, Number(saved.startedAt) || 0);
      if (hasOpenRescue && activeUpdatedAt > finishedUpdatedAt) return false;
      if (saved.localMirrorTrackOmitted === true && Array.isArray(active.track) && active.track.length) return false;
      if (saved.localMirrorConnectionSamplesOmitted === true && Array.isArray(active.connectionSamples) && active.connectionSamples.length) return false;
      return true;
    });
  };

  const unsupersededActiveRaw = (historyRaw, ...rawValues) => {
    const raw = newestActiveRaw(...rawValues);
    return activeCoveredByFinishedHistory(raw, historyRaw) ? null : raw;
  };

  const checkpointSnapshot = checkpoint => {
    if (!checkpoint || checkpoint.formatVersion !== 1 || !activeKey || typeof checkpoint.activeRaw !== 'string') return null;
    const values = {[activeKey]: checkpoint.activeRaw};
    if (checkpoint.activeChecksum !== routeHeatChecksum(values)) return null;
    return {
      key: `active-${checkpoint.sequence}`,
      formatVersion: 1,
      sequence: checkpoint.sequence,
      committedAt: checkpoint.committedAt,
      logicalClock: checkpoint.logicalClock,
      reason: checkpoint.reason,
      values,
      checksum: checkpoint.activeChecksum,
      activeCheckpoint: true,
      activeMeta: checkpoint.activeMeta || null
    };
  };

  const activeCurrentSnapshot = record => {
    if (record?.cleared === true && record.activeRaw == null && activeKey) {
      const values = {[activeKey]: null};
      if (record.activeChecksum !== routeHeatChecksum(values)) return null;
      return {
        key: ACTIVE_CURRENT_KEY,
        formatVersion: 1,
        sequence: record.sequence,
        committedAt: record.committedAt,
        logicalClock: record.logicalClock,
        reason: record.reason,
        values,
        checksum: record.activeChecksum,
        activeCurrent: true,
        activeCleared: true,
        clearedRouteId: String(record.clearedRouteId || '')
      };
    }
    const snapshot = checkpointSnapshot(record);
    return snapshot ? {...snapshot, key: ACTIVE_CURRENT_KEY, activeCurrent: true} : null;
  };

  const pruneCheckpointStore = (store, currentRouteId = '') => {
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result || []).filter(item => Number.isFinite(Number(item?.sequence))).sort((a, b) => Number(b.sequence) - Number(a.sequence));
      const keep = new Set();
      const routeId = String(currentRouteId || records[0]?.activeMeta?.routeId || '');
      const sameRoute = records.filter(item => String(item?.activeMeta?.routeId || '') === routeId);
      const mostStops = sameRoute.slice().sort((a, b) => Number(b.activeMeta?.stops || 0) - Number(a.activeMeta?.stops || 0) || Number(b.sequence) - Number(a.sequence))[0];
      const richestTrail = sameRoute.slice().sort((a, b) => Number(b.activeMeta?.trackPoints || 0) - Number(a.activeMeta?.trackPoints || 0) || Number(b.sequence) - Number(a.sequence))[0];
      [mostStops, richestTrail].filter(Boolean).forEach(item => keep.add(Number(item.sequence)));
      records.forEach(item => { if (keep.size < activeCheckpointLimit) keep.add(Number(item.sequence)); });
      records.filter(item => !keep.has(Number(item.sequence))).forEach(item => store.delete(Number(item.sequence)));
    };
    request.onerror = () => {};
  };

  const bestValidSnapshot = records => {
    const candidates = [records.primary, records.previous]
      .filter(snapshot => snapshotValid(snapshot, validateValues))
      .sort((first, second) => (Number(second.logicalClock) || 0) - (Number(first.logicalClock) || 0)
        || (Number(second.sequence) || 0) - (Number(first.sequence) || 0));
    return candidates[0] || null;
  };

  const commitNow = async (values, meta = {}) => {
    if (!database) return {backend, committed: false, reason: 'indexeddb-unavailable'};
    const normalized = normalizedValues(values);
    if (!validateValues(normalized)) throw new Error('RouteHeat refused to journal an invalid storage snapshot');
    const snapshot = await new Promise((resolve, reject) => {
      const transaction = database.transaction([STATE_STORE, JOURNAL_STORE, ACTIVE_CHECKPOINT_STORE], 'readwrite');
      const state = transaction.objectStore(STATE_STORE);
      const journal = transaction.objectStore(JOURNAL_STORE);
      const activeCheckpoints = transaction.objectStore(ACTIVE_CHECKPOINT_STORE);
      let nextSnapshot = null;
      const primaryRequest = state.get(PRIMARY_KEY);
      primaryRequest.onerror = () => transaction.abort();
      primaryRequest.onsuccess = () => {
        const primary = primaryRequest.result;
        const nextSequence = Math.max(sequence, Number(primary?.sequence) || 0) + 1;
        nextSnapshot = {
          key: PRIMARY_KEY,
          formatVersion: 1,
          sequence: nextSequence,
          committedAt: Date.now(),
          logicalClock: Math.max(0, Number(meta.logicalClock ?? getLogicalClock(normalized)) || 0),
          reason: String(meta.reason || 'app-checkpoint').slice(0, 80),
          values: normalized,
          checksum: routeHeatChecksum(normalized)
        };
        if (snapshotValid(primary, validateValues)) state.put({...primary, key: PREVIOUS_KEY});
        state.put(nextSnapshot);
        const previousValues = snapshotValid(primary, validateValues) ? primary.values : {};
        const changedKeys = keys.filter(key => previousValues[key] !== normalized[key]);
        journal.put({
          sequence: nextSnapshot.sequence,
          committedAt: nextSnapshot.committedAt,
          logicalClock: nextSnapshot.logicalClock,
          reason: nextSnapshot.reason,
          checksum: nextSnapshot.checksum,
          changedKeys
        });
        const activeRaw = activeKey ? normalized[activeKey] : null;
        const currentActiveMeta = activeRouteMeta(activeRaw);
        if (activeKey && currentActiveMeta) {
          const activeValues = {[activeKey]: activeRaw};
          state.put({
            key: ACTIVE_CURRENT_KEY,
            formatVersion: 1,
            sequence: nextSnapshot.sequence,
            committedAt: nextSnapshot.committedAt,
            logicalClock: nextSnapshot.logicalClock,
            reason: nextSnapshot.reason,
            actionSignature: `${currentActiveMeta.routeId}:${currentActiveMeta.stops}:${currentActiveMeta.trackPoints}:${nextSnapshot.reason}`,
            activeMeta: currentActiveMeta,
            activeRaw,
            activeChecksum: routeHeatChecksum(activeValues)
          });
        } else if (activeKey) {
          const activeValues = {[activeKey]: null};
          state.put({
            key: ACTIVE_CURRENT_KEY,
            formatVersion: 1,
            sequence: nextSnapshot.sequence,
            committedAt: nextSnapshot.committedAt,
            logicalClock: nextSnapshot.logicalClock,
            reason: nextSnapshot.reason,
            cleared: true,
            clearedRouteId: String(meta.clearedRouteId || ''),
            activeMeta: null,
            activeRaw: null,
            activeChecksum: routeHeatChecksum(activeValues)
          });
        }
        const activeMeta = meta.activeCheckpoint ? currentActiveMeta : null;
        if (activeMeta) {
          const activeValues = {[activeKey]: activeRaw};
          activeCheckpoints.put({
            formatVersion: 1,
            sequence: nextSnapshot.sequence,
            committedAt: nextSnapshot.committedAt,
            logicalClock: nextSnapshot.logicalClock,
            reason: nextSnapshot.reason,
            actionSignature: `${activeMeta.routeId}:${activeMeta.stops}:${activeMeta.trackPoints}:${nextSnapshot.reason}`,
            activeMeta,
            activeRaw,
            activeChecksum: routeHeatChecksum(activeValues)
          });
        }
        const keysRequest = journal.getAllKeys();
        keysRequest.onsuccess = () => {
          const journalKeys = (keysRequest.result || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
          journalKeys.slice(0, Math.max(0, journalKeys.length - journalLimit)).forEach(key => journal.delete(key));
        };
        if (activeMeta) pruneCheckpointStore(activeCheckpoints, activeMeta.routeId);
      };
      transaction.oncomplete = () => resolve(nextSnapshot);
      transaction.onabort = () => reject(transaction.error || primaryRequest.error || new Error('IndexedDB transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
    const nextSequence = snapshot.sequence;
    sequence = nextSequence;
    try {
      local?.setItem(MARKER_KEY, JSON.stringify({formatVersion: 1, sequence, committedAt: snapshot.committedAt, logicalClock: snapshot.logicalClock, checksum: snapshot.checksum}));
    } catch {}
    emit({state: 'saved', backend, sequence, at: snapshot.committedAt, reason: snapshot.reason, message: 'Route data protected on this device'});
    return {backend, committed: true, snapshot};
  };

  const commit = (overrides = null, meta = {}) => {
    const values = capture(overrides);
    emit({state: 'saving', backend, message: backend === 'indexedDB' ? 'Protecting route data…' : 'Saving on this device…'});
    commitQueue = commitQueue.catch(() => {}).then(() => commitNow(values, meta)).catch(error => {
      emit({state: 'error', backend, error, message: 'New checkpoint could not be written · keep this route open; earlier verified checkpoints remain safe'});
      throw error;
    });
    return commitQueue;
  };

  const commitActiveNow = async (activeRaw, meta = {}) => {
    if (!database) return {backend, committed: false, reason: 'indexeddb-unavailable'};
    const raw = activeRaw == null || activeRaw === '' ? null : String(activeRaw);
    const activeMeta = activeRouteMeta(raw);
    if (raw != null && !activeMeta) throw new Error('RouteHeat refused to journal an invalid active route');
    const committedAt = Date.now();
    const nextSequence = sequence + 1;
    const reason = String(meta.reason || 'active-route-checkpoint').slice(0, 80);
    const logicalClock = Math.max(0, Number(meta.logicalClock) || activeMeta?.updatedAt || 0);
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([STATE_STORE, ACTIVE_CHECKPOINT_STORE], 'readwrite');
      const state = transaction.objectStore(STATE_STORE);
      const activeCheckpoints = transaction.objectStore(ACTIVE_CHECKPOINT_STORE);
      if (!activeMeta) {
        const activeValues = {[activeKey]: null};
        state.put({
          key: ACTIVE_CURRENT_KEY,
          formatVersion: 1,
          sequence: nextSequence,
          committedAt,
          logicalClock,
          reason,
          cleared: true,
          clearedRouteId: String(meta.clearedRouteId || ''),
          activeMeta: null,
          activeRaw: null,
          activeChecksum: routeHeatChecksum(activeValues)
        });
      } else {
        const activeValues = {[activeKey]: raw};
        const record = {
          key: ACTIVE_CURRENT_KEY,
          formatVersion: 1,
          sequence: nextSequence,
          committedAt,
          logicalClock,
          reason,
          actionSignature: `${activeMeta.routeId}:${activeMeta.stops}:${activeMeta.trackPoints}:${reason}`,
          activeMeta,
          activeRaw: raw,
          activeChecksum: routeHeatChecksum(activeValues)
        };
        state.put(record);
        if (meta.activeCheckpoint) {
          const {key, ...checkpoint} = record;
          activeCheckpoints.put(checkpoint);
          pruneCheckpointStore(activeCheckpoints, activeMeta.routeId);
        }
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB active-route transaction aborted'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB active-route transaction failed'));
    });
    sequence = nextSequence;
    emit({state: 'saved', backend, sequence, at: committedAt, reason, message: activeMeta ? 'Live route checkpoint protected on this device' : 'Finished route checkpoint cleared'});
    return {backend, committed: true, activeMeta, sequence, committedAt};
  };

  const commitActive = (activeRaw, meta = {}) => {
    emit({state: 'saving', backend, message: backend === 'indexedDB' ? 'Protecting live route…' : 'Saving live route…'});
    commitQueue = commitQueue.catch(() => {}).then(() => commitActiveNow(activeRaw, meta)).catch(error => {
      emit({state: 'error', backend, error, message: 'Live route checkpoint could not be written · keep RouteHeat open; the earlier verified checkpoint remains safe'});
      throw error;
    });
    return commitQueue;
  };

  const init = async () => {
    const localValues = capture();
    const localValid = validateValues(localValues);
    if (!indexedDb) {
      emit({state: 'degraded', backend, message: 'Device backup unavailable · local save still active'});
      return {backend, source: 'localStorage', recovered: false, localValid};
    }
    try {
      database = await openDatabase(indexedDb);
      backend = 'indexedDB';
      const records = await stateRecords();
      initialRecoverySnapshots=[records.primary,records.previous,activeCurrentSnapshot(records.activeCurrent),...records.activeCheckpoints.map(checkpointSnapshot)].filter(snapshot=>snapshotValid(snapshot,validateValues));
      const primary = bestValidSnapshot(records);
      sequence = Math.max(0, Number(primary?.sequence) || 0, Number(records.activeCurrent?.sequence) || 0, ...(records.activeCheckpoints || []).map(item => Number(item?.sequence) || 0));
      const localChecksum = routeHeatChecksum(localValues);
      const localClock = Math.max(0, Number(getLogicalClock(localValues)) || 0);
      const marker = markerFromStorage(local);
      const activeCurrent = activeCurrentSnapshot(records.activeCurrent);
      const activeCurrentRaw = activeCurrent?.activeCleared ? null : activeCurrent?.values?.[activeKey] ?? null;
      const clearedAt = activeCurrent?.activeCleared ? Math.max(Number(activeCurrent.committedAt) || 0, Number(activeCurrent.logicalClock) || 0) : 0;
      const eligibleAfterClear = raw => {
        if (!clearedAt) return raw;
        const meta = activeRouteMeta(raw);
        return meta && meta.updatedAt > clearedAt ? raw : null;
      };
      if (!primary) {
        const migrationHistory = historyKey ? localValues[historyKey] : null;
        const migrationValues = normalizedValues({...localValues, ...(activeKey ? {[activeKey]: unsupersededActiveRaw(migrationHistory, activeCurrentRaw, eligibleAfterClear(localValues[activeKey]))} : {})});
        if (localValid && validateValues(migrationValues)) {
          const snapshot = await commitNow(migrationValues, {reason: 'legacy-localStorage-migration', logicalClock: Math.max(localClock, activeRouteMeta(migrationValues[activeKey])?.updatedAt || 0)});
          const failures = apply(migrationValues);
          emit({state: 'saved', backend, sequence, message: 'Device protection ready'});
          return {backend, source: 'migration', recovered: false, localValid: true, failures, snapshot};
        }
        emit({state: 'degraded', backend, sequence, message: 'No verified device copy yet · local route data needs attention'});
        return {backend, source: 'invalid-local-without-recovery', recovered: false, localValid: false};
      }
      if (!localValid) {
        const recoveredValues = normalizedValues({...primary.values, ...(activeKey ? {[activeKey]: unsupersededActiveRaw(primary.values[historyKey], activeCurrentRaw, eligibleAfterClear(primary.values[activeKey]))} : {})});
        let snapshot = primary;
        if (routeHeatChecksum(recoveredValues) !== primary.checksum) snapshot = await commitNow(recoveredValues, {reason: 'invalid-local-active-merge', logicalClock: Math.max(Number(primary.logicalClock) || 0, activeRouteMeta(recoveredValues[activeKey])?.updatedAt || 0)});
        const failures = apply(recoveredValues);
        emit({state: failures.length ? 'degraded' : 'recovered', backend, sequence: primary.sequence, message: failures.length ? 'Recovery copy is safe, but the local mirror is full' : 'Recovered the last verified device copy'});
        return {backend, source: 'indexeddb-recovery', recovered: !failures.length, failures, snapshot};
      }
      const primaryClock = Math.max(0, Number(primary.logicalClock) || 0);
      const markerMatchesLocal = marker?.checksum === localChecksum;
      const markerMatchesPrimary = marker?.checksum === primary.checksum;
      const preferPrimary = (primaryClock > localClock || (primaryClock === localClock && markerMatchesPrimary)) && !markerMatchesLocal;
      const preferred = preferPrimary ? primary.values : localValues;
      const fallback = preferPrimary ? localValues : primary.values;
      const reconciledObject = Object.fromEntries(keys.map(key => {
        if (key === activeKey) return [key, null];
        if (key === historyKey) return [key, mergedHistoryRaw(preferred[key], fallback[key])];
        return [key, preferred[key] == null && fallback[key] != null ? fallback[key] : preferred[key]];
      }));
      if (activeKey) reconciledObject[activeKey] = unsupersededActiveRaw(reconciledObject[historyKey], activeCurrentRaw, eligibleAfterClear(localValues[activeKey]), eligibleAfterClear(primary.values[activeKey]));
      const reconciled = normalizedValues(reconciledObject);
      if (!validateValues(reconciled)) throw new Error('RouteHeat could not reconcile a valid device snapshot');
      const reconciledChecksum = routeHeatChecksum(reconciled);
      let snapshot = primary;
      if (reconciledChecksum !== primary.checksum) snapshot = await commitNow(reconciled, {reason: preferPrimary ? 'durable-state-active-merge' : 'valid-newer-local-reconciliation', logicalClock: Math.max(primaryClock, localClock, activeRouteMeta(reconciled[activeKey])?.updatedAt || 0)});
      const failures = apply(reconciled);
      const changed = reconciledChecksum !== localChecksum;
      emit({state: failures.length ? 'degraded' : changed ? 'recovered' : 'saved', backend, sequence: snapshot.sequence, message: failures.length ? 'Full device copy is safe, but the compact browser mirror is full' : changed ? 'Reconciled the newest verified route data' : 'Device protection ready'});
      return {backend, source: preferPrimary ? 'indexeddb-newer' : reconciledChecksum === primary.checksum ? 'verified' : 'local-newer', recovered: changed&&!failures.length, failures, snapshot};
    } catch (error) {
      database?.close();
      database = null;
      backend = 'localStorage';
      emit({state: 'degraded', backend, error, message: 'Device backup unavailable · local save still active'});
      return {backend, source: 'fallback', recovered: false, error, localValid};
    }
  };

  const recoverLatest = async () => {
    if (!database) return {recovered: false, reason: 'indexeddb-unavailable'};
    const records = await stateRecords();
    const snapshot = bestValidSnapshot(records);
    if (!snapshot) return {recovered: false, reason: 'no-valid-snapshot'};
    const current = capture();
    const currentClock = validateValues(current) ? Math.max(0, Number(getLogicalClock(current)) || 0) : 0;
    if (currentClock > (Number(snapshot.logicalClock) || 0)) return {recovered: false, reason: 'newer-local-state-preserved'};
    const activeCurrent = activeCurrentSnapshot(records.activeCurrent);
    const values = {...snapshot.values};
    if (activeCurrent?.activeCleared && activeKey) {
      const meta = activeRouteMeta(values[activeKey]);
      const clearedAt = Math.max(Number(activeCurrent.committedAt) || 0, Number(activeCurrent.logicalClock) || 0);
      const sameTarget = !activeCurrent.clearedRouteId || String(meta?.routeId || '') === activeCurrent.clearedRouteId;
      if (meta && sameTarget && (Number(snapshot.sequence) <= Number(activeCurrent.sequence) || meta.updatedAt <= clearedAt)) values[activeKey] = null;
    }
    const failures = apply(values);
    return {recovered: !failures.length, failures, snapshot: {...snapshot, values: normalizedValues(values), checksum: routeHeatChecksum(values)}};
  };

  const recoverySnapshots = async () => {
    const current=database?await stateRecords():{primary:null,previous:null,activeCurrent:null,activeCheckpoints:[]};
    const activeSnapshots=(current.activeCheckpoints||[]).map(checkpointSnapshot);
    const activeCurrent=activeCurrentSnapshot(current.activeCurrent),clearedAt=activeCurrent?.activeCleared?Math.max(Number(activeCurrent.committedAt)||0,Number(activeCurrent.logicalClock)||0):0,clearedSequence=activeCurrent?.activeCleared?Number(activeCurrent.sequence)||0:0,clearedRouteId=activeCurrent?.activeCleared?String(activeCurrent.clearedRouteId||''):'';
    const recoverable=snapshot=>{if(!snapshotValid(snapshot,validateValues))return false;const meta=activeRouteMeta(snapshot?.values?.[activeKey]);if(!meta)return false;if(!clearedAt)return true;const sameTarget=!clearedRouteId||meta.routeId===clearedRouteId;return !sameTarget||Number(snapshot.sequence)>clearedSequence&&meta.updatedAt>clearedAt;};
    const snapshots=[...initialRecoverySnapshots,current.primary,current.previous,activeCurrent,...activeSnapshots].filter(recoverable);
    const unique=new Map();
    snapshots.forEach(snapshot=>unique.set(`${snapshot.sequence}:${snapshot.checksum}`,snapshot));
    return [...unique.values()].sort((first,second)=>(Number(second.logicalClock)||0)-(Number(first.logicalClock)||0)||(Number(second.sequence)||0)-(Number(first.sequence)||0));
  };

  const discardActiveCheckpointsNow = async routeId => {
    const target = String(routeId || '');
    if (!target) return {discarded: 0, reason: 'route-id-required'};
    const belongsToTarget = snapshot => {
      try {
        const raw = snapshot?.values?.[activeKey];
        return typeof raw === 'string' && String(JSON.parse(raw)?.id || '') === target;
      } catch {
        return false;
      }
    };
    initialRecoverySnapshots = initialRecoverySnapshots.filter(snapshot => !belongsToTarget(snapshot));
    if (!database) return {discarded: 0, reason: 'indexeddb-unavailable'};
    let discarded = 0;
    let clearedCurrent = false;
    const committedAt = Date.now();
    const nextSequence = sequence + 1;
    const transaction = database.transaction([STATE_STORE, ACTIVE_CHECKPOINT_STORE], 'readwrite');
    const completed = transactionDone(transaction);
    const state = transaction.objectStore(STATE_STORE);
    const store = transaction.objectStore(ACTIVE_CHECKPOINT_STORE);
    const activeRequest = state.get(ACTIVE_CURRENT_KEY);
    activeRequest.onsuccess = () => {
      const current = activeRequest.result;
      const currentRouteId = String(current?.activeMeta?.routeId || '');
      const clearedRouteId = String(current?.clearedRouteId || '');
      if (current && currentRouteId && currentRouteId !== target) return;
      if (current?.cleared === true && clearedRouteId && clearedRouteId !== target) return;
      const activeValues = {[activeKey]: null};
      state.put({
        key: ACTIVE_CURRENT_KEY,
        formatVersion: 1,
        sequence: nextSequence,
        committedAt,
        logicalClock: committedAt,
        reason: 'active-route-discarded',
        cleared: true,
        clearedRouteId: target,
        activeMeta: null,
        activeRaw: null,
        activeChecksum: routeHeatChecksum(activeValues)
      });
      clearedCurrent = true;
    };
    const request = store.getAll();
    request.onerror = () => transaction.abort();
    request.onsuccess = () => {
      (request.result || []).forEach(checkpoint => {
        if (String(checkpoint?.activeMeta?.routeId || '') !== target) return;
        discarded += 1;
        store.delete(checkpoint.sequence);
      });
    };
    await completed;
    if (clearedCurrent) sequence = Math.max(sequence, nextSequence);
    return {discarded, clearedCurrent};
  };

  const discardActiveCheckpoints = routeId => {
    commitQueue = commitQueue.catch(() => {}).then(() => discardActiveCheckpointsNow(routeId));
    return commitQueue;
  };

  const activeSnapshot = async () => {
    if (!database) return null;
    const records = await stateRecords();
    const current = activeCurrentSnapshot(records.activeCurrent);
    return current?.activeCleared ? null : snapshotValid(current, validateValues) ? current : null;
  };

  const utf8Bytes = value => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    try { return new TextEncoder().encode(text).byteLength; } catch { return text.length * 2; }
  };

  const stats = async () => {
    if (!database) return {backend, logicalBytes: 0, stateBytes: 0, checkpointBytes: 0, journalBytes: 0, checkpoints: 0, journalEntries: 0};
    const records = await stateRecords();
    const stateBytes = [records.primary, records.previous, records.activeCurrent].filter(Boolean).reduce((total, item) => total + utf8Bytes(item), 0);
    const checkpointBytes = (records.activeCheckpoints || []).reduce((total, item) => total + utf8Bytes(item), 0);
    const journalBytes = (records.journal || []).reduce((total, item) => total + utf8Bytes(item), 0);
    return {backend, logicalBytes: stateBytes + checkpointBytes + journalBytes, stateBytes, checkpointBytes, journalBytes, checkpoints: records.activeCheckpoints.length, journalEntries: records.journal.length};
  };

  const optimize = async () => {
    if (!database) return {optimized: false, reason: 'indexeddb-unavailable'};
    const records = await stateRecords();
    const activeRouteId = String(records.activeCurrent?.activeMeta?.routeId || '');
    let removedCheckpoints = 0;
    let removedJournal = 0;
    const transaction = database.transaction([JOURNAL_STORE, ACTIVE_CHECKPOINT_STORE], 'readwrite');
    const completed = transactionDone(transaction);
    const journal = transaction.objectStore(JOURNAL_STORE);
    const checkpoints = transaction.objectStore(ACTIVE_CHECKPOINT_STORE);
    const keepCheckpointSequences = new Set((records.activeCheckpoints || []).filter(item => activeRouteId && String(item?.activeMeta?.routeId || '') === activeRouteId).slice(0, 6).map(item => Number(item.sequence)));
    (records.activeCheckpoints || []).forEach(item => { if (!keepCheckpointSequences.has(Number(item.sequence))) { checkpoints.delete(item.sequence); removedCheckpoints += 1; } });
    (records.journal || []).slice(20).forEach(item => { journal.delete(item.sequence); removedJournal += 1; });
    await completed;
    initialRecoverySnapshots = initialRecoverySnapshots.filter(snapshot => !snapshot.activeCheckpoint || activeRouteId && String(snapshot.activeMeta?.routeId || '') === activeRouteId);
    return {optimized: true, removedCheckpoints, removedJournal};
  };

  const close = () => { database?.close(); database = null; };

  return {
    init,
    commit,
    commitActive,
    capture,
    recoverLatest,
    recoverySnapshots,
    activeSnapshot,
    discardActiveCheckpoints,
    stats,
    optimize,
    close,
    validateValues,
    checksum: routeHeatChecksum,
    get backend() { return backend; },
    get sequence() { return sequence; }
  };
}
