import { Router } from 'express';
import { z } from 'zod';
import { projectsService } from './projects.service.js';
import stagesRouter from '../stages/stages.routes.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { recordAudit, diff } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';
import {
  idParam,
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
  previewSchema,
  memberSchema,
} from './projects.schema.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.PROJECTS, ACTIONS.READ),
  validate({ query: listProjectsSchema }),
  asyncHandler((req, res) => {
    const page = parsePagination(req.query);
    const { items, total } = projectsService.list(req.user, { ...req.query, ...page });
    res.json(paginated(items, total, page));
  }),
);

router.get(
  '/summary',
  requirePermission(MODULES.PROJECTS, ACTIONS.READ),
  asyncHandler((req, res) => {
    res.json({ projects: projectsService.summary(req.user) });
  }),
);

router.get(
  '/preview-stages',
  requirePermission(MODULES.PROJECTS, ACTIONS.CREATE),
  validate({ query: previewSchema }),
  asyncHandler((req, res) => {
    res.json(projectsService.previewStages(req.query.sopTemplateId));
  }),
);

router.get(
  '/:id',
  requirePermission(MODULES.PROJECTS, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ project: projectsService.get(req.user, req.params.id) });
  }),
);

router.post(
  '/',
  requirePermission(MODULES.PROJECTS, ACTIONS.CREATE),
  validate({ body: createProjectSchema }),
  asyncHandler((req, res) => {
    const project = projectsService.create(req.user, req.body);
    res.status(201).json({ project });
  }),
);

router.patch(
  '/:id',
  requirePermission(MODULES.PROJECTS, ACTIONS.UPDATE),
  validate({ params: idParam, body: updateProjectSchema }),
  asyncHandler((req, res) => {
    const { before, after } = projectsService.update(req.user, req.params.id, req.body);
    const change = diff(before, after, ['name', 'clientName', 'ownerId', 'status', 'startDate', 'targetEndDate']);
    if (change) {
      recordAudit(req, {
        entityType: AUDIT_ENTITY.PROJECT,
        entityId: after.id,
        action: AUDIT_ACTION.UPDATE,
        summary: `Project ${after.code} updated`,
        ...change,
      });
    }
    res.json({ project: after });
  }),
);

router.post(
  '/:id/members',
  requirePermission(MODULES.PROJECTS, ACTIONS.ASSIGN),
  validate({ params: idParam, body: memberSchema }),
  asyncHandler((req, res) => {
    const members = projectsService.addMember(req.params.id, req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.PROJECT,
      entityId: req.params.id,
      action: AUDIT_ACTION.ASSIGN,
      summary: `User ${req.body.userId} added to project as ${req.body.roleInProject}`,
      newValue: req.body,
    });
    res.json({ members });
  }),
);

router.delete(
  '/:id/members/:userId',
  requirePermission(MODULES.PROJECTS, ACTIONS.ASSIGN),
  validate({ params: idParam.extend({ userId: z.coerce.number().int().positive() }) }),
  asyncHandler((req, res) => {
    const members = projectsService.removeMember(req.params.id, req.params.userId);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.PROJECT,
      entityId: req.params.id,
      action: AUDIT_ACTION.UPDATE,
      summary: `User ${req.params.userId} removed from project team`,
    });
    res.json({ members });
  }),
);

router.use('/:projectId/stages', stagesRouter);

export default router;
