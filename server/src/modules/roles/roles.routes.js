import { Router } from 'express';
import { z } from 'zod';
import { roleModel, permissionModel } from '../../models/role.model.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { recordAudit } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY, MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(MODULES.ROLES, ACTIONS.READ),
  asyncHandler((_req, res) => {
    const roles = roleModel.findAll().map((role) => ({
      ...role,
      permissions: roleModel.permissionsFor(role.id),
    }));
    res.json({ roles });
  }),
);

router.get(
  '/permissions',
  requirePermission(MODULES.ROLES, ACTIONS.READ),
  asyncHandler((_req, res) => {
    res.json({ permissions: permissionModel.findAll() });
  }),
);

router.put(
  '/:id/permissions',
  requirePermission(MODULES.ROLES, ACTIONS.UPDATE),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ permissionIds: z.array(z.coerce.number().int().positive()) }),
  }),
  asyncHandler((req, res) => {
    const role = roleModel.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role');

    const before = roleModel.permissionsFor(role.id).map((p) => `${p.module}:${p.action}`);

    const permissions = transaction(() => {
      roleModel.setPermissions(role.id, req.body.permissionIds);
      return roleModel.permissionsFor(role.id);
    });

    recordAudit(req, {
      entityType: AUDIT_ENTITY.ROLE,
      entityId: role.id,
      action: AUDIT_ACTION.UPDATE,
      summary: `Permissions updated for role ${role.key}`,
      oldValue: { permissions: before },
      newValue: { permissions: permissions.map((p) => `${p.module}:${p.action}`) },
    });

    res.json({ role: { ...role, permissions } });
  }),
);

export default router;
