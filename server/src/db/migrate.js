#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { getDb, closeDb } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function migrate({ fresh = false, silent = false } = {}) {
  if (fresh) {
    for (const suffix of ['', '-wal', '-shm']) {
      const file = env.DATABASE_URL + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (!silent) console.log('🗑  Dropped existing database');
  }

  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf-8');
  const db = getDb();
  db.exec(sql);

  if (!silent) {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => row.name);
    console.log(`✅ Schema applied to ${env.DATABASE_URL}`);
    console.log(`   ${tables.length} tables: ${tables.join(', ')}`);
  }
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  migrate({ fresh: process.argv.includes('--fresh') });
  closeDb();
}
