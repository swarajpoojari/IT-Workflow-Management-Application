import { Router } from 'express';
import { stagesService } from './stages.service.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit, diff } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';
import { z } from 'zod';
import { stageParams, projectParam, updateStatusSchema, assignStageSchema, addDocumentSchema } from './stages.schema.js';

const signoffSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(2000).optional().nullable(),
});

const stagePermissionsSchema = z.object({
  grants: z.array(z.object({
    roleId: z.coerce.number().int().positive(),
    action: z.string().trim().min(2).max(40),
  })),
});

const router = Router({ mergeParams: true });

router.get(
  '/',
  requirePermission(MODULES.STAGES, ACTIONS.READ),
  validate({ params: projectParam }),
  asyncHandler((req, res) => {
    res.json(stagesService.list(req.user, req.params.projectId));
  }),
);

router.patch(
  '/:stageId/status',
  requirePermission(MODULES.STAGES, ACTIONS.UPDATE_STATUS),
  validate({ params: stageParams, body: updateStatusSchema }),
  asyncHandler((req, res) => {
    const result = stagesService.updateStatus(
      req.user,
      req.params.projectId,
      req.params.stageId,
      req.body,
      req.ip,
    );
    res.json(result);
  }),
);

router.get(
  '/:stageId',
  requirePermission(MODULES.STAGES, ACTIONS.READ),
  validate({ params: stageParams }),
  asyncHandler((req, res) => {
    res.json(stagesService.detail(req.user, req.params.projectId, req.params.stageId));
  }),
);

router.post(
  '/:stageId/signoff',
  requirePermission(MODULES.STAGES, ACTIONS.READ),
  validate({ params: stageParams, body: signoffSchema }),
  asyncHandler((req, res) => {
    res.status(201).json(
      stagesService.recordSignoff(req.user, req.params.projectId, req.params.stageId, req.body, req.ip),
    );
  }),
);

router.get(
  '/:stageId/permissions',
  requirePermission(MODULES.STAGES, ACTIONS.READ),
  validate({ params: stageParams }),
  asyncHandler((req, res) => {
    res.json({ permissions: stagesService.stagePermissions(req.user, req.params.projectId, req.params.stageId) });
  }),
);

router.put(
  '/:stageId/permissions',
  requirePermission(MODULES.ROLES, ACTIONS.UPDATE),
  validate({ params: stageParams, body: stagePermissionsSchema }),
  asyncHandler((req, res) => {
    const permissions = stagesService.setStagePermissions(
      req.user, req.params.projectId, req.params.stageId, req.body.grants,
    );
    recordAudit(req, {
      entityType: AUDIT_ENTITY.PROJECT_STAGE,
      entityId: req.params.stageId,
      action: AUDIT_ACTION.UPDATE,
      summary: `Stage-level permissions updated for stage ${req.params.stageId}`,
      newValue: { grants: req.body.grants },
    });
    res.json({ permissions });
  }),
);

router.get(
  '/:stageId/status-history',
  requirePermission(MODULES.STAGES, ACTIONS.READ),
  validate({ params: stageParams }),
  asyncHandler((req, res) => {
    res.json({ history: stagesService.statusHistory(req.user, req.params.projectId, req.params.stageId) });
  }),
);

router.patch(
  '/:stageId/assign',
  requirePermission(MODULES.STAGES, ACTIONS.ASSIGN),
  validate({ params: stageParams, body: assignStageSchema }),
  asyncHandler((req, res) => {
    const { before, after } = stagesService.assign(
      req.user,
      req.params.projectId,
      req.params.stageId,
      req.body,
    );
    const change = diff(before, after, ['assignedTo', 'dueDate']);
    if (change) {
      recordAudit(req, {
        entityType: AUDIT_ENTITY.PROJECT_STAGE,
        entityId: after.id,
        action: AUDIT_ACTION.ASSIGN,
        summary: `"${after.name}" assignment updated (status left at ${after.status})`,
        ...change,
      });
    }
    res.json({ stage: after });
  }),
);

router.get(
  '/:stageId/documents',
  requirePermission(MODULES.DOCUMENTS, ACTIONS.READ),
  validate({ params: stageParams }),
  asyncHandler((req, res) => {
    res.json({ documents: stagesService.listDocuments(req.user, req.params.projectId, req.params.stageId) });
  }),
);

router.post(
  '/:stageId/documents',
  requirePermission(MODULES.DOCUMENTS, ACTIONS.CREATE),
  validate({ params: stageParams, body: addDocumentSchema }),
  asyncHandler((req, res) => {
    const result = stagesService.addDocument(
      req.user,
      req.params.projectId,
      req.params.stageId,
      req.body,
      req.ip,
    );
    res.status(201).json(result);
  }),
);

export default router;
