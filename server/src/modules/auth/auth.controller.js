import { authService } from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { refreshCookieOptions } from '../../services/token.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../../config/constants.js';

const setRefreshCookie = (res, token) =>
  res.cookie(env.REFRESH_COOKIE_NAME, token, refreshCookieOptions());

export const authController = {
  login: asyncHandler((req, res) => {
    const { user, accessToken, refreshToken } = authService.login(req.body, req.headers['user-agent']);

    setRefreshCookie(res, refreshToken);
    recordAudit({ ip: req.ip, user: { id: user.id, email: user.email, roleKey: user.role.key } }, {
      entityType: AUDIT_ENTITY.AUTH,
      entityId: user.id,
      action: AUDIT_ACTION.LOGIN,
      summary: `${user.email} signed in`,
    });

    res.json({ user, accessToken, expiresIn: env.ACCESS_TOKEN_TTL });
  }),

  refresh: asyncHandler((req, res) => {
    const presented = req.cookies?.[env.REFRESH_COOKIE_NAME];
    const { user, accessToken, refreshToken } = authService.refresh(presented, req.headers['user-agent']);

    setRefreshCookie(res, refreshToken);
    res.json({ user, accessToken, expiresIn: env.ACCESS_TOKEN_TTL });
  }),

  logout: asyncHandler((req, res) => {
    const presented = req.cookies?.[env.REFRESH_COOKIE_NAME];
    authService.logout(presented);

    if (req.user) {
      recordAudit(req, {
        entityType: AUDIT_ENTITY.AUTH,
        entityId: req.user.id,
        action: AUDIT_ACTION.LOGOUT,
        summary: `${req.user.email} signed out`,
      });
    }

    res.clearCookie(env.REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ success: true });
  }),

  me: asyncHandler((req, res) => {
    res.json({ user: authService.me(req.user) });
  }),
};
