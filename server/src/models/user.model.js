import { getDb, camelize, camelizeAll } from '../db/index.js';
import { ACTIVE_STAGE_STATUSES } from '../config/constants.js';

const cast = (row) => {
  if (!row) return null;
  const out = camelize(row);
  if ('isActive' in out) out.isActive = Boolean(out.isActive);
  if ('isClientScope' in out) out.isClientScope = Boolean(out.isClientScope);
  return out;
};

const SELECT_WITH_ROLE = `
  SELECT u.id, u.email, u.full_name, u.team, u.client_name, u.is_active,
         u.created_at, u.updated_at,
         u.role_id, r.key AS role_key, r.name AS role_name, r.is_client_scope
    FROM users u
    JOIN roles r ON r.id = u.role_id`;

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

  list({ search, roleId, isActive, limit = 50, offset = 0 } = {}) {
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
    if (isActive !== undefined) {
      where.push('u.is_active = @isActive');
      params.isActive = isActive ? 1 : 0;
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const rows = getDb()
      .prepare(`${SELECT_WITH_ROLE}${clause} ORDER BY u.full_name LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset });
    const { total } = getDb()
      .prepare(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id${clause}`)
      .get(params);

    return { items: rows.map(cast), total };
  },

  create({ email, passwordHash, fullName, roleId, team = null, clientName = null, isActive = true }) {
    const info = getDb()
      .prepare(
        `INSERT INTO users (email, password_hash, full_name, role_id, team, client_name, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(email, passwordHash, fullName, roleId, team, clientName, isActive ? 1 : 0);
    return userModel.findById(info.lastInsertRowid);
  },

  update(id, patch) {
    const columns = {
      email: 'email',
      fullName: 'full_name',
      roleId: 'role_id',
      team: 'team',
      clientName: 'client_name',
      isActive: 'is_active',
      passwordHash: 'password_hash',
    };
    const sets = [];
    const params = { id };
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = key === 'isActive' ? (patch[key] ? 1 : 0) : patch[key];
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
