import { stageModel } from '../models/stage.model.js';
import { PROJECT_STATUS_DERIVED, PROJECT_STATUS } from '../config/constants.js';

// Derived from stage rows; only an explicit CANCELLED/ON_HOLD outranks it.
export function deriveProjectStatus(project, progress) {
  if (project?.status === PROJECT_STATUS.CANCELLED) return PROJECT_STATUS.CANCELLED;
  if (project?.status === PROJECT_STATUS.ON_HOLD) return PROJECT_STATUS_DERIVED.ON_HOLD;

  const { total, completed, blocked, onHold, notStarted } = progress;
  if (!total) return PROJECT_STATUS_DERIVED.NOT_STARTED;
  if (completed === total) return PROJECT_STATUS_DERIVED.COMPLETED;
  if (blocked > 0) return PROJECT_STATUS_DERIVED.AT_RISK;
  if (onHold > 0) return PROJECT_STATUS_DERIVED.ON_HOLD;
  if (notStarted === total) return PROJECT_STATUS_DERIVED.NOT_STARTED;
  return PROJECT_STATUS_DERIVED.IN_PROGRESS;
}

export function projectProgress(project, { clientVisibleOnly = false } = {}) {
  const progress = stageModel.progressFor(project.id, { clientVisibleOnly });
  return { ...progress, derivedStatus: deriveProjectStatus(project, progress) };
}
