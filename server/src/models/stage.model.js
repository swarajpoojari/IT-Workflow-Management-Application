import { getDb, camelize, camelizeAll } from '../db/index.js';

const cast = (row) => {
  if (!row) return null;
  const out = camelize(row);
  out.clientVisible = Boolean(out.clientVisible);
  out.requiresDocument = Boolean(out.requiresDocument);
  return out;
};

const SELECT_STAGE = `
  SELECT s.*, u.full_name AS assignee_name, u.email AS assignee_email,
         (SELECT COUNT(*) FROM stage_documents d WHERE d.project_stage_id = s.id) AS document_count
    FROM project_workflow_stages s
    LEFT JOIN users u ON u.id = s.assigned_to`;

export const stageModel = {
  findById(id) {
    return cast(getDb().prepare(`${SELECT_STAGE} WHERE s.id = ?`).get(id));
  },

  listByProject(projectId, { clientVisibleOnly = false } = {}) {
    const clause = clientVisibleOnly ? ' AND s.client_visible = 1' : '';
    return getDb()
      .prepare(`${SELECT_STAGE} WHERE s.project_id = ?${clause} ORDER BY s.sequence`)
      .all(projectId)
      .map(cast);
  },

  // Snapshots the SOP fields so later SOP edits cannot rewrite a live board.
  generateFromSopVersion(projectId, sopVersionId) {
    const info = getDb()
      .prepare(
        `INSERT INTO project_workflow_stages
           (project_id, sop_stage_id, name, description, sequence, client_visible,
            requires_document, status, due_date)
         SELECT ?, ss.id, ss.name, ss.description, ss.sequence, ss.client_visible,
                ss.requires_document, 'NOT_STARTED', NULL
           FROM sop_stages ss
          WHERE ss.sop_version_id = ?
          ORDER BY ss.sequence`,
      )
      .run(projectId, sopVersionId);
    return info.changes;
  },

  // The only writer of project_workflow_stages.status.
  applyStatusChange(id, { status, blocker, holdReason, completionDate, remarks, updatedBy, startedAt }) {
    getDb()
      .prepare(
        `UPDATE project_workflow_stages
            SET status          = @status,
                blocker         = @blocker,
                hold_reason     = @holdReason,
                completion_date = @completionDate,
                remarks         = COALESCE(@remarks, remarks),
                started_at      = COALESCE(started_at, @startedAt),
                updated_by      = @updatedBy,
                updated_at      = datetime('now')
          WHERE id = @id`,
      )
      .run({
        id,
        status,
        blocker: blocker ?? null,
        holdReason: holdReason ?? null,
        completionDate: completionDate ?? null,
        remarks: remarks ?? null,
        startedAt: startedAt ?? null,
        updatedBy,
      });
    return stageModel.findById(id);
  },

  // Assignment and scheduling only; cannot touch status.
  updateAssignment(id, { assignedTo, dueDate, updatedBy }) {
    const sets = [];
    const params = { id, updatedBy };
    if (assignedTo !== undefined) { sets.push('assigned_to = @assignedTo'); params.assignedTo = assignedTo; }
    if (dueDate !== undefined) { sets.push('due_date = @dueDate'); params.dueDate = dueDate; }
    if (!sets.length) return stageModel.findById(id);
    sets.push('updated_by = @updatedBy', "updated_at = datetime('now')");
    getDb().prepare(`UPDATE project_workflow_stages SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return stageModel.findById(id);
  },

  reassign(fromUserId, toUserId, stageIds = null) {
    const db = getDb();
    if (stageIds && stageIds.length) {
      const placeholders = stageIds.map(() => '?').join(', ');
      return db
        .prepare(
          `UPDATE project_workflow_stages
              SET assigned_to = ?, updated_at = datetime('now')
            WHERE assigned_to = ? AND id IN (${placeholders})`,
        )
        .run(toUserId, fromUserId, ...stageIds).changes;
    }
    return db
      .prepare(
        `UPDATE project_workflow_stages
            SET assigned_to = ?, updated_at = datetime('now')
          WHERE assigned_to = ?
            AND status IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD')`,
      )
      .run(toUserId, fromUserId).changes;
  },

  progressFor(projectId, { clientVisibleOnly = false } = {}) {
    const clause = clientVisibleOnly ? ' AND client_visible = 1' : '';
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'COMPLETED'   THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgress,
                SUM(CASE WHEN status = 'BLOCKED'     THEN 1 ELSE 0 END) AS blocked,
                SUM(CASE WHEN status = 'ON_HOLD'     THEN 1 ELSE 0 END) AS onHold,
                SUM(CASE WHEN status = 'NOT_STARTED' THEN 1 ELSE 0 END) AS notStarted
           FROM project_workflow_stages
          WHERE project_id = ?${clause}`,
      )
      .get(projectId);
    const total = row.total || 0;
    return {
      total,
      completed: row.completed || 0,
      inProgress: row.inProgress || 0,
      blocked: row.blocked || 0,
      onHold: row.onHold || 0,
      notStarted: row.notStarted || 0,
      percentComplete: total ? Math.round(((row.completed || 0) / total) * 100) : 0,
    };
  },

  listAssignedTo(userId) {
    return getDb()
      .prepare(
        `${SELECT_STAGE}
          WHERE s.assigned_to = ? AND s.status <> 'COMPLETED'
          ORDER BY s.due_date IS NULL, s.due_date`,
      )
      .all(userId)
      .map(cast);
  },
};

export const statusHistoryModel = {
  append(entry) {
    const info = getDb()
      .prepare(
        `INSERT INTO stage_status_history
           (project_stage_id, from_status, to_status, remarks, blocker, hold_reason, completion_date, changed_by)
         VALUES (@projectStageId, @fromStatus, @toStatus, @remarks, @blocker, @holdReason, @completionDate, @changedBy)`,
      )
      .run({
        projectStageId: entry.projectStageId,
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus,
        remarks: entry.remarks ?? null,
        blocker: entry.blocker ?? null,
        holdReason: entry.holdReason ?? null,
        completionDate: entry.completionDate ?? null,
        changedBy: entry.changedBy,
      });
    return info.lastInsertRowid;
  },

  listByStage(stageId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT h.*, u.full_name AS changed_by_name, u.email AS changed_by_email
             FROM stage_status_history h
             JOIN users u ON u.id = h.changed_by
            WHERE h.project_stage_id = ?
            ORDER BY h.changed_at DESC, h.id DESC`,
        )
        .all(stageId),
    );
  },
};

export const documentModel = {
  listByStage(stageId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT d.*, u.full_name AS uploaded_by_name
             FROM stage_documents d
             JOIN users u ON u.id = d.uploaded_by
            WHERE d.project_stage_id = ?
            ORDER BY d.version DESC, d.uploaded_at DESC`,
        )
        .all(stageId),
    );
  },

  findById(id) {
    return camelize(getDb().prepare('SELECT * FROM stage_documents WHERE id = ?').get(id));
  },

  nextVersion(stageId, fileName) {
    const { maxVersion } = getDb()
      .prepare(
        'SELECT COALESCE(MAX(version), 0) AS maxVersion FROM stage_documents WHERE project_stage_id = ? AND file_name = ?',
      )
      .get(stageId, fileName);
    return maxVersion + 1;
  },

  create({ projectStageId, fileName, fileUrl, docType = 'FILE', version = 1, notes = null, uploadedBy }) {
    const info = getDb()
      .prepare(
        `INSERT INTO stage_documents
           (project_stage_id, file_name, file_url, doc_type, version, notes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(projectStageId, fileName, fileUrl, docType, version, notes, uploadedBy);
    return documentModel.findById(info.lastInsertRowid);
  },
};
