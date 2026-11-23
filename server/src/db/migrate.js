#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { getDb, closeDb } from './index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const ADDED_COLUMNS = [
  ['projects', 'brd_number', 'TEXT'],
  ['sop_stages', 'stage_type', "TEXT NOT NULL DEFAULT 'GENERIC'"],
  ['sop_stages', 'requires_signoff', 'INTEGER NOT NULL DEFAULT 0'],
  ['project_workflow_stages', 'stage_type', "TEXT NOT NULL DEFAULT 'GENERIC'"],
  ['project_workflow_stages', 'requires_signoff', 'INTEGER NOT NULL DEFAULT 0'],
  // Teams became first-class rows; `users.team` stays for older databases.
  ['users', 'team_id', 'INTEGER REFERENCES teams (id)'],
  ['users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
  ['teams', 'category', 'TEXT'],
  ['teams', 'lead_user_id', 'INTEGER REFERENCES users (id)'],
  ['teams', 'is_active', 'INTEGER NOT NULL DEFAULT 1'],
  // Stage ownership by team: set on the SOP stage, inherited by every project.
  ['sop_stages', 'default_owner_team_id', 'INTEGER REFERENCES teams (id)'],
  ['project_workflow_stages', 'owning_team_id', 'INTEGER REFERENCES teams (id)'],
];

// Indexes over columns added above. They cannot sit in schema.sql, which runs
// before the ALTER TABLEs: on an upgraded database the column is not there yet.
const ADDED_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_users_team ON users (team_id)',
  'CREATE INDEX IF NOT EXISTS idx_pws_team ON project_workflow_stages (owning_team_id)',
];

function syncColumns(db) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!existing.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  for (const statement of ADDED_INDEXES) db.exec(statement);
}

/**
 * Teams became first-class after these tables shipped, so rows created earlier
 * name their team as free text. Match that text to a real team and fill the id
 * in, once — every statement only touches rows that are still NULL, so running
 * it again is a no-op.
 *
 * Published SOP stages are deliberately skipped: an append-only trigger freezes
 * them, and a published version is meant to keep exactly what it was published
 * with. The UI falls back to the legacy label for those.
 */
function backfillTeamOwnership(db) {
  const { teamCount } = db.prepare('SELECT COUNT(*) AS teamCount FROM teams').get();
  if (teamCount === 0) return;

  db.exec(`
    UPDATE sop_stages
       SET default_owner_team_id = (
             SELECT t.id FROM teams t WHERE t.name = sop_stages.default_owner_team COLLATE NOCASE
           )
     WHERE default_owner_team_id IS NULL
       AND default_owner_team IS NOT NULL
       AND sop_version_id IN (SELECT id FROM sop_versions WHERE status = 'DRAFT')
  `);

  // Live boards carry no immutability trigger, so they can be routed straight
  // away — including the ones generated from a now-frozen version.
  db.exec(`
    UPDATE project_workflow_stages
       SET owning_team_id = (
             SELECT t.id
               FROM sop_stages ss
               JOIN teams t ON t.name = ss.default_owner_team COLLATE NOCASE
              WHERE ss.id = project_workflow_stages.sop_stage_id
           )
     WHERE owning_team_id IS NULL
       AND sop_stage_id IS NOT NULL
  `);
}

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
  syncColumns(db);
  backfillTeamOwnership(db);

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
