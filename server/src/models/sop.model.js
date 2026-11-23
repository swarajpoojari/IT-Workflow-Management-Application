import { getDb, camelize, camelizeAll } from '../db/index.js';
import { SOP_VERSION_STATUS } from '../config/constants.js';

const castStage = (row) => {
  if (!row) return null;
  const out = camelize(row);
  out.clientVisible = Boolean(out.clientVisible);
  out.requiresDocument = Boolean(out.requiresDocument);
  out.requiresSignoff = Boolean(out.requiresSignoff);
  return out;
};

const castTemplate = (row) => {
  if (!row) return null;
  const out = camelize(row);
  if ('isActive' in out) out.isActive = Boolean(out.isActive);
  return out;
};

export const sopTemplateModel = {
  list({ includeInactive = false } = {}) {
    const clause = includeInactive ? '' : ' WHERE is_active = 1';
    return getDb().prepare(`SELECT * FROM sop_templates${clause} ORDER BY name`).all().map(castTemplate);
  },

  findById(id) {
    return castTemplate(getDb().prepare('SELECT * FROM sop_templates WHERE id = ?').get(id));
  },

  create({ name, description = null, category = null, createdBy = null }) {
    const info = getDb()
      .prepare('INSERT INTO sop_templates (name, description, category, created_by) VALUES (?, ?, ?, ?)')
      .run(name, description, category, createdBy);
    return sopTemplateModel.findById(info.lastInsertRowid);
  },

  update(id, { name, description, category, isActive }) {
    const sets = [];
    const params = { id };
    if (name !== undefined) { sets.push('name = @name'); params.name = name; }
    if (description !== undefined) { sets.push('description = @description'); params.description = description; }
    if (category !== undefined) { sets.push('category = @category'); params.category = category; }
    if (isActive !== undefined) { sets.push('is_active = @isActive'); params.isActive = isActive ? 1 : 0; }
    if (!sets.length) return sopTemplateModel.findById(id);
    sets.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE sop_templates SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return sopTemplateModel.findById(id);
  },

  deactivate(id) {
    getDb().prepare("UPDATE sop_templates SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    return sopTemplateModel.findById(id);
  },

  countProjects(templateId) {
    return getDb().prepare('SELECT COUNT(*) AS total FROM projects WHERE sop_template_id = ?').get(templateId).total;
  },

  /** Projects still running on this template — what the library card reports. */
  countActiveProjects(templateId) {
    return getDb()
      .prepare(
        `SELECT COUNT(*) AS total FROM projects
          WHERE sop_template_id = ? AND status IN ('ACTIVE', 'ON_HOLD')`,
      )
      .get(templateId).total;
  },

  /**
   * Who last touched the template, drawn from the audit log. The SOP tables
   * record who published, but not who edited a draft stage.
   */
  lastEdit(templateId) {
    const versionIds = getDb()
      .prepare('SELECT id FROM sop_versions WHERE template_id = ?')
      .all(templateId)
      .map((row) => String(row.id));

    const entities = [
      `('SOP_TEMPLATE', '${templateId}')`,
      ...versionIds.map((id) => `('SOP_VERSION', '${id}')`),
    ].join(', ');

    const row = getDb()
      .prepare(
        `SELECT created_at, actor_email, summary,
                COALESCE((SELECT full_name FROM users WHERE id = actor_id), actor_email) AS actor_name
           FROM audit_logs
          WHERE (entity_type, entity_id) IN (${entities})
             OR (entity_type = 'SOP_STAGE' AND entity_id IN (
                   SELECT CAST(s.id AS TEXT) FROM sop_stages s
                    WHERE s.sop_version_id IN (SELECT id FROM sop_versions WHERE template_id = ?)))
          ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(templateId);

    return row ? camelize(row) : null;
  },
};

export const sopVersionModel = {
  findById(id) {
    return camelize(getDb().prepare('SELECT * FROM sop_versions WHERE id = ?').get(id));
  },

  listByTemplate(templateId) {
    return camelizeAll(
      getDb()
        .prepare(
          `SELECT v.*, u.full_name AS published_by_name,
                  (SELECT COUNT(*) FROM sop_stages s WHERE s.sop_version_id = v.id)  AS stage_count,
                  (SELECT COUNT(*) FROM projects p WHERE p.sop_version_id = v.id)    AS project_count
             FROM sop_versions v
             LEFT JOIN users u ON u.id = v.published_by
            WHERE v.template_id = ?
            ORDER BY v.version DESC`,
        )
        .all(templateId),
    );
  },

  findDraft(templateId) {
    return camelize(
      getDb()
        .prepare("SELECT * FROM sop_versions WHERE template_id = ? AND status = 'DRAFT' ORDER BY version DESC LIMIT 1")
        .get(templateId),
    );
  },

  findLatestPublished(templateId) {
    return camelize(
      getDb()
        .prepare(
          `SELECT * FROM sop_versions
            WHERE template_id = ? AND status = 'PUBLISHED'
            ORDER BY version DESC LIMIT 1`,
        )
        .get(templateId),
    );
  },

  create({ templateId, version, status = SOP_VERSION_STATUS.DRAFT, changeNote = null }) {
    const info = getDb()
      .prepare('INSERT INTO sop_versions (template_id, version, status, change_note) VALUES (?, ?, ?, ?)')
      .run(templateId, version, status, changeNote);
    return sopVersionModel.findById(info.lastInsertRowid);
  },

  nextVersionNumber(templateId) {
    const { maxVersion } = getDb()
      .prepare('SELECT COALESCE(MAX(version), 0) AS maxVersion FROM sop_versions WHERE template_id = ?')
      .get(templateId);
    return maxVersion + 1;
  },

  markPublished(id, publishedBy) {
    getDb()
      .prepare(
        `UPDATE sop_versions
            SET status = 'PUBLISHED', published_at = datetime('now'), published_by = ?
          WHERE id = ? AND status = 'DRAFT'`,
      )
      .run(publishedBy, id);
    return sopVersionModel.findById(id);
  },

  setChangeNote(id, changeNote) {
    getDb().prepare('UPDATE sop_versions SET change_note = ? WHERE id = ?').run(changeNote, id);
    return sopVersionModel.findById(id);
  },

  countProjectsUsing(versionId) {
    return getDb().prepare('SELECT COUNT(*) AS total FROM projects WHERE sop_version_id = ?').get(versionId).total;
  },
};

export const sopStageModel = {
  listByVersion(versionId) {
    return getDb()
      .prepare(
        `SELECT ss.*,
                  -- A published version is frozen, so its stages may still only
                  -- carry the legacy text label. Fall back to it for display.
                  COALESCE(t.name, ss.default_owner_team) AS default_owner_team_name,
                  t.category AS default_owner_team_category
           FROM sop_stages ss
           LEFT JOIN teams t ON t.id = ss.default_owner_team_id
          WHERE ss.sop_version_id = ? ORDER BY ss.sequence`,
      )
      .all(versionId)
      .map(castStage);
  },

  findById(id) {
    return castStage(
      getDb()
        .prepare(
          `SELECT ss.*,
                  -- A published version is frozen, so its stages may still only
                  -- carry the legacy text label. Fall back to it for display.
                  COALESCE(t.name, ss.default_owner_team) AS default_owner_team_name,
                  t.category AS default_owner_team_category
             FROM sop_stages ss
             LEFT JOIN teams t ON t.id = ss.default_owner_team_id
            WHERE ss.id = ?`,
        )
        .get(id),
    );
  },

  nextSequence(versionId) {
    const { maxSeq } = getDb()
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS maxSeq FROM sop_stages WHERE sop_version_id = ?')
      .get(versionId);
    return maxSeq + 1;
  },

  create(stage) {
    const info = getDb()
      .prepare(
        `INSERT INTO sop_stages
           (sop_version_id, name, description, sequence, client_visible, requires_document,
            stage_type, requires_signoff, expected_duration_days, default_owner_team,
            default_owner_team_id)
         VALUES (@sopVersionId, @name, @description, @sequence, @clientVisible, @requiresDocument,
                 @stageType, @requiresSignoff, @expectedDurationDays, @defaultOwnerTeam,
                 @defaultOwnerTeamId)`,
      )
      .run({
        sopVersionId: stage.sopVersionId,
        name: stage.name,
        description: stage.description ?? null,
        sequence: stage.sequence,
        clientVisible: stage.clientVisible ? 1 : 0,
        requiresDocument: stage.requiresDocument ? 1 : 0,
        stageType: stage.stageType ?? 'GENERIC',
        requiresSignoff: stage.requiresSignoff ? 1 : 0,
        expectedDurationDays: stage.expectedDurationDays ?? null,
        defaultOwnerTeam: stage.defaultOwnerTeam ?? null,
        defaultOwnerTeamId: stage.defaultOwnerTeamId ?? null,
      });
    return sopStageModel.findById(info.lastInsertRowid);
  },

  update(id, patch) {
    const columns = {
      name: 'name',
      description: 'description',
      sequence: 'sequence',
      clientVisible: 'client_visible',
      requiresDocument: 'requires_document',
      stageType: 'stage_type',
      requiresSignoff: 'requires_signoff',
      expectedDurationDays: 'expected_duration_days',
      defaultOwnerTeam: 'default_owner_team',
      defaultOwnerTeamId: 'default_owner_team_id',
    };
    const sets = [];
    const params = { id };
    for (const [key, column] of Object.entries(columns)) {
      if (patch[key] !== undefined) {
        sets.push(`${column} = @${key}`);
        params[key] = ['clientVisible', 'requiresDocument', 'requiresSignoff'].includes(key)
          ? (patch[key] ? 1 : 0)
          : patch[key];
      }
    }
    if (!sets.length) return sopStageModel.findById(id);
    getDb().prepare(`UPDATE sop_stages SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return sopStageModel.findById(id);
  },

  remove(id) {
    getDb().prepare('DELETE FROM sop_stages WHERE id = ?').run(id);
  },

  // Two passes: UNIQUE (version, sequence) would trip mid-update otherwise.
  reorder(versionId, orderedStageIds) {
    const db = getDb();
    const park = db.prepare('UPDATE sop_stages SET sequence = -sequence WHERE sop_version_id = ? AND sequence > 0');
    park.run(versionId);
    const set = db.prepare('UPDATE sop_stages SET sequence = ? WHERE id = ? AND sop_version_id = ?');
    orderedStageIds.forEach((stageId, index) => set.run(index + 1, stageId, versionId));
    return sopStageModel.listByVersion(versionId);
  },

  cloneInto(fromVersionId, toVersionId) {
    getDb()
      .prepare(
        `INSERT INTO sop_stages
           (sop_version_id, name, description, sequence, client_visible, requires_document,
            stage_type, requires_signoff, expected_duration_days, default_owner_team)
         SELECT ?, name, description, sequence, client_visible, requires_document,
                stage_type, requires_signoff, expected_duration_days, default_owner_team
           FROM sop_stages WHERE sop_version_id = ? ORDER BY sequence`,
      )
      .run(toVersionId, fromVersionId);
    return sopStageModel.listByVersion(toVersionId);
  },
};
