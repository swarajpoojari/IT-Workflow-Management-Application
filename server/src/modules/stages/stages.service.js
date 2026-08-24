import { stageModel, statusHistoryModel, documentModel } from '../../models/stage.model.js';
import { projectModel } from '../../models/project.model.js';
import { userModel } from '../../models/user.model.js';
import { auditModel } from '../../models/audit.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { resolveScope, can } from '../../middleware/authorize.js';
import { assertStagePermission, resolveStageAccess } from '../../middleware/stagePermission.js';
import { bugModel } from '../../models/bug.model.js';
import { signoffModel } from '../../models/signoff.model.js';
import { stagePermissionModel } from '../../models/stagePermission.model.js';
import { notify } from '../../services/notification.service.js';
import {
  STAGE_STATUS,
  STATUS_REQUIRED_FIELDS,
  STAGE_TYPE,
  STAGE_ACTIONS,
  SIGNOFF_DECISION,
  NOTIFICATION_TYPE,
  AUDIT_ENTITY,
  AUDIT_ACTION,
  MODULES,
  ACTIONS,
} from '../../config/constants.js';

// The two completion gates: open bugs on a TESTING stage, and required sign-off.
function assertCompletionAllowed(stage) {
  if (stage.stageType === STAGE_TYPE.TESTING) {
    const openBugs = bugModel.openForStage(stage.id);
    if (openBugs.length) {
      throw ApiError.conflict(
        `"${stage.name}" cannot be closed while ${openBugs.length} bug${openBugs.length === 1 ? ' is' : 's are'} still open.`,
        {
          stageId: stage.id,
          openBugCount: openBugs.length,
          bugs: openBugs.map((b) => ({ id: b.id, reference: b.reference, title: b.title, status: b.status, severity: b.severity })),
        },
        'OPEN_BUGS_BLOCK_COMPLETION',
      );
    }
  }

  if (stage.requiresSignoff) {
    const latest = signoffModel.latestFor(stage.id);
    if (!latest || latest.decision !== SIGNOFF_DECISION.APPROVED) {
      throw ApiError.conflict(
        `"${stage.name}" requires an approved sign-off before it can be completed.`,
        { stageId: stage.id, currentDecision: latest?.decision ?? null },
        'SIGNOFF_REQUIRED',
      );
    }
  }
}

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

  updateStatus(user, projectId, stageId, payload, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    assertStagePermission(user, project, stage, STAGE_ACTIONS.UPDATE_STATUS);

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

    if (nextStatus === STAGE_STATUS.COMPLETED) assertCompletionAllowed(stage);

    if (stage.status === nextStatus && nextStatus !== STAGE_STATUS.BLOCKED) {
      throw ApiError.conflict(
        `Stage is already ${nextStatus}`,
        { status: nextStatus },
        'STATUS_UNCHANGED',
      );
    }

    const result = transaction(() => {
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

    notify({
      userId: project.ownerId,
      actorId: user.id,
      type: NOTIFICATION_TYPE.STAGE_STATUS,
      title: `${project.code} · ${stage.name} is now ${nextStatus.replace('_', ' ').toLowerCase()}`,
      body: payload.remarks ?? null,
      entityType: AUDIT_ENTITY.PROJECT_STAGE,
      entityId: stageId,
      link: `/projects/${projectId}?stage=${stageId}`,
    });

    return result;
  },

  detail(user, projectId, stageId) {
    const { project, stage } = loadStage(user, projectId, stageId);
    const access = resolveStageAccess(user, project, stage);
    const allowed = (action) => access.allowed === 'ALL' || access.allowed.includes(action);

    const openBugs = stage.stageType === STAGE_TYPE.TESTING ? bugModel.openForStage(stage.id) : [];
    const latestSignoff = signoffModel.latestFor(stage.id);

    return {
      stage,
      permissions: {
        allowed: access.allowed === 'ALL' ? Object.values(STAGE_ACTIONS) : access.allowed,
        source: access.reason,
      },
      statusHistory: user.isClientScope ? [] : statusHistoryModel.listByStage(stage.id),
      documents: allowed(STAGE_ACTIONS.VIEW) && !user.isClientScope ? documentModel.listByStage(stage.id) : [],
      signoffs: user.isClientScope ? [] : signoffModel.listByStage(stage.id),
      bugs: user.isClientScope ? [] : bugModel.listByStage(stage.id),
      completionBlockers: {
        openBugs: openBugs.length,
        signoffRequired: Boolean(stage.requiresSignoff),
        signoffDecision: latestSignoff?.decision ?? null,
        canComplete:
          openBugs.length === 0 &&
          (!stage.requiresSignoff || latestSignoff?.decision === SIGNOFF_DECISION.APPROVED),
      },
    };
  },

  recordSignoff(user, projectId, stageId, { decision, note }, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    assertStagePermission(user, project, stage, STAGE_ACTIONS.SIGNOFF);

    if (stage.status === STAGE_STATUS.COMPLETED) {
      throw ApiError.conflict('This stage is already completed', undefined, 'STAGE_COMPLETED');
    }

    const signoff = transaction(() => {
      const row = signoffModel.create({
        projectStageId: stage.id,
        decision,
        note: note ?? null,
        signedBy: user.id,
        signedRole: user.roleKey,
      });

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        ipAddress: requestIp,
        entityType: AUDIT_ENTITY.SIGNOFF,
        entityId: row.id,
        action: AUDIT_ACTION.SIGNOFF,
        summary: `${project.code} - "${stage.name}" signed off as ${decision} by ${user.email}`,
        newValue: { decision, note: note ?? null, stageId: stage.id },
      });

      return row;
    });

    notify({
      userId: project.ownerId,
      actorId: user.id,
      type: NOTIFICATION_TYPE.SIGNOFF_RECORDED,
      title: `${stage.name} ${decision === SIGNOFF_DECISION.APPROVED ? 'approved' : 'rejected'}`,
      body: note ?? null,
      entityType: AUDIT_ENTITY.PROJECT_STAGE,
      entityId: stage.id,
      link: `/projects/${projectId}?stage=${stageId}`,
    });

    return { signoff, signoffs: signoffModel.listByStage(stage.id) };
  },

  stagePermissions(user, projectId, stageId) {
    const { stage } = loadStage(user, projectId, stageId);
    return stagePermissionModel.listForProjectStage(stage.id);
  },

  setStagePermissions(user, projectId, stageId, grants) {
    const { stage } = loadStage(user, projectId, stageId);
    stagePermissionModel.setForProjectStage(stage.id, grants);
    return stagePermissionModel.listForProjectStage(stage.id);
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

    const after = stageModel.updateAssignment(stageId, { ...payload, updatedBy: user.id });

    if (payload.assignedTo && payload.assignedTo !== stage.assignedTo) {
      notify({
        userId: payload.assignedTo,
        actorId: user.id,
        type: NOTIFICATION_TYPE.STAGE_ASSIGNED,
        title: `You were assigned "${stage.name}"`,
        body: `${project.code} - ${project.name}`,
        entityType: AUDIT_ENTITY.PROJECT_STAGE,
        entityId: stageId,
        link: `/projects/${project.id}?stage=${stageId}`,
      });
    }

    return { before: stage, after };
  },

  listDocuments(user, projectId, stageId) {
    const { stage } = loadStage(user, projectId, stageId);
    if (user.isClientScope) throw ApiError.forbidden('Documents are not available to client users');
    return documentModel.listByStage(stage.id);
  },

  addDocument(user, projectId, stageId, payload, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    assertStagePermission(user, project, stage, STAGE_ACTIONS.UPLOAD_EVIDENCE);
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
