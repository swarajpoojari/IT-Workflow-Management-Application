import { authService } from './auth.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';
import { refreshCookieOptions, issueRefreshToken, signAccessToken } from '../../services/token.service.js';
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

  // Clearing a temporary password revokes every refresh token, so the browser
  // that just changed it needs a fresh one issued here.
  changePassword: asyncHandler((req, res) => {
    const { user } = authService.changePassword(req.user.id, req.body);

    setRefreshCookie(res, issueRefreshToken(user.id, req.headers['user-agent']));
    recordAudit(req, {
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.UPDATE,
      summary: `${user.email} set a new password`,
    });

    res.json({
      user,
      accessToken: signAccessToken({
        id: user.id, email: user.email, roleId: user.role.id, roleKey: user.role.key,
      }),
      expiresIn: env.ACCESS_TOKEN_TTL,
    });
  }),
};
