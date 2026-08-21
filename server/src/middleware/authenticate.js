import { verifyAccessToken } from '../services/token.service.js';
import { userModel } from '../models/user.model.js';
import { roleModel } from '../models/role.model.js';
import { ApiError } from '../utils/ApiError.js';

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing bearer token'));
  }

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7).trim());
  } catch (error) {
    return next(error);
  }

  const user = userModel.findById(Number(payload.sub));
  if (!user) return next(ApiError.unauthorized('Account no longer exists'));
  if (!user.isActive) {
    return next(ApiError.forbidden('This account has been deactivated', undefined, 'ACCOUNT_DEACTIVATED'));
  }

  // Read per request, not baked into the JWT, so revocation is immediate.
  const permissions = roleModel.permissionsFor(user.roleId);

  req.user = {
    ...user,
    permissions,
    permissionSet: new Set(permissions.map((p) => `${p.module}:${p.action}`)),
  };

  return next();
}

export function optionalAuthenticate(req, _res, next) {
  if (!(req.headers.authorization || '').startsWith('Bearer ')) return next();
  return authenticate(req, _res, next);
}
