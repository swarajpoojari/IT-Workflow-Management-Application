PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  key             TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  description     TEXT,
  -- Drives the server-side client filter. A role property, not a role name.
  is_client_scope INTEGER NOT NULL DEFAULT 0 CHECK (is_client_scope IN (0, 1)),
  is_system       INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module      TEXT NOT NULL,
  action      TEXT NOT NULL,
  description TEXT,
  UNIQUE (module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles (id)       ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  granted_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  full_name     TEXT    NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES roles (id),
  team          TEXT,
  client_name   TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_role   ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users (is_active);

-- Rotation chain: replaced_by links each token to its successor.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  family_id  TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  revoked_at TEXT,
  replaced_by INTEGER REFERENCES refresh_tokens (id),
  user_agent TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens (family_id);

CREATE TABLE IF NOT EXISTS sop_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT,
  category    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by  INTEGER REFERENCES users (id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One DRAFT per template; PUBLISHED rows are never written again.
CREATE TABLE IF NOT EXISTS sop_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL REFERENCES sop_templates (id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  change_note  TEXT,
  published_at TEXT,
  published_by INTEGER REFERENCES users (id),
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_sopver_template_status ON sop_versions (template_id, status);

CREATE TABLE IF NOT EXISTS sop_stages (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  sop_version_id        INTEGER NOT NULL REFERENCES sop_versions (id) ON DELETE CASCADE,
  name                  TEXT    NOT NULL,
  description           TEXT,
  sequence              INTEGER NOT NULL,
  client_visible        INTEGER NOT NULL DEFAULT 1 CHECK (client_visible IN (0, 1)),  -- hidden stages never reach a client
  requires_document     INTEGER NOT NULL DEFAULT 0 CHECK (requires_document IN (0, 1)),
  -- GENERIC | TESTING | DEVELOPMENT | UAT. TESTING stages carry the bug loop.
  stage_type            TEXT    NOT NULL DEFAULT 'GENERIC',
  requires_signoff      INTEGER NOT NULL DEFAULT 0 CHECK (requires_signoff IN (0, 1)),
  expected_duration_days INTEGER,
  default_owner_team    TEXT,
  created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sop_version_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_sopstage_version ON sop_stages (sop_version_id);

CREATE TABLE IF NOT EXISTS projects (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  description     TEXT,
  client_name     TEXT    NOT NULL,
  brd_number      TEXT,
  sop_template_id INTEGER NOT NULL REFERENCES sop_templates (id),
  sop_version_id  INTEGER NOT NULL REFERENCES sop_versions (id),  -- frozen at creation
  owner_id        INTEGER REFERENCES users (id),
  status          TEXT    NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  start_date      TEXT,
  target_end_date TEXT,
  created_by      INTEGER REFERENCES users (id),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_sopver ON projects (sop_version_id);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects (client_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_brd ON projects (brd_number) WHERE brd_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_members (
  project_id      INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
  role_in_project TEXT    NOT NULL DEFAULT 'MEMBER',
  added_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_user ON project_members (user_id);

-- Auto-generated at project creation. Presentation fields are snapshotted.
CREATE TABLE IF NOT EXISTS project_workflow_stages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id        INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  sop_stage_id      INTEGER REFERENCES sop_stages (id),
  name              TEXT    NOT NULL,
  description       TEXT,
  sequence          INTEGER NOT NULL,
  client_visible    INTEGER NOT NULL DEFAULT 1 CHECK (client_visible IN (0, 1)),
  requires_document INTEGER NOT NULL DEFAULT 0 CHECK (requires_document IN (0, 1)),
  stage_type        TEXT    NOT NULL DEFAULT 'GENERIC',
  requires_signoff  INTEGER NOT NULL DEFAULT 0 CHECK (requires_signoff IN (0, 1)),
  status            TEXT    NOT NULL DEFAULT 'NOT_STARTED'
                            CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED')),
  assigned_to       INTEGER REFERENCES users (id),
  due_date          TEXT,
  started_at        TEXT,
  completion_date   TEXT,  -- required when COMPLETED
  blocker           TEXT,  -- required when BLOCKED
  hold_reason       TEXT,  -- required when ON_HOLD
  remarks           TEXT,
  updated_by        INTEGER REFERENCES users (id),
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_pws_project  ON project_workflow_stages (project_id);
CREATE INDEX IF NOT EXISTS idx_pws_assignee ON project_workflow_stages (assigned_to, status);

-- Append-only: one row per accepted status transition.
CREATE TABLE IF NOT EXISTS stage_status_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_stage_id INTEGER NOT NULL REFERENCES project_workflow_stages (id) ON DELETE CASCADE,
  from_status      TEXT,
  to_status        TEXT    NOT NULL,
  remarks          TEXT,
  blocker          TEXT,
  hold_reason      TEXT,
  completion_date  TEXT,
  changed_by       INTEGER NOT NULL REFERENCES users (id),
  changed_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_stage ON stage_status_history (project_stage_id, changed_at);

CREATE TABLE IF NOT EXISTS stage_documents (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_stage_id INTEGER NOT NULL REFERENCES project_workflow_stages (id) ON DELETE CASCADE,
  file_name        TEXT    NOT NULL,
  file_url         TEXT    NOT NULL,
  doc_type         TEXT    NOT NULL DEFAULT 'FILE' CHECK (doc_type IN ('FILE', 'LINK')),
  version          INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  uploaded_by      INTEGER NOT NULL REFERENCES users (id),
  uploaded_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_stage ON stage_documents (project_stage_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users (id),
  actor_email TEXT,
  actor_role  TEXT,
  entity_type TEXT    NOT NULL,
  entity_id   TEXT,
  action      TEXT    NOT NULL,
  summary     TEXT,
  old_value   TEXT,
  new_value   TEXT,
  ip_address  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity  ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_logs (actor_id);

-- Immutability enforced by the database, not by convention.
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only: DELETE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS stage_status_history_no_update
BEFORE UPDATE ON stage_status_history
BEGIN
  SELECT RAISE(ABORT, 'stage_status_history is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS sop_stages_frozen_when_published
BEFORE UPDATE ON sop_stages
WHEN (SELECT status FROM sop_versions WHERE id = OLD.sop_version_id) <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'SOP_VERSION_IMMUTABLE: stages of a published version cannot be modified');
END;

CREATE TRIGGER IF NOT EXISTS sop_stages_frozen_insert
BEFORE INSERT ON sop_stages
WHEN (SELECT status FROM sop_versions WHERE id = NEW.sop_version_id) <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'SOP_VERSION_IMMUTABLE: stages cannot be added to a published version');
END;

CREATE TRIGGER IF NOT EXISTS sop_stages_frozen_delete
BEFORE DELETE ON sop_stages
WHEN (SELECT status FROM sop_versions WHERE id = OLD.sop_version_id) <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'SOP_VERSION_IMMUTABLE: stages of a published version cannot be deleted');
END;

-- ── Phase 2 ────────────────────────────────────────────────────────────────

-- Stage-level permissions. Defined per SOP stage, snapshotted per project stage
-- so a live project keeps the grants it was created with.
CREATE TABLE IF NOT EXISTS sop_stage_permissions (
  sop_stage_id INTEGER NOT NULL REFERENCES sop_stages (id) ON DELETE CASCADE,
  role_id      INTEGER NOT NULL REFERENCES roles (id)      ON DELETE CASCADE,
  action       TEXT    NOT NULL,
  PRIMARY KEY (sop_stage_id, role_id, action)
);

CREATE TABLE IF NOT EXISTS project_stage_permissions (
  project_stage_id INTEGER NOT NULL REFERENCES project_workflow_stages (id) ON DELETE CASCADE,
  role_id          INTEGER NOT NULL REFERENCES roles (id)                   ON DELETE CASCADE,
  action           TEXT    NOT NULL,
  PRIMARY KEY (project_stage_id, role_id, action)
);

CREATE INDEX IF NOT EXISTS idx_psp_stage ON project_stage_permissions (project_stage_id, role_id);

-- QA <-> Development loop. A TESTING stage cannot complete while any bug here
-- is not CLOSED; the guard lives in stages.service.
CREATE TABLE IF NOT EXISTS bugs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER NOT NULL REFERENCES projects (id)                ON DELETE CASCADE,
  project_stage_id INTEGER NOT NULL REFERENCES project_workflow_stages (id) ON DELETE CASCADE,
  reference        TEXT    NOT NULL,
  title            TEXT    NOT NULL,
  description      TEXT,
  severity         TEXT    NOT NULL DEFAULT 'MEDIUM'
                           CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status           TEXT    NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN', 'IN_PROGRESS', 'FIXED', 'RETEST', 'CLOSED', 'REOPENED')),
  raised_by        INTEGER NOT NULL REFERENCES users (id),
  assigned_to      INTEGER REFERENCES users (id),
  resolution_note  TEXT,
  reopen_count     INTEGER NOT NULL DEFAULT 0,
  closed_at        TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, reference)
);

CREATE INDEX IF NOT EXISTS idx_bugs_stage  ON bugs (project_stage_id, status);
CREATE INDEX IF NOT EXISTS idx_bugs_assignee ON bugs (assigned_to, status);

-- Append-only trail of the loop.
CREATE TABLE IF NOT EXISTS bug_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  bug_id      INTEGER NOT NULL REFERENCES bugs (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT    NOT NULL,
  note        TEXT,
  actor_id    INTEGER NOT NULL REFERENCES users (id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bug_events ON bug_events (bug_id, created_at);

CREATE TRIGGER IF NOT EXISTS bug_events_no_update
BEFORE UPDATE ON bug_events
BEGIN
  SELECT RAISE(ABORT, 'bug_events is append-only: UPDATE is forbidden');
END;

-- Sign-off. A stage flagged requires_signoff cannot complete without an APPROVED row.
CREATE TABLE IF NOT EXISTS stage_signoffs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_stage_id INTEGER NOT NULL REFERENCES project_workflow_stages (id) ON DELETE CASCADE,
  decision         TEXT    NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  note             TEXT,
  signed_by        INTEGER NOT NULL REFERENCES users (id),
  signed_role      TEXT,
  signed_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signoff_stage ON stage_signoffs (project_stage_id, signed_at);

CREATE TRIGGER IF NOT EXISTS stage_signoffs_no_update
BEFORE UPDATE ON stage_signoffs
BEGIN
  SELECT RAISE(ABORT, 'stage_signoffs is append-only: UPDATE is forbidden');
END;

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  body        TEXT,
  entity_type TEXT,
  entity_id   TEXT,
  link        TEXT,
  read_at     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id             INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  theme               TEXT    NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  density             TEXT    NOT NULL DEFAULT 'comfortable' CHECK (density IN ('comfortable', 'compact')),
  notify_assignments  INTEGER NOT NULL DEFAULT 1,
  notify_bugs         INTEGER NOT NULL DEFAULT 1,
  notify_signoffs     INTEGER NOT NULL DEFAULT 1,
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_by INTEGER REFERENCES users (id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Unauthenticated BRD lookups are recorded so abuse is visible.
CREATE TABLE IF NOT EXISTS brd_access_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  brd_number TEXT NOT NULL,
  found      INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brd_log ON brd_access_log (created_at);
