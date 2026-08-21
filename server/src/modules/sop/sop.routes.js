import { Router } from 'express';
import { z } from 'zod';
import { sopService } from './sop.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';
import {
  idParam,
  stageParams,
  createTemplateSchema,
  updateTemplateSchema,
  createStageSchema,
  updateStageSchema,
  reorderSchema,
  publishSchema,
} from './sop.schema.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.SOP, ACTIONS.READ),
  validate({ query: z.object({ includeInactive: z.coerce.boolean().optional() }) }),
  asyncHandler((req, res) => {
    res.json({ templates: sopService.listTemplates({ includeInactive: req.query.includeInactive }) });
  }),
);

router.post(
  '/',
  requirePermission(MODULES.SOP, ACTIONS.CREATE),
  validate({ body: createTemplateSchema }),
  asyncHandler((req, res) => {
    const template = sopService.createTemplate(req.body, req.user.id);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_TEMPLATE,
      entityId: template.id,
      action: AUDIT_ACTION.CREATE,
      summary: `SOP template "${template.name}" created`,
      newValue: { name: template.name, category: template.category },
    });
    res.status(201).json({ template });
  }),
);

router.get(
  '/:id',
  requirePermission(MODULES.SOP, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ template: sopService.getTemplate(req.params.id) });
  }),
);

router.patch(
  '/:id',
  requirePermission(MODULES.SOP, ACTIONS.UPDATE),
  validate({ params: idParam, body: updateTemplateSchema }),
  asyncHandler((req, res) => {
    const before = sopService.getTemplate(req.params.id);
    const template = sopService.updateTemplate(req.params.id, req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_TEMPLATE,
      entityId: template.id,
      action: AUDIT_ACTION.UPDATE,
      summary: `SOP template "${template.name}" updated`,
      oldValue: { name: before.name, description: before.description, isActive: before.isActive },
      newValue: { name: template.name, description: template.description, isActive: template.isActive },
    });
    res.json({ template });
  }),
);

router.delete(
  '/:id',
  requirePermission(MODULES.SOP, ACTIONS.DELETE),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    const template = sopService.deactivateTemplate(req.params.id);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_TEMPLATE,
      entityId: template.id,
      action: AUDIT_ACTION.DELETE,
      summary: `SOP template "${template.name}" deactivated`,
    });
    res.json({ template });
  }),
);

router.get(
  '/versions/:id',
  requirePermission(MODULES.SOP, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ version: sopService.getVersion(req.params.id) });
  }),
);

router.post(
  '/:id/stages',
  requirePermission(MODULES.SOP, ACTIONS.UPDATE),
  validate({ params: idParam, body: createStageSchema }),
  asyncHandler((req, res) => {
    const stage = sopService.addStage(req.params.id, req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_STAGE,
      entityId: stage.id,
      action: AUDIT_ACTION.CREATE,
      summary: `Stage "${stage.name}" added to SOP draft`,
      newValue: { name: stage.name, sequence: stage.sequence, clientVisible: stage.clientVisible },
    });
    res.status(201).json({ stage });
  }),
);

router.patch(
  '/:id/stages/:stageId',
  requirePermission(MODULES.SOP, ACTIONS.UPDATE),
  validate({ params: stageParams, body: updateStageSchema }),
  asyncHandler((req, res) => {
    const stage = sopService.updateStage(req.params.id, req.params.stageId, req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_STAGE,
      entityId: stage.id,
      action: AUDIT_ACTION.UPDATE,
      summary: `Stage "${stage.name}" updated`,
      newValue: req.body,
    });
    res.json({ stage });
  }),
);

router.delete(
  '/:id/stages/:stageId',
  requirePermission(MODULES.SOP, ACTIONS.UPDATE),
  validate({ params: stageParams }),
  asyncHandler((req, res) => {
    const stages = sopService.deleteStage(req.params.id, req.params.stageId);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_STAGE,
      entityId: req.params.stageId,
      action: AUDIT_ACTION.DELETE,
      summary: 'Stage removed from SOP draft',
    });
    res.json({ stages });
  }),
);

router.put(
  '/:id/stages/reorder',
  requirePermission(MODULES.SOP, ACTIONS.REORDER),
  validate({ params: idParam, body: reorderSchema }),
  asyncHandler((req, res) => {
    const stages = sopService.reorderStages(req.params.id, req.body.stageIds);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_TEMPLATE,
      entityId: req.params.id,
      action: AUDIT_ACTION.REORDER,
      summary: 'SOP draft stages reordered',
      newValue: { order: stages.map((s) => s.name) },
    });
    res.json({ stages });
  }),
);

router.post(
  '/:id/publish',
  requirePermission(MODULES.SOP, ACTIONS.PUBLISH),
  validate({ params: idParam, body: publishSchema }),
  asyncHandler((req, res) => {
    const result = sopService.publish(req.params.id, req.body, req.user.id);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SOP_VERSION,
      entityId: result.published.id,
      action: AUDIT_ACTION.PUBLISH,
      summary: `SOP version ${result.published.version} published (${result.published.stages.length} stages)`,
      newValue: {
        version: result.published.version,
        stages: result.published.stages.map((s) => s.name),
        changeNote: result.published.changeNote,
      },
    });
    res.status(201).json(result);
  }),
);

export default router;
