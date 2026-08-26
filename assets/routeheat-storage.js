const DB_NAME = 'routeheat-storage';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const JOURNAL_STORE = 'journal';
const PRIMARY_KEY = 'primary';
const PREVIOUS_KEY = 'previous';
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
    if (!database) return {primary: null, previous: null, journal: []};
    const transaction = database.transaction([STATE_STORE, JOURNAL_STORE], 'readonly');
    const completed = transactionDone(transaction);
    const state = transaction.objectStore(STATE_STORE);
    const journal = transaction.objectStore(JOURNAL_STORE);
    const [primary, previous, entries] = await Promise.all([
      requestResult(state.get(PRIMARY_KEY)),
      requestResult(state.get(PREVIOUS_KEY)),
      requestResult(journal.getAll())
    ]);
    await completed;
    return {primary, previous, journal: (entries || []).sort((first, second) => second.sequence - first.sequence)};
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
      const transaction = database.transaction([STATE_STORE, JOURNAL_STORE], 'readwrite');
      const state = transaction.objectStore(STATE_STORE);
      const journal = transaction.objectStore(JOURNAL_STORE);
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
        const keysRequest = journal.getAllKeys();
        keysRequest.onsuccess = () => {
          const journalKeys = (keysRequest.result || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
          journalKeys.slice(0, Math.max(0, journalKeys.length - journalLimit)).forEach(key => journal.delete(key));
        };
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
      emit({state: 'error', backend, error, message: 'Durable route save needs attention'});
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
      initialRecoverySnapshots=[records.primary,records.previous].filter(snapshot=>snapshotValid(snapshot,validateValues));
      const primary = bestValidSnapshot(records);
      sequence = Math.max(0, Number(primary?.sequence) || 0);
      const localChecksum = routeHeatChecksum(localValues);
      const localClock = Math.max(0, Number(getLogicalClock(localValues)) || 0);
      const marker = markerFromStorage(local);
      if (!primary) {
        if (localValid) {
          await commitNow(localValues, {reason: 'legacy-localStorage-migration', logicalClock: localClock});
          emit({state: 'saved', backend, sequence, message: 'Device protection ready'});
          return {backend, source: 'migration', recovered: false, localValid: true};
        }
        emit({state: 'degraded', backend, sequence, message: 'No verified device copy yet · local route data needs attention'});
        return {backend, source: 'invalid-local-without-recovery', recovered: false, localValid: false};
      }
      if (!localValid) {
        const failures = apply(primary.values);
        emit({state: failures.length ? 'degraded' : 'recovered', backend, sequence: primary.sequence, message: failures.length ? 'Recovery copy is safe, but the local mirror is full' : 'Recovered the last verified device copy'});
        return {backend, source: 'indexeddb-recovery', recovered: !failures.length, failures, snapshot: primary};
      }
      if (localChecksum === primary.checksum) {
        emit({state: 'saved', backend, sequence: primary.sequence, message: 'Device protection ready'});
        return {backend, source: 'verified', recovered: false, snapshot: primary};
      }
      const primaryClock = Math.max(0, Number(primary.logicalClock) || 0);
      const markerMatchesLocal = marker?.checksum === localChecksum;
      const markerMatchesPrimary = marker?.checksum === primary.checksum;
      if ((primaryClock > localClock || (primaryClock === localClock && markerMatchesPrimary)) && !markerMatchesLocal) {
        const failures = apply(primary.values);
        emit({state: failures.length ? 'degraded' : 'recovered', backend, sequence: primary.sequence, message: failures.length ? 'Newer recovery copy is safe, but the local mirror is full' : 'Recovered a newer verified device checkpoint'});
        return {backend, source: 'indexeddb-newer', recovered: !failures.length, failures, snapshot: primary};
      }
      await commitNow(localValues, {reason: 'valid-newer-local-reconciliation', logicalClock: localClock});
      return {backend, source: 'local-newer', recovered: false, snapshot: primary};
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
    const snapshot = bestValidSnapshot(await stateRecords());
    if (!snapshot) return {recovered: false, reason: 'no-valid-snapshot'};
    const current = capture();
    const currentClock = validateValues(current) ? Math.max(0, Number(getLogicalClock(current)) || 0) : 0;
    if (currentClock > (Number(snapshot.logicalClock) || 0)) return {recovered: false, reason: 'newer-local-state-preserved'};
    const failures = apply(snapshot.values);
    return {recovered: !failures.length, failures, snapshot};
  };

  const recoverySnapshots = async () => {
    const current=database?await stateRecords():{primary:null,previous:null};
    const snapshots=[...initialRecoverySnapshots,current.primary,current.previous].filter(snapshot=>snapshotValid(snapshot,validateValues));
    const unique=new Map();
    snapshots.forEach(snapshot=>unique.set(`${snapshot.sequence}:${snapshot.checksum}`,snapshot));
    return [...unique.values()].sort((first,second)=>(Number(second.logicalClock)||0)-(Number(first.logicalClock)||0)||(Number(second.sequence)||0)-(Number(first.sequence)||0));
  };

  const close = () => { database?.close(); database = null; };

  return {
    init,
    commit,
    capture,
    recoverLatest,
    recoverySnapshots,
    close,
    validateValues,
    checksum: routeHeatChecksum,
    get backend() { return backend; },
    get sequence() { return sequence; }
  };
}
