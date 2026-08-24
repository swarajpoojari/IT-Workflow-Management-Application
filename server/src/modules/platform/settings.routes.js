import { Router } from 'express';
import { z } from 'zod';
import { userSettingsModel, systemSettingsModel } from '../../models/settings.model.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit } from '../../services/audit.service.js';
import { MODULES, ACTIONS, AUDIT_ENTITY, AUDIT_ACTION } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

const userSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  notifyAssignments: z.boolean().optional(),
  notifyBugs: z.boolean().optional(),
  notifySignoffs: z.boolean().optional(),
});

router.get('/me', asyncHandler((req, res) => res.json({ settings: userSettingsModel.get(req.user.id) })));

router.patch(
  '/me',
  validate({ body: userSettingsSchema }),
  asyncHandler((req, res) => {
    res.json({ settings: userSettingsModel.upsert(req.user.id, req.body) });
  }),
);

router.get(
  '/system',
  requirePermission(MODULES.SETTINGS, ACTIONS.READ),
  asyncHandler((_req, res) => res.json({ settings: systemSettingsModel.all() })),
);

router.patch(
  '/system',
  requirePermission(MODULES.SETTINGS, ACTIONS.UPDATE),
  validate({ body: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }),
  asyncHandler((req, res) => {
    for (const [key, value] of Object.entries(req.body)) systemSettingsModel.set(key, value, req.user.id);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.SETTINGS,
      entityId: 'system',
      action: AUDIT_ACTION.UPDATE,
      summary: `System settings updated: ${Object.keys(req.body).join(', ')}`,
      newValue: req.body,
    });
    res.json({ settings: systemSettingsModel.all() });
  }),
);

export default router;
