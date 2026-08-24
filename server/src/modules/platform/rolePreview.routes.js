import { Router } from 'express';
import { z } from 'zod';
import { roleModel } from '../../models/role.model.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { MODULES, ACTIONS } from '../../config/constants.js';

const router = Router();
router.use(authenticate);

// Returns another role's permissions as data. Grants nothing to the caller.
router.get(
  '/:id/preview',
  requirePermission(MODULES.ROLES, ACTIONS.READ),
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler((req, res) => {
    const role = roleModel.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role');

    const permissions = roleModel.permissionsFor(role.id);
    const tuples = permissions.map((p) => `${p.module}:${p.action}`);
    const holds = (module, action) => tuples.includes(`${module}:${action}`);

    res.json({
      role: { id: role.id, key: role.key, name: role.name, isClientScope: role.isClientScope },
      permissions: permissions.map(({ module, action, description }) => ({ module, action, description })),
      navigation: [
        { label: 'Dashboard', path: '/', visible: true },
        { label: 'Projects', path: '/projects', visible: holds('projects', 'read') },
        { label: 'My work', path: '/my-work', visible: holds('stages', 'update_status') },
        { label: 'SOP Builder', path: '/sop', visible: holds('sop', 'update') },
        { label: 'Users', path: '/users', visible: holds('users', 'read') },
        { label: 'Reports', path: '/reports', visible: holds('reports', 'read') },
        { label: 'Audit log', path: '/audit', visible: holds('audit', 'read') },
        { label: 'Settings', path: '/settings', visible: true },
      ],
      capabilities: {
        canCreateProjects: holds('projects', 'create'),
        canSeeAllProjects: holds('projects', 'read_all'),
        canPublishSop: holds('sop', 'publish'),
        canUpdateStageStatus: holds('stages', 'update_status'),
        canReadDocuments: holds('documents', 'read'),
        canReadAudit: holds('audit', 'read'),
        canRaiseBugs: holds('bugs', 'create'),
        clientFiltered: role.isClientScope,
      },
      note: 'Preview only. Your own permissions are unchanged and every request is still authorised against your real role.',
    });
  }),
);

export default router;
