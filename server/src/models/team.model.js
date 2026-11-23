import { getDb, camelize, camelizeAll } from '../db/index.js';

const SELECT_TEAM = `
  SELECT t.id, t.name, t.description, t.category, t.is_active,
         t.lead_user_id, t.created_at, t.updated_at,
         lead.full_name AS lead_name, lead.email AS lead_email,
         (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id)                     AS member_count,
         (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND u.is_active = 1) AS active_member_count,
         -- Live workflow stages this team owns, across every project.
         (SELECT COUNT(*) FROM project_workflow_stages s WHERE s.owning_team_id = t.id) AS owned_stage_count,
         -- Template stages that will hand this team work on every new project.
         (SELECT COUNT(*) FROM sop_stages ss WHERE ss.default_owner_team_id = t.id)     AS sop_stage_count
    FROM teams t
    LEFT JOIN users lead ON lead.id = t.lead_user_id`;

const cast = (row) => {
  if (!row) return null;
  if ('isActive' in row) row.isActive = Boolean(row.isActive);
  return row;
};

export const teamModel = {
  findById(id) {
    return cast(camelize(getDb().prepare(`${SELECT_TEAM} WHERE t.id = ?`).get(id)));
  },

  findByName(name) {
    return cast(camelize(getDb().prepare(`${SELECT_TEAM} WHERE t.name = ? COLLATE NOCASE`).get(name)));
  },

  findAll() {
    return camelizeAll(getDb().prepare(`${SELECT_TEAM} ORDER BY t.name`).all()).map(cast);
  },

  /** Active members only — the pool a stage owned by this team draws from. */
  assignableMembers(id) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT u.id, u.full_name, u.email, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
            WHERE u.team_id = ? AND u.is_active = 1
            ORDER BY u.full_name`,
        )
        .all(id),
    );
  },

  /** Every member of a team, so the UI can show who moves when a team is edited. */
  members(id) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT u.id, u.full_name, u.email, u.is_active, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
            WHERE u.team_id = ?
            ORDER BY u.full_name`,
        )
        .all(id),
    ).map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
  },

  create({ name, description = null, category = null, leadUserId = null }) {
    const info = getDb()
      .prepare('INSERT INTO teams (name, description, category, lead_user_id) VALUES (?, ?, ?, ?)')
      .run(name, description, category, leadUserId);
    return teamModel.findById(info.lastInsertRowid);
  },

  update(id, patch) {
    const columns = {
      name: 'name', description: 'description', category: 'category',
      leadUserId: 'lead_user_id', isActive: 'is_active',
    };
    const sets = [];
    const params = { id };
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = key === 'isActive' ? (patch[key] ? 1 : 0) : patch[key];
      }
    }
    if (!sets.length) return teamModel.findById(id);
    sets.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return teamModel.findById(id);
  },

  /**
   * Stages of a PUBLISHED SOP version that name this team. Those rows are
   * frozen by trigger, so the ON DELETE SET NULL cascade cannot touch them —
   * which makes the team undeletable while such a version exists.
   */
  publishedSopReferences(id) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT ss.name AS stage_name, t.name AS template_name, v.version
             FROM sop_stages ss
             JOIN sop_versions  v ON v.id = ss.sop_version_id
             JOIN sop_templates t ON t.id = v.template_id
            WHERE ss.default_owner_team_id = ? AND v.status <> 'DRAFT'
            ORDER BY t.name, ss.sequence`,
        )
        .all(id),
    );
  },

  /** Members are detached rather than deleted — ON DELETE SET NULL does the work. */
  remove(id) {
    getDb().prepare('DELETE FROM teams WHERE id = ?').run(id);
  },
};
