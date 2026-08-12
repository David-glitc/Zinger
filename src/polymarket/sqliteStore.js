/**
 * SQLite-backed persistence for Zinger Core.
 *
 * Uses Node 22's built-in `node:sqlite` (DatabaseSync) so the docker image
 * needs no native module compilation. Mirrors the persistence.js API surface
 * (load / persist / persistSync) keyed by the JSON store's relative path.
 *
 * Enable with ZINGER_SQLITE=1 (or set ZINGER_DB_PATH to the .db file path).
 */
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const DATA_DIR = process.env.ZINGER_DATA_DIR
  ? path.resolve(process.env.ZINGER_DATA_DIR)
  : DEFAULT_DATA_DIR;

export const DB_PATH = process.env.ZINGER_DB_PATH
  ? path.resolve(process.env.ZINGER_DB_PATH)
  : path.join(DATA_DIR, 'zinger.db');

let _db = null;
let _migrated = false;

export function getDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  _db = db;
  ensureAutoMigrate();
  return db;
}

/** One-time import of any existing JSON files left on disk (idempotent). */
function ensureAutoMigrate() {
  if (_migrated) return;
  _migrated = true;
  try {
    if (!fs.existsSync(DATA_DIR)) return;
    const res = migrateDir(DATA_DIR);
    if (res.imported > 0) {
      console.log(`[sqlite] imported ${res.imported} legacy JSON stores into ${DB_PATH}`);
    }
  } catch (err) {
    console.error(`[sqlite] auto-migrate skipped: ${err.message}`);
  }
}

/** Derive the stable sqlite key from an absolute file path. */
export function keyFromPath(file) {
  const abs = path.resolve(String(file || ''));
  if (abs.startsWith(DATA_DIR + path.sep)) {
    return abs.slice(DATA_DIR.length + 1);
  }
  return path.basename(abs);
}

export function sqliteLoad(key) {
  const row = getDb()
    .prepare('SELECT value FROM docs WHERE key = ?')
    .get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function sqlitePersistSync(key, data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO docs (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(key, JSON.stringify(data), Date.now());
}

export async function sqlitePersist(key, data) {
  sqlitePersistSync(key, data);
}

export function sqliteDelete(key) {
  getDb().prepare('DELETE FROM docs WHERE key = ?').run(key);
}

/**
 * Drop-in helpers for modules that historically read/wrote JSON with fs directly.
 * SQLite is the only persistence backend now — the docs table is keyed by the
 * file's path relative to the data dir, so call sites keep their filename.
 */
export function loadFileOrStore(file, fallback = null) {
  const v = sqliteLoad(keyFromPath(file));
  return v != null ? v : fallback;
}

export function saveFileOrStore(file, data) {
  sqlitePersistSync(keyFromPath(file), data);
}

/** Import all existing JSON files under a directory into sqlite (idempotent, recursive). */
export function migrateDir(dir = DATA_DIR, { overwrite = false } = {}) {
  if (!fs.existsSync(dir)) return { imported: 0, skipped: 0 };
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO docs (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  const hasRow = db.prepare('SELECT 1 FROM docs WHERE key = ?');
  let imported = 0;
  let skipped = 0;
  const files = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (name.endsWith('.json')) {
        files.push(full);
      }
    }
  })(dir);
  for (const file of files) {
    const key = keyFromPath(file);
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      if (!overwrite && hasRow.get(key)) {
        skipped += 1;
        continue;
      }
      const existing = db.prepare('SELECT value FROM docs WHERE key = ?').get(key);
      if (existing && existing.value === raw) {
        skipped += 1;
        continue;
      }
      upsert.run(key, raw, Date.now());
      imported += 1;
    } catch (err) {
      console.error(`[sqlite] migrate ${key}: ${err.message}`);
    }
  }
  return { imported, skipped };
}

/** Total rows currently stored in sqlite. */
export function docCount() {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM docs').get();
  return row?.n ?? 0;
}
