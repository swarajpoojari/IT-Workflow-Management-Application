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
