import { userModel } from '../../models/user.model.js';
import { roleModel } from '../../models/role.model.js';
import { refreshTokenModel } from '../../models/refreshToken.model.js';
import { verifyPasswordSync, hashPasswordSync } from '../../utils/password.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../../services/token.service.js';

function present(user) {
  const permissions = roleModel.permissionsFor(user.roleId);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    team: user.team,
    clientName: user.clientName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    // The UI blocks the app behind a change-password prompt while this is true.
    mustChangePassword: Boolean(user.mustChangePassword),
    role: {
      id: user.roleId,
      key: user.roleKey,
      name: user.roleName,
      isClientScope: Boolean(user.isClientScope),
    },
    permissions: permissions.map(({ module, action }) => ({ module, action })),
  };
}

export const authService = {
  login({ email, password }, userAgent) {
    const user = userModel.findByEmailWithSecret(email);

    if (!user) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    const passwordOk = verifyPasswordSync(password, user.passwordHash);
    if (!passwordOk) {
      throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (!user.isActive) {
      throw ApiError.forbidden(
        'This account has been deactivated. Contact your administrator.',
        undefined,
        'ACCOUNT_DEACTIVATED',
      );
    }

    return {
      user: present(user),
      accessToken: signAccessToken(user),
      refreshToken: issueRefreshToken(user.id, userAgent),
    };
  },

  /**
   * Clears a temporary password. Every other session is revoked, so a password
   * handed over by an admin stops working everywhere the moment it is replaced.
   */
  changePassword(actorId, { currentPassword, newPassword }) {
    const user = userModel.findById(actorId);
    if (!user) throw ApiError.unauthorized('Not signed in', 'NOT_AUTHENTICATED');

    const withSecret = userModel.findByEmailWithSecret(user.email);
    if (!verifyPasswordSync(currentPassword, withSecret.passwordHash)) {
      throw ApiError.badRequest('Current password is incorrect', { field: 'currentPassword' }, 'INVALID_PASSWORD');
    }
    if (verifyPasswordSync(newPassword, withSecret.passwordHash)) {
      throw ApiError.badRequest(
        'Choose a password you have not used here before',
        { field: 'newPassword' },
        'PASSWORD_REUSED',
      );
    }

    const after = userModel.update(user.id, {
      passwordHash: hashPasswordSync(newPassword),
      mustChangePassword: false,
    });
    refreshTokenModel.revokeAllForUser(user.id);

    return { user: present(after) };
  },

  refresh(rawRefreshToken, userAgent) {
    if (!rawRefreshToken) {
      throw ApiError.unauthorized('No refresh token supplied', 'REFRESH_MISSING');
    }

    const { userId, rawToken } = rotateRefreshToken(rawRefreshToken, userAgent);
    const user = userModel.findById(userId);

    if (!user || !user.isActive) {
      refreshTokenModel.revokeAllForUser(userId);
      throw ApiError.forbidden('This account has been deactivated', undefined, 'ACCOUNT_DEACTIVATED');
    }

    return {
      user: present(user),
      accessToken: signAccessToken(user),
      refreshToken: rawToken,
    };
  },

  logout(rawRefreshToken) {
    revokeRefreshToken(rawRefreshToken);
  },

  me(user) {
    return present(userModel.findById(user.id));
  },
};
