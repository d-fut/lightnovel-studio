// ===== IndexedDB Layer =====
const DB_NAME = 'TuringScriptDB';
const DB_VERSION = 1;
const STORE = 'project';

let _db = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = e => reject(e.target.error);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = [], values = [];
    store.openCursor().onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        keys.push(cursor.key);
        values.push(cursor.value);
        cursor.continue();
      } else {
        const obj = {};
        keys.forEach((k, i) => obj[k] = values[i]);
        resolve(obj);
      }
    };
  });
}

// ===== Project State Manager =====
const ProjectState = {
  _cache: null,

  async load() {
    if (this._cache) return this._cache;
    const saved = await dbGet('project_state');
    this._cache = saved || this._defaultState();
    return this._cache;
  },

  async save() {
    if (!this._cache) return;
    await dbSet('project_state', this._cache);
  },

  async get(path) {
    const state = await this.load();
    return path.split('.').reduce((o, k) => o?.[k], state);
  },

  async set(path, value) {
    const state = await this.load();
    const keys = path.split('.');
    let obj = state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    await this.save();
  },

  async reset() {
    this._cache = this._defaultState();
    await this.save();
  },

  _defaultState() {
    return {
      meta: {
        name: '無題プロジェクト',
        totalChars: null,
        genre: '',
        theme: '',
        styleSample: '',
        createdAt: Date.now(),
      },
      nouns: [],
      currentStage: 0,
      stageStatus: {}, // 0-9: 'idle'|'done'
      stages: {
        concept: { concepts: [], selectedIndex: null, finalText: '' },
        plot: { raw: '', acts: { act1: '', act2: '', act3: '' } },
        characters: { raw: '', list: [] },
        chapters: { raw: '', list: [] },
        drafts: {}, // chapterIndex: { draft, summary }
        consistency: { raw: '', issues: [] },
        revision: { raw: '' },
        polish: { raw: '' },
        visual: { character: {}, scene: {} },
      }
    };
  }
};
