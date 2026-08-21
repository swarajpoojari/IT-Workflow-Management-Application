import { sopTemplateModel, sopVersionModel, sopStageModel } from '../../models/sop.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { SOP_VERSION_STATUS } from '../../config/constants.js';

function requireTemplate(templateId) {
  const template = sopTemplateModel.findById(templateId);
  if (!template) throw ApiError.notFound('SOP template');
  return template;
}

// Exactly one DRAFT per template, created on demand.
function ensureDraft(templateId) {
  const existing = sopVersionModel.findDraft(templateId);
  if (existing) return existing;

  return transaction(() => {
    const latestPublished = sopVersionModel.findLatestPublished(templateId);
    const draft = sopVersionModel.create({
      templateId,
      version: sopVersionModel.nextVersionNumber(templateId),
      status: SOP_VERSION_STATUS.DRAFT,
    });
    if (latestPublished) sopStageModel.cloneInto(latestPublished.id, draft.id);
    return draft;
  });
}

function assertDraft(version) {
  if (version.status !== SOP_VERSION_STATUS.DRAFT) {
    throw ApiError.conflict(
      'This SOP version is published and immutable. Changes must be made on the draft.',
      { versionId: version.id, version: version.version, status: version.status },
      'SOP_VERSION_IMMUTABLE',
    );
  }
}

export const sopService = {
  listTemplates({ includeInactive = false } = {}) {
    return sopTemplateModel.list({ includeInactive }).map((template) => {
      const published = sopVersionModel.findLatestPublished(template.id);
      const draft = sopVersionModel.findDraft(template.id);
      return {
        ...template,
        publishedVersion: published ? { id: published.id, version: published.version, publishedAt: published.publishedAt } : null,
        draftVersion: draft ? { id: draft.id, version: draft.version } : null,
        projectCount: sopTemplateModel.countProjects(template.id),
      };
    });
  },

  getTemplate(templateId) {
    const template = requireTemplate(templateId);
    const draft = ensureDraft(templateId);
    const published = sopVersionModel.findLatestPublished(templateId);

    return {
      ...template,
      draft: { ...draft, stages: sopStageModel.listByVersion(draft.id) },
      publishedVersion: published
        ? { ...published, stages: sopStageModel.listByVersion(published.id) }
        : null,
      versions: sopVersionModel.listByTemplate(templateId),
      projectCount: sopTemplateModel.countProjects(templateId),
    };
  },

  getVersion(versionId) {
    const version = sopVersionModel.findById(versionId);
    if (!version) throw ApiError.notFound('SOP version');
    return { ...version, stages: sopStageModel.listByVersion(version.id) };
  },

  createTemplate(payload, actorId) {
    return transaction(() => {
      const template = sopTemplateModel.create({ ...payload, createdBy: actorId });
      sopVersionModel.create({
        templateId: template.id,
        version: 1,
        status: SOP_VERSION_STATUS.DRAFT,
      });
      return sopService.getTemplate(template.id);
    });
  },

  updateTemplate(templateId, payload) {
    requireTemplate(templateId);
    sopTemplateModel.update(templateId, payload);
    return sopService.getTemplate(templateId);
  },

  deactivateTemplate(templateId) {
    requireTemplate(templateId);
    return sopTemplateModel.deactivate(templateId);
  },

  addStage(templateId, payload) {
    requireTemplate(templateId);
    const draft = ensureDraft(templateId);
    assertDraft(draft);

    return sopStageModel.create({
      ...payload,
      sopVersionId: draft.id,
      sequence: sopStageModel.nextSequence(draft.id),
    });
  },

  updateStage(templateId, stageId, payload) {
    requireTemplate(templateId);
    const stage = sopStageModel.findById(stageId);
    if (!stage) throw ApiError.notFound('SOP stage');

    const version = sopVersionModel.findById(stage.sopVersionId);
    assertDraft(version);

    return sopStageModel.update(stageId, payload);
  },

  deleteStage(templateId, stageId) {
    requireTemplate(templateId);
    const stage = sopStageModel.findById(stageId);
    if (!stage) throw ApiError.notFound('SOP stage');

    const version = sopVersionModel.findById(stage.sopVersionId);
    assertDraft(version);

    return transaction(() => {
      sopStageModel.remove(stageId);
      const remaining = sopStageModel.listByVersion(version.id);
      sopStageModel.reorder(version.id, remaining.map((s) => s.id));
      return sopStageModel.listByVersion(version.id);
    });
  },

  reorderStages(templateId, stageIds) {
    requireTemplate(templateId);
    const draft = ensureDraft(templateId);
    assertDraft(draft);

    const existing = sopStageModel.listByVersion(draft.id).map((s) => s.id);
    const sameSet =
      existing.length === stageIds.length && existing.every((id) => stageIds.includes(id));
    if (!sameSet) {
      throw ApiError.badRequest(
        'Reorder must list exactly the stages of the current draft, once each',
        { expected: existing, received: stageIds },
      );
    }

    return transaction(() => sopStageModel.reorder(draft.id, stageIds));
  },

  // Freezes the draft and opens a clone. Nothing here touches the projects table.
  publish(templateId, { changeNote } = {}, actorId) {
    requireTemplate(templateId);
    const draft = ensureDraft(templateId);
    assertDraft(draft);

    const stages = sopStageModel.listByVersion(draft.id);
    if (!stages.length) {
      throw ApiError.unprocessable(
        'Cannot publish an SOP with no stages. Add at least one stage first.',
        undefined,
        'EMPTY_SOP',
      );
    }

    return transaction(() => {
      if (changeNote !== undefined) sopVersionModel.setChangeNote(draft.id, changeNote ?? null);

      const published = sopVersionModel.markPublished(draft.id, actorId);

      const nextDraft = sopVersionModel.create({
        templateId,
        version: sopVersionModel.nextVersionNumber(templateId),
        status: SOP_VERSION_STATUS.DRAFT,
      });
      sopStageModel.cloneInto(published.id, nextDraft.id);

      return {
        published: { ...published, stages: sopStageModel.listByVersion(published.id) },
        nextDraft: { ...nextDraft, stages: sopStageModel.listByVersion(nextDraft.id) },
        projectsUsingPreviousVersions: sopTemplateModel.countProjects(templateId),
      };
    });
  },
};
