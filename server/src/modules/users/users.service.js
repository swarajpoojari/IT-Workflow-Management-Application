import { userModel } from '../../models/user.model.js';
import { roleModel } from '../../models/role.model.js';
import { teamModel } from '../../models/team.model.js';
import { stageModel } from '../../models/stage.model.js';
import { refreshTokenModel } from '../../models/refreshToken.model.js';
import { auditModel } from '../../models/audit.model.js';
import { hashPasswordSync, generateTemporaryPassword } from '../../utils/password.js';
import { mailer } from '../../services/mailer.service.js';
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

  /**
   * Creates the account with a generated temporary password. The plain text is
   * returned exactly once — to the admin who made the request, and to the
   * invite email — and never stored.
   */
  create(actor, payload) {
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

    if (payload.teamId && !teamModel.findById(payload.teamId)) {
      throw ApiError.badRequest('Team not found', { field: 'teamId' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const user = userModel.create({
      ...payload,
      passwordHash: hashPasswordSync(temporaryPassword),
      mustChangePassword: true,
    });

    const invite = mailer.sendUserInvite({
      email: user.email,
      fullName: user.fullName,
      temporaryPassword,
      roleName: role.name,
      invitedBy: actor?.fullName ?? actor?.email,
    });

    return { user: present(user), temporaryPassword, invite };
  },

  /**
   * Permanent deletion. Guarded exactly like deactivation — live work must be
   * reassigned first — plus the rows that only make sense with an owner.
   */
  remove(actor, id) {
    const user = requireUser(id);

    if (user.id === actor.id) {
      throw ApiError.badRequest('You cannot delete your own account', undefined, 'SELF_DELETION');
    }

    return transaction(() => {
      // Checked first on purpose: reassigning work is pointless if the account
      // can never be deleted anyway.
      const history = userModel.historyReferences(user.id);
      if (history.total > 0) {
        throw ApiError.conflict(
          `${user.fullName} appears in ${history.total} audited record${history.total === 1 ? '' : 's'} that this system does not rewrite. Deactivate the account instead — that blocks all access and keeps the history intact.`,
          {
            userId: user.id,
            fullName: user.fullName,
            historyCount: history.total,
            breakdown: history.detail,
            isActive: user.isActive,
          },
          'HAS_HISTORY',
        );
      }

      const assignments = userModel.activeStageAssignments(user.id);
      if (assignments.length > 0) {
        throw ApiError.conflict(
          `${user.fullName} still owns ${assignments.length} active stage${assignments.length === 1 ? '' : 's'}. Reassign them before deleting.`,
          {
            userId: user.id,
            fullName: user.fullName,
            assignmentCount: assignments.length,
            assignments,
          },
          'ACTIVE_ASSIGNMENTS',
        );
      }

      const owned = userModel.countOwnedProjects(user.id);
      if (owned > 0) {
        throw ApiError.conflict(
          `${user.fullName} owns ${owned} project${owned === 1 ? '' : 's'}. Hand those over before deleting.`,
          { userId: user.id, projectCount: owned },
          'OWNS_PROJECTS',
        );
      }


      // Audited before the row disappears, so the log keeps the detail.
      auditModel.append({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.roleKey,
        entityType: AUDIT_ENTITY.USER,
        entityId: user.id,
        action: AUDIT_ACTION.DELETE,
        summary: `${user.email} permanently deleted`,
        oldValue: {
          email: user.email, fullName: user.fullName,
          roleName: user.roleName, team: user.team, isActive: user.isActive,
        },
      });

      refreshTokenModel.revokeAllForUser(user.id);
      userModel.detachReferences(user.id);
      userModel.remove(user.id);

      return { deleted: true, user: present(user) };
    });
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

    if (patch.teamId && !teamModel.findById(patch.teamId)) {
      throw ApiError.badRequest('Team not found', { field: 'teamId' });
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

/** A team lead has to be a real, active account. */
function assertLeadIsUsable(leadUserId) {
  if (!leadUserId) return;
  const lead = userModel.findById(leadUserId);
  if (!lead) throw ApiError.badRequest('Team lead not found', { field: 'leadUserId' });
  if (!lead.isActive) {
    throw ApiError.badRequest('A deactivated user cannot lead a team', { field: 'leadUserId' });
  }
}

export const teamsService = {
  list() {
    return teamModel.findAll().map((team) => ({ ...team, members: teamModel.members(team.id) }));
  },

  /** The pool a stage owned by this team can be assigned from. */
  assignableMembers(id) {
    const team = teamModel.findById(id);
    if (!team) throw ApiError.notFound('Team');
    return teamModel.assignableMembers(id);
  },

  get(id) {
    const team = teamModel.findById(id);
    if (!team) throw ApiError.notFound('Team');
    return { ...team, members: teamModel.members(team.id) };
  },

  create(payload) {
    if (teamModel.findByName(payload.name)) {
      throw ApiError.conflict('A team with that name already exists', { field: 'name' }, 'DUPLICATE_TEAM');
    }
    assertLeadIsUsable(payload.leadUserId);
    return teamModel.create(payload);
  },

  update(id, patch) {
    const team = teamModel.findById(id);
    if (!team) throw ApiError.notFound('Team');

    if (patch.name && patch.name.toLowerCase() !== team.name.toLowerCase()) {
      if (teamModel.findByName(patch.name)) {
        throw ApiError.conflict('A team with that name already exists', { field: 'name' }, 'DUPLICATE_TEAM');
      }
    }
    assertLeadIsUsable(patch.leadUserId);

    return { before: team, after: teamModel.update(id, patch) };
  },

  // Deleting a team never deletes people; members are simply left unassigned.
  remove(id) {
    const team = teamModel.findById(id);
    if (!team) throw ApiError.notFound('Team');

    // A published SOP version is frozen, team assignments included. Removing
    // the team would have to rewrite those rows, so it is refused outright.
    const frozen = teamModel.publishedSopReferences(id);
    if (frozen.length > 0) {
      throw ApiError.conflict(
        `${team.name} owns ${frozen.length} stage${frozen.length === 1 ? '' : 's'} in a published SOP version, which cannot be rewritten. Deactivate the team instead — it stops appearing in pickers while the published history stays intact.`,
        {
          teamId: team.id,
          teamName: team.name,
          stageCount: frozen.length,
          stages: frozen,
          isActive: team.isActive,
        },
        'TEAM_IN_PUBLISHED_SOP',
      );
    }

    const detached = team.memberCount;
    teamModel.remove(id);
    return { deleted: true, team, detachedMembers: detached };
  },
};
