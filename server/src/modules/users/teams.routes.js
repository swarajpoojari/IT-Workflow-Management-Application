import { Router } from 'express';
import { teamsService } from './users.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { recordAudit, diff } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';
import { idParam, teamSchema, updateTeamSchema } from './users.schema.js';

// Teams live inside the user module: the same permission that lets you manage
// people lets you manage the groupings they sit in.
const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  asyncHandler((_req, res) => {
    res.json({ teams: teamsService.list() });
  }),
);

router.get(
  '/:id',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ team: teamsService.get(req.params.id) });
  }),
);

router.get(
  '/:id/assignable',
  requirePermission(MODULES.USERS, ACTIONS.READ),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    res.json({ members: teamsService.assignableMembers(req.params.id) });
  }),
);

router.post(
  '/',
  requirePermission(MODULES.USERS, ACTIONS.CREATE),
  validate({ body: teamSchema }),
  asyncHandler((req, res) => {
    const team = teamsService.create(req.body);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.TEAM,
      entityId: team.id,
      action: AUDIT_ACTION.CREATE,
      summary: `Team "${team.name}" created`,
      newValue: { name: team.name, description: team.description, category: team.category },
    });
    res.status(201).json({ team });
  }),
);

router.patch(
  '/:id',
  requirePermission(MODULES.USERS, ACTIONS.UPDATE),
  validate({ params: idParam, body: updateTeamSchema }),
  asyncHandler((req, res) => {
    const { before, after } = teamsService.update(req.params.id, req.body);
    const change = diff(before, after, ['name', 'description', 'category', 'leadUserId', 'isActive']);
    if (change) {
      recordAudit(req, {
        entityType: AUDIT_ENTITY.TEAM,
        entityId: after.id,
        action: AUDIT_ACTION.UPDATE,
        summary: `Team "${after.name}" updated`,
        ...change,
      });
    }
    res.json({ team: after });
  }),
);

router.delete(
  '/:id',
  requirePermission(MODULES.USERS, ACTIONS.DELETE),
  validate({ params: idParam }),
  asyncHandler((req, res) => {
    const { team, detachedMembers } = teamsService.remove(req.params.id);
    recordAudit(req, {
      entityType: AUDIT_ENTITY.TEAM,
      entityId: team.id,
      action: AUDIT_ACTION.DELETE,
      summary: `Team "${team.name}" deleted — ${detachedMembers} member${detachedMembers === 1 ? '' : 's'} left unassigned`,
      oldValue: { name: team.name, description: team.description, memberCount: team.memberCount },
    });
    res.json({ deleted: true, team, detachedMembers });
  }),
);

export default router;
