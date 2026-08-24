import { Router } from 'express';
import { z } from 'zod';
import { bugsService } from './bugs.service.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { MODULES, ACTIONS } from '../../config/constants.js';
import { raiseBugSchema, transitionBugSchema } from './bugs.schema.js';

const router = Router({ mergeParams: true });

const projectParam = z.object({ projectId: z.coerce.number().int().positive() });
const stageParams = projectParam.extend({ stageId: z.coerce.number().int().positive() });
const bugParams = projectParam.extend({ bugId: z.coerce.number().int().positive() });

router.get(
  '/bugs',
  requirePermission(MODULES.BUGS, ACTIONS.READ),
  validate({ params: projectParam }),
  asyncHandler((req, res) => res.json(bugsService.projectSummary(req.user, req.params.projectId))),
);

router.get(
  '/stages/:stageId/bugs',
  requirePermission(MODULES.BUGS, ACTIONS.READ),
  validate({ params: stageParams }),
  asyncHandler((req, res) => res.json(bugsService.listForStage(req.user, req.params.projectId, req.params.stageId))),
);

router.post(
  '/stages/:stageId/bugs',
  requirePermission(MODULES.BUGS, ACTIONS.CREATE),
  validate({ params: stageParams, body: raiseBugSchema }),
  asyncHandler((req, res) =>
    res.status(201).json(bugsService.raise(req.user, req.params.projectId, req.params.stageId, req.body, req.ip)),
  ),
);

router.get(
  '/bugs/:bugId',
  requirePermission(MODULES.BUGS, ACTIONS.READ),
  validate({ params: bugParams }),
  asyncHandler((req, res) => res.json(bugsService.get(req.user, req.params.projectId, req.params.bugId))),
);

router.patch(
  '/bugs/:bugId/status',
  requirePermission(MODULES.BUGS, ACTIONS.UPDATE),
  validate({ params: bugParams, body: transitionBugSchema }),
  asyncHandler((req, res) =>
    res.json(bugsService.transition(req.user, req.params.projectId, req.params.bugId, req.body, req.ip)),
  ),
);

export default router;
