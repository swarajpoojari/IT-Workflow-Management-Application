import { Router } from 'express';
import { usersService } from './users.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { parsePagination, paginated } from '../../utils/pagination.js';
import { recordAudit, diff } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';
import { idParam, createUserSchema, updateUserSchema, listUsersSchema, reassignSchema } from './users.schema.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  validate({ query: listUsersSchema }),
  asyncHandler((req, res) => {
    const page = parsePagination(req.query, { defaultLimit: 50 });
    const { items, total } = usersService.list({ ...req.query, ...page });
    res.json(paginated(items, total, page));
  }),
);

router.post(
  '/',
  requirePermission(MODULES.USERS, ACTIONS.CREATE),
  validate({ body: createUserSchema }),
  asyncHandler((req, res) => {
    const user = usersService.create(req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.CREATE,
      summary: `User ${user.email} created`,
      newValue: { email: user.email, fullName: user.fullName, roleId: user.roleId },
    });
    res.status(201).json({ user });
  }),
);

router.get(
  '/:id',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ user: usersService.get(req.params.id) });
  }),
);

router.patch(
  '/:id',
  requirePermission(MODULES.USERS, ACTIONS.UPDATE),
  validate({ params: idParam, body: updateUserSchema }),
  asyncHandler((req, res) => {
    const { before, after } = usersService.update(req.params.id, req.body);
    const change = diff(before, after, ['email', 'fullName', 'roleId', 'team', 'clientName']);
    if (change) {
      recordAudit(req, {
        entityType: AUDIT_ENTITY.USER,
        entityId: after.id,
        action: AUDIT_ACTION.UPDATE,
        summary: `User ${after.email} updated`,
        ...change,
      });
    }
    res.json({ user: after });
  }),
);

router.get(
  '/:id/assignments',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json(usersService.assignmentCheck(req.params.id));
  }),
);

router.patch(
  '/:id/deactivate',
  requirePermission(MODULES.USERS, ACTIONS.DEACTIVATE),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ user: usersService.deactivate(req.user, req.params.id) });
  }),
);

router.patch(
  '/:id/activate',
  requirePermission(MODULES.USERS, ACTIONS.DEACTIVATE),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ user: usersService.activate(req.user, req.params.id) });
  }),
);

router.post(
  '/:id/reassign',
  requirePermission(MODULES.USERS, ACTIONS.REASSIGN),
  validate({ params: idParam, body: reassignSchema }),
  asyncHandler((req, res) => {
    res.json(usersService.reassign(req.user, req.params.id, req.body));
  }),
);

export default router;
