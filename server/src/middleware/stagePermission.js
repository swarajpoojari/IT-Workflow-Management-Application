import { stagePermissionModel } from '../models/stagePermission.model.js';
import { ApiError } from '../utils/ApiError.js';
import { can } from './authorize.js';
import { MODULES, ACTIONS } from '../config/constants.js';

// Stage grant, else assignee/owner keeps everyday actions, else administrator.
export function resolveStageAccess(user, project, stage) {
  if (!user || !stage) return { allowed: [], reason: 'no-context' };

  if (can(user, MODULES.PROJECTS, ACTIONS.READ_ALL)) {
    return { allowed: 'ALL', reason: 'administrator' };
  }

  const granted = new Set(stagePermissionModel.actionsForRole(stage.id, user.roleId));

  if (stage.assignedTo === user.id || project?.ownerId === user.id) {
    granted.add('view');
    granted.add('update_status');
    granted.add('upload_evidence');
  }

  return { allowed: [...granted], reason: granted.size ? 'stage-grant' : 'none' };
}

export function stageAllows(user, project, stage, action) {
  const { allowed } = resolveStageAccess(user, project, stage);
  return allowed === 'ALL' || allowed.includes(action);
}

export function assertStagePermission(user, project, stage, action) {
  if (stageAllows(user, project, stage, action)) return;
  throw ApiError.forbidden(
    `Your role has no "${action}" permission on the stage "${stage.name}"`,
    { stageId: stage.id, stageName: stage.name, action, role: user.roleKey },
    'STAGE_PERMISSION_DENIED',
  );
}
