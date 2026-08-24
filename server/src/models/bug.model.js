import { getDb, camelize, camelizeAll } from '../db/index.js';
import { OPEN_BUG_STATUSES } from '../config/constants.js';

const SELECT_BUG = `
  SELECT b.*, r.full_name AS raised_by_name, a.full_name AS assigned_to_name,
         s.name AS stage_name
    FROM bugs b
    JOIN users r ON r.id = b.raised_by
    LEFT JOIN users a ON a.id = b.assigned_to
    JOIN project_workflow_stages s ON s.id = b.project_stage_id`;

export const bugModel = {
  findById(id) {
    return camelize(getDb().prepare(`${SELECT_BUG} WHERE b.id = ?`).get(id));
  },

  listByStage(stageId) {
    return camelizeAll(
      getDb().prepare(`${SELECT_BUG} WHERE b.project_stage_id = ? ORDER BY b.created_at DESC`).all(stageId),
    );
  },

  listByProject(projectId, { status } = {}) {
    const clause = status ? ' AND b.status = @status' : '';
    return camelizeAll(
      getDb()
        .prepare(`${SELECT_BUG} WHERE b.project_id = @projectId${clause} ORDER BY b.created_at DESC`)
        .all({ projectId, status }),
    );
  },

  // Drives the Testing-stage close guard.
  openCountForStage(stageId) {
    const placeholders = OPEN_BUG_STATUSES.map(() => '?').join(', ');
    return getDb()
      .prepare(`SELECT COUNT(*) AS total FROM bugs WHERE project_stage_id = ? AND status IN (${placeholders})`)
      .get(stageId, ...OPEN_BUG_STATUSES).total;
  },

  openForStage(stageId) {
    const placeholders = OPEN_BUG_STATUSES.map(() => '?').join(', ');
    return camelizeAll(
      getDb()
        .prepare(`${SELECT_BUG} WHERE b.project_stage_id = ? AND b.status IN (${placeholders}) ORDER BY b.severity DESC, b.created_at`)
        .all(stageId, ...OPEN_BUG_STATUSES),
    );
  },

  nextReference(projectId) {
    const { total } = getDb().prepare('SELECT COUNT(*) AS total FROM bugs WHERE project_id = ?').get(projectId);
    return `BUG-${String(total + 1).padStart(3, '0')}`;
  },

  create(bug) {
    const info = getDb()
      .prepare(
        `INSERT INTO bugs (project_id, project_stage_id, reference, title, description, severity, raised_by, assigned_to)
         VALUES (@projectId, @projectStageId, @reference, @title, @description, @severity, @raisedBy, @assignedTo)`,
      )
      .run({
        projectId: bug.projectId,
        projectStageId: bug.projectStageId,
        reference: bug.reference,
        title: bug.title,
        description: bug.description ?? null,
        severity: bug.severity ?? 'MEDIUM',
        raisedBy: bug.raisedBy,
        assignedTo: bug.assignedTo ?? null,
      });
    return bugModel.findById(info.lastInsertRowid);
  },

  applyTransition(id, { status, assignedTo, resolutionNote, incrementReopen }) {
    getDb()
      .prepare(
        `UPDATE bugs
            SET status          = @status,
                assigned_to     = COALESCE(@assignedTo, assigned_to),
                resolution_note = COALESCE(@resolutionNote, resolution_note),
                reopen_count    = reopen_count + @incrementReopen,
                closed_at       = CASE WHEN @status = 'CLOSED' THEN datetime('now') ELSE NULL END,
                updated_at      = datetime('now')
          WHERE id = @id`,
      )
      .run({
        id,
        status,
        assignedTo: assignedTo ?? null,
        resolutionNote: resolutionNote ?? null,
        incrementReopen: incrementReopen ? 1 : 0,
      });
    return bugModel.findById(id);
  },

  stats(projectId) {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed,
                SUM(CASE WHEN status <> 'CLOSED' THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN severity = 'CRITICAL' AND status <> 'CLOSED' THEN 1 ELSE 0 END) AS criticalOpen
           FROM bugs WHERE project_id = ?`,
      )
      .get(projectId);
    return { total: row.total || 0, closed: row.closed || 0, open: row.open || 0, criticalOpen: row.criticalOpen || 0 };
  },
};

export const bugEventModel = {
  append(event) {
    return getDb()
      .prepare(
        `INSERT INTO bug_events (bug_id, from_status, to_status, note, actor_id)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(event.bugId, event.fromStatus ?? null, event.toStatus, event.note ?? null, event.actorId).lastInsertRowid;
  },

  listByBug(bugId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT e.*, u.full_name AS actor_name
             FROM bug_events e JOIN users u ON u.id = e.actor_id
            WHERE e.bug_id = ? ORDER BY e.created_at, e.id`,
        )
        .all(bugId),
    );
  },
};
