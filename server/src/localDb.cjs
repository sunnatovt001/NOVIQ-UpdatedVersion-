// Shared Local Database for NOVIQ Development
// Connects Vite dev server (local-telegram.cjs) and the Telegram runner (telegram-runner.mjs)
// through a single file-backed store at node_modules/.cache/noviq-telegram/local-store.json.

const fs = require('node:fs');
const path = require('node:path');

const STORE_DIR = path.resolve(__dirname, '../../node_modules/.cache/noviq-telegram');

function getStoreFile() {
  return process.env.NOVIQ_LOCAL_DB_FILE || path.join(STORE_DIR, 'local-store.json');
}

function ensureStoreDir() {
  const storeFile = getStoreFile();
  const dir = path.dirname(storeFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readStore() {
  const storeFile = getStoreFile();
  try {
    ensureStoreDir();
    if (fs.existsSync(storeFile)) {
      const raw = fs.readFileSync(storeFile, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // If corrupt or missing, start fresh
  }
  return {};
}

function writeStore(data) {
  const storeFile = getStoreFile();
  try {
    ensureStoreDir();
    const tempFile = `${storeFile}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, storeFile);
  } catch (err) {
    // Fallback direct write
    try {
      fs.writeFileSync(storeFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (writeErr) {
      console.warn('[localDb] Write failed:', writeErr.message);
    }
  }
}

function matchValue(docVal, condition) {
  if (condition === undefined) return true;
  if (condition === null) return docVal === null || docVal === undefined;

  // Object condition with operators like $gt, $gte, $lt, $lte, $ne, $in
  if (typeof condition === 'object' && !Array.isArray(condition) && !(condition instanceof Date)) {
    let matches = true;
    for (const [op, opVal] of Object.entries(condition)) {
      if (op === '$gt') {
        const d = docVal instanceof Date ? docVal.getTime() : (new Date(docVal).getTime() || docVal);
        const t = opVal instanceof Date ? opVal.getTime() : (new Date(opVal).getTime() || opVal);
        if (!(d > t)) matches = false;
      } else if (op === '$gte') {
        const d = docVal instanceof Date ? docVal.getTime() : (new Date(docVal).getTime() || docVal);
        const t = opVal instanceof Date ? opVal.getTime() : (new Date(opVal).getTime() || opVal);
        if (!(d >= t)) matches = false;
      } else if (op === '$lt') {
        const d = docVal instanceof Date ? docVal.getTime() : (new Date(docVal).getTime() || docVal);
        const t = opVal instanceof Date ? opVal.getTime() : (new Date(opVal).getTime() || opVal);
        if (!(d < t)) matches = false;
      } else if (op === '$lte') {
        const d = docVal instanceof Date ? docVal.getTime() : (new Date(docVal).getTime() || docVal);
        const t = opVal instanceof Date ? opVal.getTime() : (new Date(opVal).getTime() || opVal);
        if (!(d <= t)) matches = false;
      } else if (op === '$ne') {
        if (docVal === opVal) matches = false;
      } else if (op === '$in') {
        if (!Array.isArray(opVal) || !opVal.includes(docVal)) matches = false;
      } else if (op === '$regex') {
        try {
          const re = new RegExp(opVal, condition.$options || '');
          if (!re.test(String(docVal || ''))) matches = false;
        } catch {
          matches = false;
        }
      }
    }
    return matches;
  }

  // Exact comparison
  if (condition instanceof Date) {
    return new Date(docVal).getTime() === condition.getTime();
  }
  return docVal === condition;
}

function matchDoc(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;

  if (Array.isArray(query.$or)) {
    if (!query.$or.some((subQuery) => matchDoc(doc, subQuery))) return false;
  }

  for (const [key, val] of Object.entries(query)) {
    if (key === '$or') continue;

    if (key === 'tasks.id') {
      const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
      if (!tasks.some((t) => t.id === val)) return false;
      continue;
    }

    if (key.includes('.')) {
      const parts = key.split('.');
      let cur = doc;
      for (const part of parts) {
        cur = cur ? cur[part] : undefined;
      }
      if (!matchValue(cur, val)) return false;
      continue;
    }

    if (!matchValue(doc[key], val)) return false;
  }
  return true;
}

class LocalCollection {
  constructor(name) {
    this.name = name;
  }

  _getItems() {
    const store = readStore();
    return store[this.name] || {};
  }

  _saveItems(items) {
    const store = readStore();
    store[this.name] = items;
    writeStore(store);
  }

  async findOne(query) {
    const items = this._getItems();
    for (const item of Object.values(items)) {
      if (matchDoc(item, query)) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  find(query = {}) {
    const items = this._getItems();
    const results = [];
    for (const item of Object.values(items)) {
      if (matchDoc(item, query)) {
        results.push(JSON.parse(JSON.stringify(item)));
      }
    }
    return {
      async toArray() {
        return results;
      },
    };
  }

  async insertOne(doc) {
    const items = this._getItems();
    const id = String(doc._id || doc.id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const toSave = { ...doc, _id: id };
    items[id] = toSave;
    this._saveItems(items);
    return { insertedId: id };
  }

  async updateOne(filter, update, options = {}) {
    const items = this._getItems();
    for (const [id, item] of Object.entries(items)) {
      if (matchDoc(item, filter)) {
        if (update.$set) {
          for (const [uk, uv] of Object.entries(update.$set)) {
            if (uk.startsWith('tasks.$.')) {
              const taskKey = uk.slice('tasks.$.'.length);
              const targetTaskId = filter['tasks.id'];
              const task = item.tasks?.find((t) => t.id === targetTaskId);
              if (task) task[taskKey] = uv;
            } else if (uk.includes('.')) {
              const parts = uk.split('.');
              let cur = item;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]]) cur[parts[i]] = {};
                cur = cur[parts[i]];
              }
              cur[parts[parts.length - 1]] = uv;
            } else {
              item[uk] = uv;
            }
          }
        }
        if (update.$unset) {
          for (const uk of Object.keys(update.$unset)) {
            delete item[uk];
          }
        }
        if (update.$inc) {
          for (const [ik, iv] of Object.entries(update.$inc)) {
            item[ik] = (Number(item[ik]) || 0) + Number(iv);
          }
        }
        items[id] = item;
        this._saveItems(items);
        return { modifiedCount: 1 };
      }
    }

    if (options.upsert) {
      const newDoc = { ...(filter._id ? { _id: filter._id } : {}), ...(update.$set || {}) };
      await this.insertOne(newDoc);
      return { modifiedCount: 1, upsertedId: newDoc._id };
    }

    return { modifiedCount: 0 };
  }

  async updateMany(filter, update) {
    const items = this._getItems();
    let modifiedCount = 0;
    for (const [id, item] of Object.entries(items)) {
      if (matchDoc(item, filter)) {
        if (update.$set) {
          for (const [uk, uv] of Object.entries(update.$set)) {
            if (uk.includes('.')) {
              const parts = uk.split('.');
              let cur = item;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!cur[parts[i]]) cur[parts[i]] = {};
                cur = cur[parts[i]];
              }
              cur[parts[parts.length - 1]] = uv;
            } else {
              item[uk] = uv;
            }
          }
        }
        if (update.$unset) {
          for (const uk of Object.keys(update.$unset)) {
            delete item[uk];
          }
        }
        if (update.$inc) {
          for (const [ik, iv] of Object.entries(update.$inc)) {
            item[ik] = (Number(item[ik]) || 0) + Number(iv);
          }
        }
        items[id] = item;
        modifiedCount++;
      }
    }
    if (modifiedCount > 0) {
      this._saveItems(items);
    }
    return { modifiedCount };
  }

  async deleteMany(filter = {}) {
    const items = this._getItems();
    let deletedCount = 0;
    const nextItems = {};
    for (const [id, item] of Object.entries(items)) {
      if (matchDoc(item, filter)) {
        deletedCount++;
      } else {
        nextItems[id] = item;
      }
    }
    if (deletedCount > 0) {
      this._saveItems(nextItems);
    }
    return { deletedCount };
  }

  async deleteOne(filter) {
    const items = this._getItems();
    let deletedCount = 0;
    const nextItems = {};
    for (const [id, item] of Object.entries(items)) {
      if (deletedCount === 0 && matchDoc(item, filter)) {
        deletedCount++;
      } else {
        nextItems[id] = item;
      }
    }
    if (deletedCount > 0) {
      this._saveItems(nextItems);
    }
    return { deletedCount };
  }
}

function getLocalDb() {
  return {
    collection(name) {
      return new LocalCollection(name);
    },
  };
}

// Seed default accounts if store is completely uninitialized
function seedDefaultLocalData() {
  const db = getLocalDb();
  const demoUsers = [
    {
      _id: 'demo-student-1',
      displayName: 'Saidamin',
      email: 'student@noviqq.uz',
      streak: 5,
      xp: 450,
      dailyTargetMinutes: 30,
      level: 2,
      levelName: 'Faol Talaba',
      timezone: 'Asia/Tashkent',
      telegramReminders: { dailyStreakSummary: true, taskDeadlines: true, studyReminders: true },
    },
    {
      _id: 'student-local-test',
      displayName: 'Local Test Student',
      email: 'student@noviqq.uz',
      streak: 7,
      xp: 540,
      dailyTargetMinutes: 30,
      level: 2,
      levelName: 'Faol Talaba',
      timezone: 'Asia/Tashkent',
      telegramReminders: { dailyStreakSummary: true, taskDeadlines: true, studyReminders: true },
    },
  ];

  for (const u of demoUsers) {
    db.collection('auth_accounts').updateOne({ _id: u._id }, { $set: u }, { upsert: true });
    db.collection('users').updateOne({ _id: u._id }, { $set: u }, { upsert: true });
    db.collection('planner_plans').updateOne(
      { _id: u._id },
      {
        $set: {
          _id: u._id,
          userId: u._id,
          tasks: [
            { id: 'math-task', title: 'Matematika: Funksiyalar va Hosilalar', minutes: 30, completed: false },
            { id: 'ielts-task', title: 'IELTS Reading Passage 3', minutes: 25, completed: false },
          ],
        },
      },
      { upsert: true }
    );
  }
}

seedDefaultLocalData();

module.exports = {
  getLocalDb,
  get STORE_FILE() {
    return getStoreFile();
  },
  getStoreFile,
  seedDefaultLocalData,
};
