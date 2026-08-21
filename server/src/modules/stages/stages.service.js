import { stageModel, statusHistoryModel, documentModel } from '../../models/stage.model.js';
import { projectModel } from '../../models/project.model.js';
import { userModel } from '../../models/user.model.js';
import { auditModel } from '../../models/audit.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { resolveScope, can } from '../../middleware/authorize.js';
import {
  STAGE_STATUS,
  STATUS_REQUIRED_FIELDS,
  AUDIT_ENTITY,
  AUDIT_ACTION,
  MODULES,
  ACTIONS,
} from '../../config/constants.js';

function loadStage(user, projectId, stageId) {
  const project = projectModel.findById(projectId);
  if (!project) throw ApiError.notFound('Project');
  if (!projectModel.isVisibleTo(projectId, resolveScope(user))) throw ApiError.notFound('Project');

  const stage = stageModel.findById(stageId);
  if (!stage || stage.projectId !== project.id) throw ApiError.notFound('Stage');

  if (user.isClientScope && !stage.clientVisible) throw ApiError.notFound('Stage');

  return { project, stage };
}

function assertMayUpdate(user, project, stage) {
  if (can(user, MODULES.PROJECTS, ACTIONS.READ_ALL)) return;
  const isAssignee = stage.assignedTo === user.id;
  const isOwner = project.ownerId === user.id;
  if (!isAssignee && !isOwner) {
    throw ApiError.forbidden(
      'You can only update stages assigned to you',
      { stageId: stage.id },
      'NOT_STAGE_OWNER',
    );
  }
}

export const stagesService = {
  list(user, projectId) {
    const project = projectModel.findById(projectId);
    if (!project) throw ApiError.notFound('Project');
    if (!projectModel.isVisibleTo(projectId, resolveScope(user))) throw ApiError.notFound('Project');

    const clientVisibleOnly = Boolean(user.isClientScope);
    return {
      stages: stageModel.listByProject(projectId, { clientVisibleOnly }),
      progress: stageModel.progressFor(projectId, { clientVisibleOnly }),
    };
  },

  // The only path that changes a stage's status.
  updateStatus(user, projectId, stageId, payload, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    assertMayUpdate(user, project, stage);

    const nextStatus = payload.status;

    for (const field of STATUS_REQUIRED_FIELDS[nextStatus] ?? []) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        throw ApiError.unprocessable(
          `"${field}" is required when setting status to ${nextStatus}`,
          { field, status: nextStatus },
          'MISSING_CONDITIONAL_FIELD',
        );
      }
    }

    if (stage.status === nextStatus && nextStatus !== STAGE_STATUS.BLOCKED) {
      throw ApiError.conflict(
        `Stage is already ${nextStatus}`,
        { status: nextStatus },
        'STATUS_UNCHANGED',
      );
    }

    return transaction(() => {
      const updated = stageModel.applyStatusChange(stageId, {
        status: nextStatus,
        blocker: nextStatus === STAGE_STATUS.BLOCKED ? payload.blocker : null,
        holdReason: nextStatus === STAGE_STATUS.ON_HOLD ? payload.holdReason : null,
        completionDate: nextStatus === STAGE_STATUS.COMPLETED ? payload.completionDate : null,
        remarks: payload.remarks ?? null,
        updatedBy: user.id,
        startedAt: nextStatus === STAGE_STATUS.IN_PROGRESS ? new Date().toISOString() : null,
      });

      statusHistoryModel.append({
        projectStageId: stageId,
        fromStatus: stage.status,
        toStatus: nextStatus,
        remarks: payload.remarks ?? null,
        blocker: payload.blocker ?? null,
        holdReason: payload.holdReason ?? null,
        completionDate: payload.completionDate ?? null,
        changedBy: user.id,
      });

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        ipAddress: requestIp,
        entityType: AUDIT_ENTITY.PROJECT_STAGE,
        entityId: stageId,
        action: AUDIT_ACTION.STATUS_CHANGE,
        summary: `${project.code} · "${stage.name}": ${stage.status} → ${nextStatus}`,
        oldValue: { status: stage.status },
        newValue: {
          status: nextStatus,
          blocker: payload.blocker ?? null,
          holdReason: payload.holdReason ?? null,
          completionDate: payload.completionDate ?? null,
        },
      });

      return {
        stage: updated,
        progress: stageModel.progressFor(projectId),
      };
    });
  },

  statusHistory(user, projectId, stageId) {
    const { stage } = loadStage(user, projectId, stageId);
    if (user.isClientScope) throw ApiError.forbidden('Status history is not available to client users');
    return statusHistoryModel.listByStage(stage.id);
  },

  assign(user, projectId, stageId, payload) {
    const { project, stage } = loadStage(user, projectId, stageId);

    if (payload.assignedTo) {
      const assignee = userModel.findById(payload.assignedTo);
      if (!assignee) throw ApiError.badRequest('Assignee not found', { field: 'assignedTo' });
      if (!assignee.isActive) {
        throw ApiError.badRequest('Cannot assign work to a deactivated user', { field: 'assignedTo' });
      }
      projectModel.addMember(project.id, payload.assignedTo, 'MEMBER');
    }

    return { before: stage, after: stageModel.updateAssignment(stageId, { ...payload, updatedBy: user.id }) };
  },

  listDocuments(user, projectId, stageId) {
    const { stage } = loadStage(user, projectId, stageId);
    if (user.isClientScope) throw ApiError.forbidden('Documents are not available to client users');
    return documentModel.listByStage(stage.id);
  },

  // Records the attachment only. Status is deliberately never written here.
  addDocument(user, projectId, stageId, payload, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    const statusBefore = stage.status;

    const result = transaction(() => {
      const document = documentModel.create({
        projectStageId: stage.id,
        fileName: payload.fileName,
        fileUrl: payload.fileUrl,
        docType: payload.docType,
        version: documentModel.nextVersion(stage.id, payload.fileName),
        notes: payload.notes ?? null,
        uploadedBy: user.id,
      });

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        ipAddress: requestIp,
        entityType: AUDIT_ENTITY.DOCUMENT,
        entityId: document.id,
        action: AUDIT_ACTION.UPLOAD,
        summary: `${project.code} · "${stage.name}": ${payload.docType === 'LINK' ? 'link' : 'document'} "${payload.fileName}" attached (stage status unchanged: ${statusBefore})`,
        newValue: { fileName: document.fileName, version: document.version, stageStatus: statusBefore },
      });

      return document;
    });

    const after = stageModel.findById(stage.id);

    return {
      document: result,
      stageStatus: after.status,
      statusUnchanged: after.status === statusBefore,
    };
  },

  myAssignments(user) {
    return stageModel.listAssignedTo(user.id);
  },
};
