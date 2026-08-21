import { projectModel } from '../../models/project.model.js';
import { stageModel, statusHistoryModel, documentModel } from '../../models/stage.model.js';
import { sopTemplateModel, sopVersionModel, sopStageModel } from '../../models/sop.model.js';
import { userModel } from '../../models/user.model.js';
import { auditModel } from '../../models/audit.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { resolveScope, can } from '../../middleware/authorize.js';
import { MODULES, ACTIONS, AUDIT_ENTITY, AUDIT_ACTION } from '../../config/constants.js';

export const projectsService = {
  list(user, { status, search, limit, offset }) {
    return projectModel.list({ scope: resolveScope(user), status, search, limit, offset });
  },

  get(user, projectId) {
    const scope = resolveScope(user);
    const project = projectModel.findById(projectId);
    if (!project) throw ApiError.notFound('Project');

    // 404 rather than 403: confirming existence is itself a disclosure.
    if (!projectModel.isVisibleTo(projectId, scope)) throw ApiError.notFound('Project');

    const clientVisibleOnly = Boolean(user.isClientScope);
    const stages = stageModel.listByProject(projectId, { clientVisibleOnly });

    const withDetail = stages.map((stage) => {
      const enriched = { ...stage };
      if (can(user, MODULES.DOCUMENTS, ACTIONS.READ)) {
        enriched.documents = documentModel.listByStage(stage.id);
      }
      if (can(user, MODULES.STAGES, ACTIONS.READ) && !user.isClientScope) {
        enriched.statusHistory = statusHistoryModel.listByStage(stage.id).slice(0, 5);
      }
      return enriched;
    });

    return {
      ...project,
      progress: stageModel.progressFor(projectId, { clientVisibleOnly }),
      stages: withDetail,
      members: can(user, MODULES.PROJECTS, ACTIONS.ASSIGN) ? projectModel.members(projectId) : undefined,
      sopVersionLocked: true,
    };
  },

  previewStages(sopTemplateId) {
    const template = sopTemplateModel.findById(sopTemplateId);
    if (!template) throw ApiError.notFound('SOP template');

    const version = sopVersionModel.findLatestPublished(sopTemplateId);
    if (!version) {
      throw ApiError.unprocessable(
        `"${template.name}" has no published version yet. Publish the SOP before creating projects from it.`,
        { sopTemplateId },
        'NO_PUBLISHED_SOP',
      );
    }

    return {
      template: { id: template.id, name: template.name },
      sopVersion: { id: version.id, version: version.version, publishedAt: version.publishedAt },
      stages: sopStageModel.listByVersion(version.id),
    };
  },

  // Resolves the latest published SOP version and generates the board in one transaction.
  create(user, payload) {
    const template = sopTemplateModel.findById(payload.sopTemplateId);
    if (!template) throw ApiError.notFound('SOP template');
    if (!template.isActive) {
      throw ApiError.unprocessable('This SOP template is inactive', { sopTemplateId: template.id });
    }

    if (projectModel.findByCode(payload.code)) {
      throw ApiError.conflict(`Project code "${payload.code}" is already in use`, { field: 'code' }, 'DUPLICATE_CODE');
    }

    const sopVersion = sopVersionModel.findLatestPublished(template.id);
    if (!sopVersion) {
      throw ApiError.unprocessable(
        `"${template.name}" has no published version. Publish the SOP first.`,
        { sopTemplateId: template.id },
        'NO_PUBLISHED_SOP',
      );
    }

    if (payload.ownerId) {
      const owner = userModel.findById(payload.ownerId);
      if (!owner) throw ApiError.badRequest('Project owner not found', { field: 'ownerId' });
      if (!owner.isActive) throw ApiError.badRequest('Project owner is deactivated', { field: 'ownerId' });
    }

    return transaction(() => {
      const project = projectModel.create({
        ...payload,
        sopVersionId: sopVersion.id,
        createdBy: user.id,
      });

      const generated = stageModel.generateFromSopVersion(project.id, sopVersion.id);
      if (generated === 0) {
        throw ApiError.unprocessable(
          'The published SOP version contains no stages',
          { sopVersionId: sopVersion.id },
          'EMPTY_SOP',
        );
      }

      if (payload.ownerId) projectModel.addMember(project.id, payload.ownerId, 'OWNER');
      for (const memberId of payload.memberIds ?? []) {
        if (memberId !== payload.ownerId) projectModel.addMember(project.id, memberId, 'MEMBER');
      }

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        entityType: AUDIT_ENTITY.PROJECT,
        entityId: project.id,
        action: AUDIT_ACTION.CREATE,
        summary: `Project ${project.code} created from "${template.name}" v${sopVersion.version} — ${generated} stages generated`,
        newValue: {
          code: project.code,
          sopTemplate: template.name,
          sopVersionId: sopVersion.id,
          sopVersion: sopVersion.version,
          stagesGenerated: generated,
        },
      });

      return {
        ...projectModel.findById(project.id),
        stages: stageModel.listByProject(project.id),
        stagesGenerated: generated,
      };
    });
  },

  update(user, projectId, patch) {
    const project = projectModel.findById(projectId);
    if (!project) throw ApiError.notFound('Project');

    if (patch.ownerId) {
      const owner = userModel.findById(patch.ownerId);
      if (!owner || !owner.isActive) throw ApiError.badRequest('Project owner must be an active user');
    }

    const updated = projectModel.update(projectId, patch);
    if (patch.ownerId) projectModel.addMember(projectId, patch.ownerId, 'OWNER');
    return { before: project, after: updated };
  },

  addMember(projectId, { userId, roleInProject }) {
    if (!projectModel.findById(projectId)) throw ApiError.notFound('Project');
    const member = userModel.findById(userId);
    if (!member) throw ApiError.notFound('User');
    if (!member.isActive) throw ApiError.badRequest('Cannot add a deactivated user to a project');

    projectModel.addMember(projectId, userId, roleInProject);
    return projectModel.members(projectId);
  },

  removeMember(projectId, userId) {
    if (!projectModel.findById(projectId)) throw ApiError.notFound('Project');
    projectModel.removeMember(projectId, userId);
    return projectModel.members(projectId);
  },

  summary(user) {
    const scope = resolveScope(user);
    const { items } = projectModel.list({ scope, limit: 500, offset: 0 });
    const clientVisibleOnly = Boolean(user.isClientScope);

    return items.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      clientName: project.clientName,
      status: project.status,
      targetEndDate: project.targetEndDate,
      sopVersionNumber: project.sopVersionNumber,
      progress: stageModel.progressFor(project.id, { clientVisibleOnly }),
    }));
  },
};
