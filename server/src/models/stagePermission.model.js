import { getDb, camelizeAll } from '../db/index.js';

export const stagePermissionModel = {
  listForSopStage(sopStageId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT p.role_id, r.key AS role_key, r.name AS role_name, p.action
             FROM sop_stage_permissions p JOIN roles r ON r.id = p.role_id
            WHERE p.sop_stage_id = ? ORDER BY r.id, p.action`,
        )
        .all(sopStageId),
    );
  },

  setForSopStage(sopStageId, grants) {
    const db = getDb();
    db.prepare('DELETE FROM sop_stage_permissions WHERE sop_stage_id = ?').run(sopStageId);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO sop_stage_permissions (sop_stage_id, role_id, action) VALUES (?, ?, ?)',
    );
    for (const { roleId, action } of grants) insert.run(sopStageId, roleId, action);
  },

  listForProjectStage(projectStageId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT p.role_id, r.key AS role_key, r.name AS role_name, p.action
             FROM project_stage_permissions p JOIN roles r ON r.id = p.role_id
            WHERE p.project_stage_id = ? ORDER BY r.id, p.action`,
        )
        .all(projectStageId),
    );
  },

  roleHasAction(projectStageId, roleId, action) {
    return Boolean(
      getDb()
        .prepare(
          'SELECT 1 AS ok FROM project_stage_permissions WHERE project_stage_id = ? AND role_id = ? AND action = ?',
        )
        .get(projectStageId, roleId, action),
    );
  },

  actionsForRole(projectStageId, roleId) {
    return getDb()
      .prepare('SELECT action FROM project_stage_permissions WHERE project_stage_id = ? AND role_id = ?')
      .all(projectStageId, roleId)
      .map((r) => r.action);
  },

  // Copied at creation so re-publishing the SOP cannot widen a live project.
  snapshotForProject(projectId) {
    return getDb()
      .prepare(
        `INSERT OR IGNORE INTO project_stage_permissions (project_stage_id, role_id, action)
         SELECT pws.id, ssp.role_id, ssp.action
           FROM project_workflow_stages pws
           JOIN sop_stage_permissions ssp ON ssp.sop_stage_id = pws.sop_stage_id
          WHERE pws.project_id = ?`,
      )
      .run(projectId).changes;
  },

  setForProjectStage(projectStageId, grants) {
    const db = getDb();
    db.prepare('DELETE FROM project_stage_permissions WHERE project_stage_id = ?').run(projectStageId);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO project_stage_permissions (project_stage_id, role_id, action) VALUES (?, ?, ?)',
    );
    for (const { roleId, action } of grants) insert.run(projectStageId, roleId, action);
  },
};
