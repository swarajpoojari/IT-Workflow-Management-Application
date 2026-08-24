import { bugModel, bugEventModel } from '../../models/bug.model.js';
import { stageModel } from '../../models/stage.model.js';
import { projectModel } from '../../models/project.model.js';
import { userModel } from '../../models/user.model.js';
import { auditModel } from '../../models/audit.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { resolveScope } from '../../middleware/authorize.js';
import { assertStagePermission } from '../../middleware/stagePermission.js';
import { notify } from '../../services/notification.service.js';
import {
  BUG_STATUS,
  BUG_TRANSITIONS,
  STAGE_TYPE,
  STAGE_ACTIONS,
  NOTIFICATION_TYPE,
  AUDIT_ENTITY,
  AUDIT_ACTION,
} from '../../config/constants.js';

function loadStage(user, projectId, stageId) {
  const project = projectModel.findById(projectId);
  if (!project) throw ApiError.notFound('Project');
  if (!projectModel.isVisibleTo(projectId, resolveScope(user))) throw ApiError.notFound('Project');

  const stage = stageModel.findById(stageId);
  if (!stage || stage.projectId !== project.id) throw ApiError.notFound('Stage');

  if (stage.stageType !== STAGE_TYPE.TESTING) {
    throw ApiError.unprocessable(
      `Bugs can only be raised against a Testing stage. "${stage.name}" is a ${stage.stageType} stage.`,
      { stageId: stage.id, stageType: stage.stageType },
      'NOT_A_TESTING_STAGE',
    );
  }

  return { project, stage };
}

// Which stage action a target status demands.
const ACTION_FOR_STATUS = {
  [BUG_STATUS.IN_PROGRESS]: STAGE_ACTIONS.RESOLVE_BUG,
  [BUG_STATUS.FIXED]: STAGE_ACTIONS.RESOLVE_BUG,
  [BUG_STATUS.RETEST]: STAGE_ACTIONS.CLOSE_BUG,
  [BUG_STATUS.CLOSED]: STAGE_ACTIONS.CLOSE_BUG,
  [BUG_STATUS.REOPENED]: STAGE_ACTIONS.CLOSE_BUG,
  [BUG_STATUS.OPEN]: STAGE_ACTIONS.RESOLVE_BUG,
};

// QA raises and closes, development resolves; which side is a stage permission.
export const bugsService = {
  listForStage(user, projectId, stageId) {
    const { stage } = loadStage(user, projectId, stageId);
    if (user.isClientScope) throw ApiError.forbidden('Bug details are not available to client users');
    return {
      bugs: bugModel.listByStage(stage.id),
      openCount: bugModel.openCountForStage(stage.id),
    };
  },

  get(user, projectId, bugId) {
    const bug = bugModel.findById(bugId);
    if (!bug || bug.projectId !== Number(projectId)) throw ApiError.notFound('Bug');
    if (user.isClientScope) throw ApiError.forbidden('Bug details are not available to client users');
    if (!projectModel.isVisibleTo(bug.projectId, resolveScope(user))) throw ApiError.notFound('Bug');
    return { bug, events: bugEventModel.listByBug(bug.id) };
  },

  raise(user, projectId, stageId, payload, requestIp) {
    const { project, stage } = loadStage(user, projectId, stageId);
    assertStagePermission(user, project, stage, STAGE_ACTIONS.RAISE_BUG);

    if (payload.assignedTo) {
      const assignee = userModel.findById(payload.assignedTo);
      if (!assignee || !assignee.isActive) {
        throw ApiError.badRequest('Assignee must be an active user', { field: 'assignedTo' });
      }
    }

    const bug = transaction(() => {
      const created = bugModel.create({
        projectId: project.id,
        projectStageId: stage.id,
        reference: bugModel.nextReference(project.id),
        title: payload.title,
        description: payload.description,
        severity: payload.severity,
        raisedBy: user.id,
        assignedTo: payload.assignedTo ?? null,
      });

      bugEventModel.append({
        bugId: created.id,
        fromStatus: null,
        toStatus: BUG_STATUS.OPEN,
        note: payload.description ?? null,
        actorId: user.id,
      });

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        ipAddress: requestIp,
        entityType: AUDIT_ENTITY.BUG,
        entityId: created.id,
        action: AUDIT_ACTION.BUG_RAISED,
        summary: `${project.code} - ${created.reference} raised against "${stage.name}": ${created.title}`,
        newValue: { reference: created.reference, severity: created.severity, stageId: stage.id },
      });

      return created;
    });

    notify({
      userId: bug.assignedTo,
      actorId: user.id,
      type: NOTIFICATION_TYPE.BUG_ASSIGNED,
      title: `${bug.reference} assigned to you`,
      body: bug.title,
      entityType: AUDIT_ENTITY.BUG,
      entityId: bug.id,
      link: `/projects/${projectId}?stage=${stageId}&bug=${bug.id}`,
    });
    notify({
      userId: project.ownerId,
      actorId: user.id,
      type: NOTIFICATION_TYPE.BUG_RAISED,
      title: `${bug.reference} raised on ${project.code}`,
      body: bug.title,
      entityType: AUDIT_ENTITY.BUG,
      entityId: bug.id,
      link: `/projects/${projectId}?stage=${stageId}&bug=${bug.id}`,
    });

    return { bug, openCount: bugModel.openCountForStage(stage.id) };
  },

  transition(user, projectId, bugId, { status, note, assignedTo }, requestIp) {
    const bug = bugModel.findById(bugId);
    if (!bug || bug.projectId !== Number(projectId)) throw ApiError.notFound('Bug');

    const { project, stage } = loadStage(user, projectId, bug.projectStageId);
    assertStagePermission(user, project, stage, ACTION_FOR_STATUS[status] ?? STAGE_ACTIONS.RESOLVE_BUG);

    const legal = BUG_TRANSITIONS[bug.status] ?? [];
    if (!legal.includes(status)) {
      throw ApiError.unprocessable(
        `A ${bug.status} bug cannot move to ${status}.`,
        { from: bug.status, to: status, allowed: legal },
        'ILLEGAL_BUG_TRANSITION',
      );
    }

    if (status === BUG_STATUS.CLOSED && !note) {
      throw ApiError.unprocessable('A closing note is required', { field: 'note' }, 'NOTE_REQUIRED');
    }

    const updated = transaction(() => {
      const next = bugModel.applyTransition(bug.id, {
        status,
        assignedTo,
        resolutionNote: status === BUG_STATUS.CLOSED || status === BUG_STATUS.FIXED ? note : null,
        incrementReopen: status === BUG_STATUS.REOPENED,
      });

      bugEventModel.append({
        bugId: bug.id,
        fromStatus: bug.status,
        toStatus: status,
        note: note ?? null,
        actorId: user.id,
      });

      auditModel.append({
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.roleKey,
        ipAddress: requestIp,
        entityType: AUDIT_ENTITY.BUG,
        entityId: bug.id,
        action: AUDIT_ACTION.BUG_STATUS,
        summary: `${project.code} - ${bug.reference}: ${bug.status} -> ${status}`,
        oldValue: { status: bug.status },
        newValue: { status, note: note ?? null },
      });

      return next;
    });

    const audience = status === BUG_STATUS.REOPENED || status === BUG_STATUS.IN_PROGRESS
      ? updated.assignedTo
      : bug.raisedBy;
    notify({
      userId: audience,
      actorId: user.id,
      type: NOTIFICATION_TYPE.BUG_STATUS,
      title: `${bug.reference} is now ${status.replace('_', ' ').toLowerCase()}`,
      body: note ?? null,
      entityType: AUDIT_ENTITY.BUG,
      entityId: bug.id,
      link: `/projects/${projectId}?stage=${bug.projectStageId}&bug=${bug.id}`,
    });

    return {
      bug: updated,
      events: bugEventModel.listByBug(bug.id),
      openCount: bugModel.openCountForStage(bug.projectStageId),
      stageCanComplete: bugModel.openCountForStage(bug.projectStageId) === 0,
    };
  },

  projectSummary(user, projectId) {
    if (!projectModel.isVisibleTo(Number(projectId), resolveScope(user))) throw ApiError.notFound('Project');
    if (user.isClientScope) throw ApiError.forbidden('Bug details are not available to client users');
    return { stats: bugModel.stats(projectId), bugs: bugModel.listByProject(projectId) };
  },
};
