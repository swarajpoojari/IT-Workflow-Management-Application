import { getDb, camelize, camelizeAll } from '../db/index.js';
import { ACTIVE_STAGE_STATUSES } from '../config/constants.js';

const cast = (row) => {
  if (!row) return null;
  const out = camelize(row);
  if ('isActive' in out) out.isActive = Boolean(out.isActive);
  if ('isClientScope' in out) out.isClientScope = Boolean(out.isClientScope);
  if ('mustChangePassword' in out) out.mustChangePassword = Boolean(out.mustChangePassword);
  return out;
};

const SELECT_WITH_ROLE = `
  SELECT u.id, u.email, u.full_name, u.client_name, u.is_active,
         u.must_change_password, u.created_at, u.updated_at,
         u.role_id, r.key AS role_key, r.name AS role_name, r.is_client_scope,
         u.team_id, tm.name AS team_name,
         -- Falls back to the legacy free-text label for rows created before teams.
         COALESCE(tm.name, u.team) AS team
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN teams tm ON tm.id = u.team_id`;

export const userModel = {
  findById(id) {
    return cast(getDb().prepare(`${SELECT_WITH_ROLE} WHERE u.id = ?`).get(id));
  },

  findByEmail(email) {
    return cast(getDb().prepare(`${SELECT_WITH_ROLE} WHERE u.email = ?`).get(email));
  },

  findByEmailWithSecret(email) {
    return cast(
      getDb()
        .prepare(`${SELECT_WITH_ROLE.replace('SELECT u.id,', 'SELECT u.password_hash, u.id,')} WHERE u.email = ?`)
        .get(email),
    );
  },

  list({ search, roleId, teamId, isActive, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = {};
    if (search) {
      where.push('(u.full_name LIKE @search OR u.email LIKE @search)');
      params.search = `%${search}%`;
    }
    if (roleId) {
      where.push('u.role_id = @roleId');
      params.roleId = roleId;
    }
    if (teamId) {
      where.push('u.team_id = @teamId');
      params.teamId = teamId;
    }
    if (isActive !== undefined) {
      where.push('u.is_active = @isActive');
      params.isActive = isActive ? 1 : 0;
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const rows = getDb()
      .prepare(`${SELECT_WITH_ROLE}${clause} ORDER BY u.full_name LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset });
    const { total } = getDb()
      .prepare(
        `SELECT COUNT(*) AS total
           FROM users u
           JOIN roles r ON r.id = u.role_id
           LEFT JOIN teams tm ON tm.id = u.team_id${clause}`,
      )
      .get(params);

    return { items: rows.map(cast), total };
  },

  create({
    email, passwordHash, fullName, roleId, teamId = null, team = null,
    clientName = null, isActive = true, mustChangePassword = false,
  }) {
    const info = getDb()
      .prepare(
        `INSERT INTO users
           (email, password_hash, full_name, role_id, team_id, team, client_name,
            is_active, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        email, passwordHash, fullName, roleId, teamId, team, clientName,
        isActive ? 1 : 0, mustChangePassword ? 1 : 0,
      );
    return userModel.findById(info.lastInsertRowid);
  },

  update(id, patch) {
    const columns = {
      email: 'email',
      fullName: 'full_name',
      roleId: 'role_id',
      team: 'team',
      teamId: 'team_id',
      clientName: 'client_name',
      isActive: 'is_active',
      passwordHash: 'password_hash',
      mustChangePassword: 'must_change_password',
    };
    const sets = [];
    const params = { id };
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = key === 'isActive' || key === 'mustChangePassword'
          ? (patch[key] ? 1 : 0)
          : patch[key];
      }
    }
    if (!sets.length) return userModel.findById(id);
    sets.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return userModel.findById(id);
  },

  activeStageAssignments(userId) {
    const placeholders = ACTIVE_STAGE_STATUSES.map(() => '?').join(', ');
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT s.id            AS stage_id,
                  s.name          AS stage_name,
                  s.status        AS status,
                  s.due_date      AS due_date,
                  p.id            AS project_id,
                  p.code          AS project_code,
                  p.name          AS project_name
             FROM project_workflow_stages s
             JOIN projects p ON p.id = s.project_id
            WHERE s.assigned_to = ?
              AND s.status IN (${placeholders})
              AND p.status IN ('ACTIVE', 'ON_HOLD')
            ORDER BY p.code, s.sequence`,
        )
        .all(userId, ...ACTIVE_STAGE_STATUSES),
    );
  },

  /** Projects this user owns outright — a delete would orphan them. */
  countOwnedProjects(userId) {
    const { total } = getDb()
      .prepare("SELECT COUNT(*) AS total FROM projects WHERE owner_id = ? AND status != 'CANCELLED'")
      .get(userId);
    return total;
  },

  /**
   * Append-only history that names this user in a NOT NULL column. These rows
   * are evidence — a status change, an upload, a sign-off, a bug — and the
   * system does not rewrite them, so a user they point at cannot be deleted.
   */
  historyReferences(userId) {
    const counts = {
      statusChanges: 'SELECT COUNT(*) AS n FROM stage_status_history WHERE changed_by = ?',
      documents: 'SELECT COUNT(*) AS n FROM stage_documents WHERE uploaded_by = ?',
      signoffs: 'SELECT COUNT(*) AS n FROM stage_signoffs WHERE signed_by = ?',
      bugsRaised: 'SELECT COUNT(*) AS n FROM bugs WHERE raised_by = ?',
      bugEvents: 'SELECT COUNT(*) AS n FROM bug_events WHERE actor_id = ?',
      // audit_logs is append-only by trigger: actor_id can be neither
      // rewritten nor orphaned, so any audited action pins the account.
      auditedActions: 'SELECT COUNT(*) AS n FROM audit_logs WHERE actor_id = ?',
    };
    const detail = {};
    let total = 0;
    for (const [key, sql] of Object.entries(counts)) {
      const { n } = getDb().prepare(sql).get(userId);
      if (n > 0) detail[key] = n;
      total += n;
    }
    return { total, detail };
  },

  /**
   * Clears the nullable back-references so the delete itself cannot fail on a
   * foreign key. audit_logs is deliberately absent: an append-only trigger
   * forbids rewriting it, which is why an audited account cannot be deleted
   * at all — see historyReferences.
   */
  detachReferences(userId) {
    const db = getDb();
    const statements = [
      'UPDATE projects SET owner_id = NULL WHERE owner_id = ?',
      'UPDATE projects SET created_by = NULL WHERE created_by = ?',
      'UPDATE sop_templates SET created_by = NULL WHERE created_by = ?',
      'UPDATE sop_versions SET published_by = NULL WHERE published_by = ?',
      'UPDATE project_workflow_stages SET assigned_to = NULL WHERE assigned_to = ?',
      'UPDATE project_workflow_stages SET updated_by = NULL WHERE updated_by = ?',
      'UPDATE bugs SET assigned_to = NULL WHERE assigned_to = ?',
      'UPDATE system_settings SET updated_by = NULL WHERE updated_by = ?',
    ];
    for (const sql of statements) db.prepare(sql).run(userId);
  },

  remove(id) {
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  countActiveAssignments(userId) {
    const placeholders = ACTIVE_STAGE_STATUSES.map(() => '?').join(', ');
    const { total } = getDb()
      .prepare(
        `SELECT COUNT(*) AS total
           FROM project_workflow_stages s
           JOIN projects p ON p.id = s.project_id
          WHERE s.assigned_to = ?
            AND s.status IN (${placeholders})
            AND p.status IN ('ACTIVE', 'ON_HOLD')`,
      )
      .get(userId, ...ACTIVE_STAGE_STATUSES);
    return total;
  },
};
