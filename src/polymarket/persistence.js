import fs from 'fs';
import path from 'path';
import {
  sqliteLoad,
  sqlitePersist,
  sqlitePersistSync,
  keyFromPath,
} from './sqliteStore.js';

const DEFAULT_DATA_DIR = path.resolve(import.meta.dirname, '../../data');
const DATA_DIR = process.env.ZINGER_DATA_DIR
  ? path.resolve(process.env.ZINGER_DATA_DIR)
  : DEFAULT_DATA_DIR;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function persist(file, data) {
  void sqlitePersist(keyFromPath(file), data);
}

export function persistSync(file, data) {
  sqlitePersistSync(keyFromPath(file), data);
}

export function load(file, fallback = null) {
  const v = sqliteLoad(keyFromPath(file));
  return v != null ? v : fallback;
}

export function loadWithDefault(file, defaults) {
  const existing = load(file, null);
  if (existing) return existing;
  persistSync(file, defaults);
  return defaults;
}

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export function getDataDir() {
  return DATA_DIR;
}

export const FILES = {
  CONFIG: path.join(DATA_DIR, 'poly_config.json'),
  TRADES: path.join(DATA_DIR, 'poly_trades.json'),
  POSITIONS: path.join(DATA_DIR, 'poly_positions.json'),
  ACTIONS: path.join(DATA_DIR, 'poly_actions.json'),
};
