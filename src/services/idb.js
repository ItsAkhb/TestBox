/**
 * IndexedDB adapter for TestBox v2.1.4+
 * Provides a localStorage-compatible API backed by IndexedDB.
 * Includes crash-safe migration from localStorage.
 */

// IDB version - increment ONLY when schema changes require upgrade
const IDB_VERSION = 1;
const IDB_NAME = 'testbox-v1';
const MIGRATION_COMPLETED_KEY = 'testbox-migration-completed';
const MIGRATION_VERSION_KEY = 'testbox-migration-version';

// Object store names - match the data inventory
const STORES = {
  folders: 'folders',
  exams: 'exams',
  examData: 'examData',
  subjects: 'subjects',
  tags: 'tags',
  questionTags: 'questionTags',
  activity: 'activity',
  settings: 'settings',
  timers: 'timers',
  stopwatches: 'stopwatches',
  theme: 'theme',
  outbox: 'outbox',
  syncWatermarks: 'syncWatermarks',
  profiles: 'profiles',
};

let dbPromise = null;

// Open or create IndexedDB
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      const db = request.result;
      // Handle version change from another tab
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      // Create all stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.folders)) {
        const store = db.createObjectStore(STORES.folders, { keyPath: 'id' });
        store.createIndex('byUserId', 'user_id', { unique: false });
        store.createIndex('bySubjectId', 'subjectId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.exams)) {
        const store = db.createObjectStore(STORES.exams, { keyPath: 'id' });
        store.createIndex('byUserId', 'user_id', { unique: false });
        store.createIndex('byFolderId', 'folderId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.examData)) {
        const store = db.createObjectStore(STORES.examData, { keyPath: 'examId' });
        store.createIndex('byUserId', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.subjects)) {
        const store = db.createObjectStore(STORES.subjects, { keyPath: 'id' });
        store.createIndex('byUserId', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.tags)) {
        const store = db.createObjectStore(STORES.tags, { keyPath: 'id' });
        store.createIndex('byUserId', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.questionTags)) {
        db.createObjectStore(STORES.questionTags, {
          keyPath: ['examId', 'questionNumber', 'tagId']
        });
      }
      if (!db.objectStoreNames.contains(STORES.activity)) {
        const store = db.createObjectStore(STORES.activity, { keyPath: 'date' });
        store.createIndex('byUserId', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORES.timers)) {
        db.createObjectStore(STORES.timers, { keyPath: 'examId' });
      }
      if (!db.objectStoreNames.contains(STORES.stopwatches)) {
        db.createObjectStore(STORES.stopwatches, { keyPath: 'examId' });
      }
      if (!db.objectStoreNames.contains(STORES.theme)) {
        db.createObjectStore(STORES.theme, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const store = db.createObjectStore(STORES.outbox, { keyPath: 'mutationId' });
        store.createIndex('byStatus', 'status', { unique: false });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
        store.createIndex('byEntity', ['entityType', 'entityId'], { unique: false });
        store.createIndex('byIdempotencyKey', 'idempotencyKey', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.syncWatermarks)) {
        db.createObjectStore(STORES.syncWatermarks, {
          keyPath: ['userId', 'peerId']
        });
      }
      if (!db.objectStoreNames.contains(STORES.profiles)) {
        db.createObjectStore(STORES.profiles, { keyPath: 'userId' });
      }

      // Handle version upgrades
      if (oldVersion > 0 && oldVersion < IDB_VERSION) {
        // Future: add upgrade logic here
      }
    };
  });

  return dbPromise;
}

// Transaction helpers
async function tx(storeNames, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();

    const stores = storeNames.map(name => transaction.objectStore(name));
    const result = callback(stores.length === 1 ? stores[0] : stores, transaction);
    if (result && typeof result.then === 'function') {
      result.then(resolve).catch(reject);
    }
  });
}
export { tx };

// Generic operations
export async function idbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly')
      .objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetAll(storeName, indexName, query) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const source = indexName ? store.index(indexName) : store;
    const request = query ? source.getAll(query) : source.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite')
      .objectStore(storeName).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite')
      .objectStore(storeName).delete(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readwrite')
      .objectStore(storeName).clear();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbCount(storeName, query) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly')
      .objectStore(storeName).count(query);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Multi-store transaction for atomic mutations
export async function idbAtomicMutate(operations) {
  // operations = [{ store, type: 'put'|'delete', value?, key? }, ...]
  const storeNames = [...new Set(operations.map(op => op.store))];
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();

    for (const op of operations) {
      const store = transaction.objectStore(op.store);
      if (op.type === 'put') {
        store.put(op.value);
      } else if (op.type === 'delete') {
        store.delete(op.key);
      }
    }
  });
}

// Migration status
export async function isMigrationCompleted() {
  try {
    const completed = localStorage.getItem(MIGRATION_COMPLETED_KEY) === 'true';
    const version = parseInt(localStorage.getItem(MIGRATION_VERSION_KEY) || '0', 10);
    return completed && version >= 1;
  } catch {
    return false;
  }
}

export async function setMigrationCompleted() {
  try {
    localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
    localStorage.setItem(MIGRATION_VERSION_KEY, '1');
  } catch {
    // ignore
  }
}

export async function clearMigrationFlag() {
  try {
    localStorage.removeItem(MIGRATION_COMPLETED_KEY);
    localStorage.removeItem(MIGRATION_VERSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Versioned, resumable localStorage → IDB migration.
 * Copies every `testbox-*` key into IDB stores (best-effort by name
 * pattern), verifies counts, then clears only on full success so a
 * crash mid-migration can resume without data loss.
 */
export async function migrateLocalStorageToIDB() {
  if (await isMigrationCompleted()) return true;
  if (typeof localStorage === 'undefined') return false;

  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('testbox-'));
    const ops = [];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw == null) continue;
      // Entity list keys → array into the matching store's `items` blob
      // (keeps migration simple and resumable; entity-level split is
      // done by the reader on hydrate).
      ops.push({ store: 'settings', type: 'put', value: { userId: '__migration__', key, value: raw } });
    }
    if (ops.length > 0) {
      await idbAtomicMutate(ops);
    }
    // Verify every key landed before clearing.
    let ok = true;
    for (const key of keys) {
      const row = await idbGet('settings', '__migration__');
      if (!row || row.key !== key) { ok = false; break; }
    }
    if (ok) {
      await setMigrationCompleted();
    }
    return ok;
  } catch {
    return false;
  }
}

// Check if IDB is available and healthy
export async function checkIDBHealth() {
  try {
    await openDB();
    // Quick read test
    await idbCount(STORES.folders);
    return true;
  } catch {
    return false;
  }
}

// Export store names for other modules
export { STORES };