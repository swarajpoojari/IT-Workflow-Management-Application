import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { env } from '../config/env.js';

const require = createRequire(import.meta.url);

let db;
let driverName;

function openWithBetterSqlite3(file) {
  const Database = require('better-sqlite3');
  const handle = new Database(file);
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  handle.pragma('busy_timeout = 5000');
  return handle;
}

function openWithNodeSqlite(file) {
  const { DatabaseSync } = require('node:sqlite');
  const handle = new DatabaseSync(file);

  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec('PRAGMA busy_timeout = 5000');

  const plain = (row) => (row === undefined || row === null ? row : { ...row });

  let depth = 0;

  return {
    exec: (sql) => handle.exec(sql),

    prepare(sql) {
      const stmt = handle.prepare(sql);
      return {
        run: (...args) => stmt.run(...args),
        get: (...args) => plain(stmt.get(...args)),
        all: (...args) => stmt.all(...args).map(plain),
      };
    },

    pragma: (statement) => handle.exec(`PRAGMA ${statement}`),

    transaction(fn) {
      return (...args) => {
        const nested = depth > 0;
        const savepoint = `sp_${depth}`;

        handle.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
        depth += 1;
        try {
          const result = fn(...args);
          handle.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
          return result;
        } catch (error) {
          handle.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
          throw error;
        } finally {
          depth -= 1;
        }
      };
    },

    close: () => handle.close(),
  };
}

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(env.DATABASE_URL), { recursive: true });

  const forced = process.env.DB_DRIVER;

  let nativeError;
  if (forced !== 'node-sqlite') {
    try {
      db = openWithBetterSqlite3(env.DATABASE_URL);
      driverName = 'better-sqlite3';
      return db;
    } catch (error) {
      nativeError = error;
    }
  }

  try {
    db = openWithNodeSqlite(env.DATABASE_URL);
    driverName = 'node:sqlite';
    if (nativeError && !env.isTest) {
      console.warn(
        `[db] better-sqlite3 unavailable: ${nativeError.message.split('\n')[0]}`,
      );
      console.warn("[db] using Node's built-in node:sqlite instead — no action needed.");
    }
    return db;
  } catch (fallbackError) {
    throw new Error(
      'Could not open the database with either driver.\n\n' +
        `  better-sqlite3 : ${nativeError ? nativeError.message.split('\n')[0] : 'skipped'}\n` +
        `  node:sqlite    : ${fallbackError.message.split('\n')[0]}\n\n` +
        `node:sqlite requires Node 22.5 or newer; this process is ${process.version}.\n` +
        'Install Node 22 LTS or Node 24, then run `npm install` again.',
    );
  }
}

export const getDriverName = () => driverName ?? 'not opened';

export function transaction(fn) {
  return getDb().transaction(fn)();
}

export function closeDb() {
  if (db) {
    db.close();
    db = undefined;
    driverName = undefined;
  }
}

export function toBool(row, fields) {
  if (!row) return row;
  for (const field of fields) {
    if (field in row) row[field] = Boolean(row[field]);
  }
  return row;
}

export function camelize(row) {
  if (!row) return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

export const camelizeAll = (rows) => rows.map(camelize);
