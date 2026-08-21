import { userModel } from '../../models/user.model.js';
import { roleModel } from '../../models/role.model.js';
import { refreshTokenModel } from '../../models/refreshToken.model.js';
import { verifyPasswordSync } from '../../utils/password.js';
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
