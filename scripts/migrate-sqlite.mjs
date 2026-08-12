/**
 * One-time migration of existing JSON stores into SQLite.
 *
 * Usage:
 *   node scripts/migrate-sqlite.mjs            # import data/*.json into data/zinger.db
 *   ZINGER_DB_PATH=/tmp/zinger.db node scripts/migrate-sqlite.mjs
 */
import { migrateDir, docCount, DB_PATH } from '../src/polymarket/sqliteStore.js';

const dir = process.env.ZINGER_DATA_DIR || new URL('../data/', import.meta.url).pathname;
const result = migrateDir(dir, { overwrite: true });
console.log(`\nSQLite migration complete`);
console.log(`  DB:          ${DB_PATH}`);
console.log(`  Imported:    ${result.imported}`);
console.log(`  Skipped:     ${result.skipped}`);
console.log(`  Total docs:  ${docCount()}\n`);
