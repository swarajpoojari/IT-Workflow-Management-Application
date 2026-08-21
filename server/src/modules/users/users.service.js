import { userModel } from '../../models/user.model.js';
import { roleModel } from '../../models/role.model.js';
import { stageModel } from '../../models/stage.model.js';
import { refreshTokenModel } from '../../models/refreshToken.model.js';
import { auditModel } from '../../models/audit.model.js';
import { hashPasswordSync } from '../../utils/password.js';
import { ApiError } from '../../utils/ApiError.js';
import { transaction } from '../../db/index.js';
import { AUDIT_ENTITY, AUDIT_ACTION } from '../../config/constants.js';

const present = (user) => {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
};

function requireUser(id) {
  const user = userModel.findById(id);
  if (!user) throw ApiError.notFound('User');
  return user;
}

export const usersService = {
  list(filters) {
    const { items, total } = userModel.list(filters);
    return { items: items.map(present), total };
  },

  get(id) {
    const user = requireUser(id);
    return {
      ...present(user),
      permissions: roleModel.permissionsFor(user.roleId),
      activeAssignments: userModel.countActiveAssignments(user.id),
    };
  },

  create(payload) {
    if (userModel.findByEmail(payload.email)) {
      throw ApiError.conflict('That email address is already registered', { field: 'email' }, 'DUPLICATE_EMAIL');
    }

    const role = roleModel.findById(payload.roleId);
    if (!role) throw ApiError.badRequest('Role not found', { field: 'roleId' });

    if (role.isClientScope && !payload.clientName) {
      throw ApiError.badRequest(
        `"${role.name}" is a client-scoped role, so clientName is required`,
        { field: 'clientName' },
      );
    }

    const { password, ...rest } = payload;
    return present(userModel.create({ ...rest, passwordHash: hashPasswordSync(password) }));
  },

  update(id, patch) {
    const user = requireUser(id);

    if (patch.email && patch.email !== user.email && userModel.findByEmail(patch.email)) {
      throw ApiError.conflict('That email address is already registered', { field: 'email' }, 'DUPLICATE_EMAIL');
    }

    if (patch.roleId) {
      const role = roleModel.findById(patch.roleId);
      if (!role) throw ApiError.badRequest('Role not found', { field: 'roleId' });
      const clientName = patch.clientName ?? user.clientName;
      if (role.isClientScope && !clientName) {
        throw ApiError.badRequest('clientName is required for a client-scoped role', { field: 'clientName' });
      }
    }

    const after = userModel.update(id, patch);

    if (patch.roleId && patch.roleId !== user.roleId) {
      refreshTokenModel.revokeAllForUser(id);
    }

    return { before: present(user), after: present(after) };
  },

  assignmentCheck(id) {
    const user = requireUser(id);
    const assignments = userModel.activeStageAssignments(user.id);
    return { user: present(user), assignments, blocked: assignments.length > 0 };
  },

  // Returns 409 with the blocking assignments; check and write share a transaction.
  deactivate(actor, id) {
    const user = requireUser(id);

    if (user.id === actor.id) {
      throw ApiError.badRequest('You cannot deactivate your own account', undefined, 'SELF_DEACTIVATION');
    }
    if (!user.isActive) {
      throw ApiError.conflict('This user is already deactivated', undefined, 'ALREADY_DEACTIVATED');
    }

    return transaction(() => {
      const assignments = userModel.activeStageAssignments(user.id);

      if (assignments.length > 0) {
        throw ApiError.conflict(
          `${user.fullName} still owns ${assignments.length} active stage${assignments.length === 1 ? '' : 's'}. Reassign them before deactivating.`,
          {
            userId: user.id,
            fullName: user.fullName,
            assignmentCount: assignments.length,
            assignments,
          },
          'ACTIVE_ASSIGNMENTS',
        );
      }

      const after = userModel.update(user.id, { isActive: false });
      refreshTokenModel.revokeAllForUser(user.id);

      auditModel.append({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.roleKey,
        entityType: AUDIT_ENTITY.USER,
        entityId: user.id,
        action: AUDIT_ACTION.DEACTIVATE,
        summary: `${user.email} deactivated`,
        oldValue: { isActive: true },
        newValue: { isActive: false },
      });

      return present(after);
    });
  },

  activate(actor, id) {
    const user = requireUser(id);
    if (user.isActive) throw ApiError.conflict('This user is already active', undefined, 'ALREADY_ACTIVE');

    const after = userModel.update(user.id, { isActive: true });
    auditModel.append({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.roleKey,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.ACTIVATE,
      summary: `${user.email} reactivated`,
      oldValue: { isActive: false },
      newValue: { isActive: true },
    });
    return present(after);
  },

  // Moves ownership only; every stage keeps its current status.
  reassign(actor, fromUserId, { toUserId, stageIds }) {
    const fromUser = requireUser(fromUserId);
    const toUser = requireUser(toUserId);

    if (fromUser.id === toUser.id) {
      throw ApiError.badRequest('Cannot reassign a user to themselves', { field: 'toUserId' });
    }
    if (!toUser.isActive) {
      throw ApiError.badRequest('Cannot reassign work to a deactivated user', { field: 'toUserId' });
    }

    const before = userModel.activeStageAssignments(fromUser.id);
    if (before.length === 0) {
      throw ApiError.conflict(
        `${fromUser.fullName} has no active assignments to reassign`,
        undefined,
        'NO_ASSIGNMENTS',
      );
    }

    return transaction(() => {
      const moved = stageModel.reassign(fromUser.id, toUser.id, stageIds);

      auditModel.append({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.roleKey,
        entityType: AUDIT_ENTITY.USER,
        entityId: fromUser.id,
        action: AUDIT_ACTION.REASSIGN,
        summary: `${moved} stage${moved === 1 ? '' : 's'} reassigned from ${fromUser.email} to ${toUser.email}`,
        oldValue: { assignedTo: fromUser.email, stages: before.map((a) => a.stageName) },
        newValue: { assignedTo: toUser.email, movedCount: moved },
      });

      const remaining = userModel.activeStageAssignments(fromUser.id);
      return {
        movedCount: moved,
        remaining,
        canDeactivateNow: remaining.length === 0,
      };
    });
  },
};
