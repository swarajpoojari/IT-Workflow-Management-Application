import { ApiError } from '../utils/ApiError.js';

// Asks only whether a role_permissions row exists. No role-name branching.
export function requirePermission(module, action) {
  return function permissionGate(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());

    if (!req.user.permissionSet.has(`${module}:${action}`)) {
      return next(
        ApiError.forbidden(`Missing permission: ${module}:${action}`, {
          required: { module, action },
          role: req.user.roleKey,
        }),
      );
    }
    return next();
  };
}

export function requireAnyPermission(...tuples) {
  return function anyPermissionGate(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    const ok = tuples.some(([module, action]) => req.user.permissionSet.has(`${module}:${action}`));
    if (!ok) {
      return next(
        ApiError.forbidden('Missing permission', {
          requiredAnyOf: tuples.map(([module, action]) => `${module}:${action}`),
          role: req.user.roleKey,
        }),
      );
    }
    return next();
  };
}

export const can = (user, module, action) => Boolean(user?.permissionSet?.has(`${module}:${action}`));

// Row-level scope, derived from role data rather than role names.
export function resolveScope(user) {
  if (!user) return { memberOf: -1 };
  if (user.isClientScope) return { clientName: user.clientName };
  if (can(user, 'projects', 'read_all')) return null;
  return { memberOf: user.id };
}
