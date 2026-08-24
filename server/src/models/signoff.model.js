import { getDb, camelize, camelizeAll } from '../db/index.js';

export const signoffModel = {
  listByStage(stageId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT s.*, u.full_name AS signed_by_name, u.email AS signed_by_email
             FROM stage_signoffs s JOIN users u ON u.id = s.signed_by
            WHERE s.project_stage_id = ? ORDER BY s.signed_at DESC, s.id DESC`,
        )
        .all(stageId),
    );
  },

  // Latest, not any: a later rejection must re-block the stage.
  latestFor(stageId) {
    return camelize(
      getDb()
        .prepare('SELECT * FROM stage_signoffs WHERE project_stage_id = ? ORDER BY signed_at DESC, id DESC LIMIT 1')
        .get(stageId),
    );
  },

  create({ projectStageId, decision, note, signedBy, signedRole }) {
    const info = getDb()
      .prepare(
        `INSERT INTO stage_signoffs (project_stage_id, decision, note, signed_by, signed_role)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectStageId, decision, note ?? null, signedBy, signedRole ?? null);
    return camelize(getDb().prepare('SELECT * FROM stage_signoffs WHERE id = ?').get(info.lastInsertRowid));
  },
};
