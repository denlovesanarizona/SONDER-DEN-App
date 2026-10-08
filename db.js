// db.js
// Local-first storage: IndexedDB with a versioned schema.
// Stores:
//   items - journal entries (kind:'journal') and quick logs (kind:'log')
//   meta  - key/value: settings, draft, anything else
// Bump DB_VERSION and add a step in upgrade() when the schema changes;
// existing data is preserved.
const DB_NAME = 'sonder';
const DB_VERSION = 1;

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('ts', 'ts');
        items.createIndex('kind', 'kind');
        db.createObjectStore('meta');
      }
      // if (e.oldVersion < 2) { ...future migrations... }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const db = {
  all: () => run('items', 'readonly', (s) => s.getAll()),
  put: (item) => run('items', 'readwrite', (s) => s.put(item)),
  remove: (id) => run('items', 'readwrite', (s) => s.delete(id)),
  clearItems: () => run('items', 'readwrite', (s) => s.clear()),
  getMeta: (k) => run('meta', 'readonly', (s) => s.get(k)),
  setMeta: (k, v) => run('meta', 'readwrite', (s) => s.put(v, k)),
  delMeta: (k) => run('meta', 'readwrite', (s) => s.delete(k)),
  async persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
    return false;
  }
};
export const ICON_DIR = 'icons/';
export const MOODS = [
  { id: 'quiet', label: 'Quiet', icon: 'lotus-flower.png' },
  { id: 'joyful', label: 'Joyful', icon: 'positivity.png' },
  { id: 'reflective', label: 'Reflective', icon: 'mirror.png' },
  { id: 'calm', label: 'Calm', icon: 'sun.png' },
  { id: 'tired', label: 'Tired', icon: 'sleep.png' }
  // Spare icon: self-assessment.png. To add it as a sixth mood, uncomment:
  // , { id: 'introspective', label: 'Introspective', icon: 'self-assessment.png' }
];
export const moodById = (id) => MOODS.find((m) => m.id === id);
export const TAGS = ['Work', 'Health', 'Social', 'Idea'];

export const DEFAULT_SETTINGS = {
  name: 'DEN',
  since: null,          // set on first run
  theme: 'dark',        // dark | light | system
  reminder: false,
  reminderTime: '20:00',
  lockEnabled: false,
  lockHash: null,
  lockSalt: null
};
