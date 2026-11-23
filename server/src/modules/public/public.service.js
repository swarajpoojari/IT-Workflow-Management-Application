import { projectModel } from '../../models/project.model.js';
import { stageModel } from '../../models/stage.model.js';
import { auditModel } from '../../models/audit.model.js';
import { brdAccessLogModel } from '../../models/settings.model.js';
import { deriveProjectStatus } from '../../services/projectStatus.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUDIT_ENTITY, AUDIT_ACTION } from '../../config/constants.js';

// Whitelist, not a strip: there is no principal here, so it must fail closed.
const publicStage = (stage) => ({
  name: stage.name,
  description: stage.description,
  sequence: stage.sequence,
  status: stage.status,
  dueDate: stage.dueDate,
  startedAt: stage.startedAt,
  completionDate: stage.completionDate,
  assigneeName: stage.assigneeName ?? null,
  owningTeamName: stage.owningTeamName ?? null,
});

function contactsFor(stages) {
  const seen = new Map();
  for (const stage of stages) {
    if (!stage.assigneeName) continue;
    if (!seen.has(stage.assigneeName)) {
      seen.set(stage.assigneeName, { name: stage.assigneeName, role: stage.owningTeamName ?? stage.name });
    }
  }
  return [...seen.values()];
}

function activityFor(stages) {
  return stages
    .filter((s) => s.completionDate || s.startedAt)
    .flatMap((s) => {
      const events = [];
      if (s.startedAt) {
        events.push({
          at: s.startedAt,
          label: `${s.name} moved to in progress`,
          status: 'IN_PROGRESS',
          actor: s.assigneeName ?? null,
        });
      }
      if (s.completionDate) {
        events.push({
          at: s.completionDate,
          label: `${s.name} completed`,
          status: 'COMPLETED',
          actor: s.assigneeName ?? null,
        });
      }
      return events;
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

export const publicService = {
  trackByBrd(brdNumber, { ip, userAgent }) {
    const normalised = String(brdNumber || '').trim().toUpperCase();
    const project = normalised ? projectModel.findByBrd(normalised) : null;

    brdAccessLogModel.record({ brdNumber: normalised.slice(0, 40), found: Boolean(project), ipAddress: ip, userAgent });

    // Same 404 for malformed and unknown, so BRD numbers cannot be enumerated.
    if (!project) {
      throw ApiError.notFound('No project found for that BRD number');
    }

    const stages = stageModel.listByProject(project.id, { clientVisibleOnly: true });
    const progress = stageModel.progressFor(project.id, { clientVisibleOnly: true });

    auditModel.append({
      actorId: null,
      actorEmail: null,
      actorRole: 'PUBLIC',
      ipAddress: ip,
      entityType: AUDIT_ENTITY.BRD_LOOKUP,
      entityId: project.id,
      action: AUDIT_ACTION.VIEW,
      summary: `Public BRD lookup for ${normalised}`,
    });

    return {
      project: {
        brdNumber: project.brdNumber,
        name: project.name,
        description: project.description ?? null,
        clientName: project.clientName,
        status: deriveProjectStatus(project, progress),
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        owner: project.ownerName ?? null,
      },
      progress: {
        total: progress.total,
        completed: progress.completed,
        percentComplete: progress.percentComplete,
      },
      stages: stages.map(publicStage),
      contacts: contactsFor(stages),
      activity: activityFor(stages),
    };
  },
};
