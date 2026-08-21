import { getDb, camelize, camelizeAll } from '../db/index.js';

const cast = (row) => (row ? camelize(row) : null);

const SELECT_PROJECT = `
  SELECT p.*,
         t.name  AS sop_template_name,
         v.version AS sop_version_number,
         v.status  AS sop_version_status,
         o.full_name AS owner_name,
         o.email     AS owner_email
    FROM projects p
    JOIN sop_templates t ON t.id = p.sop_template_id
    JOIN sop_versions  v ON v.id = p.sop_version_id
    LEFT JOIN users    o ON o.id = p.owner_id`;

export const projectModel = {
  findById(id) {
    return cast(getDb().prepare(`${SELECT_PROJECT} WHERE p.id = ?`).get(id));
  },

  findByCode(code) {
    return cast(getDb().prepare(`${SELECT_PROJECT} WHERE p.code = ?`).get(code));
  },

  list({ scope = null, status, search, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = { limit, offset };

    if (scope?.memberOf) {
      where.push(
        `(p.owner_id = @memberOf
          OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = @memberOf)
          OR EXISTS (SELECT 1 FROM project_workflow_stages s WHERE s.project_id = p.id AND s.assigned_to = @memberOf))`,
      );
      params.memberOf = scope.memberOf;
    }
    if (scope?.clientName) {
      where.push('p.client_name = @clientName');
      params.clientName = scope.clientName;
    }
    if (status) {
      where.push('p.status = @status');
      params.status = status;
    }
    if (search) {
      where.push('(p.name LIKE @search OR p.code LIKE @search OR p.client_name LIKE @search)');
      params.search = `%${search}%`;
    }

    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const rows = getDb()
      .prepare(`${SELECT_PROJECT}${clause} ORDER BY p.created_at DESC LIMIT @limit OFFSET @offset`)
      .all(params);

    const countParams = { ...params };
    delete countParams.limit;
    delete countParams.offset;
    const { total } = getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM projects p
           JOIN sop_templates t ON t.id = p.sop_template_id
           JOIN sop_versions  v ON v.id = p.sop_version_id
           LEFT JOIN users    o ON o.id = p.owner_id${clause}`,
      )
      .get(countParams);

    return { items: rows.map(cast), total };
  },

  // Row-level access check used by every single-project endpoint.
  isVisibleTo(projectId, scope) {
    if (!scope) return true;
    if (scope.clientName) {
      const row = getDb()
        .prepare('SELECT 1 AS ok FROM projects WHERE id = ? AND client_name = ?')
        .get(projectId, scope.clientName);
      return Boolean(row);
    }
    if (scope.memberOf) {
      const row = getDb()
        .prepare(
          `SELECT 1 AS ok FROM projects p
            WHERE p.id = @projectId
              AND (p.owner_id = @user
                   OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = @user)
                   OR EXISTS (SELECT 1 FROM project_workflow_stages s WHERE s.project_id = p.id AND s.assigned_to = @user))`,
        )
        .get({ projectId, user: scope.memberOf });
      return Boolean(row);
    }
    return true;
  },

  create(project) {
    const info = getDb()
      .prepare(
        `INSERT INTO projects
           (code, name, description, client_name, sop_template_id, sop_version_id,
            owner_id, status, start_date, target_end_date, created_by)
         VALUES (@code, @name, @description, @clientName, @sopTemplateId, @sopVersionId,
                 @ownerId, @status, @startDate, @targetEndDate, @createdBy)`,
      )
      .run({
        code: project.code,
        name: project.name,
        description: project.description ?? null,
        clientName: project.clientName,
        sopTemplateId: project.sopTemplateId,
        sopVersionId: project.sopVersionId,
        ownerId: project.ownerId ?? null,
        status: project.status ?? 'ACTIVE',
        startDate: project.startDate ?? null,
        targetEndDate: project.targetEndDate ?? null,
        createdBy: project.createdBy ?? null,
      });
    return projectModel.findById(info.lastInsertRowid);
  },

  update(id, patch) {
    // No sopVersionId: a project's SOP version is fixed for its lifetime.
    const columns = {
      name: 'name',
      description: 'description',
      clientName: 'client_name',
      ownerId: 'owner_id',
      status: 'status',
      startDate: 'start_date',
      targetEndDate: 'target_end_date',
    };
    const sets = [];
    const params = { id };
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = patch[key];
      }
    }
    if (!sets.length) return projectModel.findById(id);
    sets.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return projectModel.findById(id);
  },

  addMember(projectId, userId, roleInProject = 'MEMBER') {
    getDb()
      .prepare(
        `INSERT INTO project_members (project_id, user_id, role_in_project) VALUES (?, ?, ?)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role_in_project = excluded.role_in_project`,
      )
      .run(projectId, userId, roleInProject);
  },

  removeMember(projectId, userId) {
    getDb().prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
  },

  members(projectId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT m.user_id, m.role_in_project, u.full_name, u.email, u.is_active, r.key AS role_key
             FROM project_members m
             JOIN users u ON u.id = m.user_id
             JOIN roles r ON r.id = u.role_id
            WHERE m.project_id = ?
            ORDER BY u.full_name`,
        )
        .all(projectId),
    );
  },
};
