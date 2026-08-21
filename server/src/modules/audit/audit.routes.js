import { Router } from 'express';
import { z } from 'zod';
import { auditModel } from '../../models/audit.model.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

// Read-only by design: entries are written by services, inside their transaction.
const listSchema = z.object({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(40).optional(),
  action: z.string().trim().max(40).optional(),
  actorId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

router.get(
  '/',
  requirePermission(MODULES.AUDIT, ACTIONS.READ),
  validate({ query: listSchema }),
  asyncHandler((req, res) => {
    const page = parsePagination(req.query);
    const { items, total } = auditModel.list({ ...req.query, ...page });
    res.json(paginated(items, total, page));
  }),
);

router.get(
  '/filters',
  requirePermission(MODULES.AUDIT, ACTIONS.READ),
  asyncHandler((_req, res) => {
    res.json(auditModel.distinctValues());
  }),
);

export default router;
