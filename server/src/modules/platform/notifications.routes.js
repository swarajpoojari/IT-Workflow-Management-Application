import { Router } from 'express';
import { z } from 'zod';
import { notificationModel } from '../../models/notification.model.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

// Always scoped to req.user.id, so there is no other tray to read.
router.get(
  '/',
  validate({ query: z.object({ unreadOnly: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(50).optional() }) }),
  asyncHandler((req, res) => {
    res.json({
      notifications: notificationModel.listForUser(req.user.id, req.query),
      unreadCount: notificationModel.unreadCount(req.user.id),
    });
  }),
);

router.patch(
  '/:id/read',
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler((req, res) => {
    notificationModel.markRead(req.user.id, req.params.id);
    res.json({ unreadCount: notificationModel.unreadCount(req.user.id) });
  }),
);

router.post(
  '/read-all',
  asyncHandler((req, res) => {
    const marked = notificationModel.markAllRead(req.user.id);
    res.json({ marked, unreadCount: 0 });
  }),
);

export default router;
