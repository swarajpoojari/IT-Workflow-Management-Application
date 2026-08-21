import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { refreshTokenModel } from '../models/refreshToken.model.js';
import { ApiError } from '../utils/ApiError.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      roleId: user.roleId,
      roleKey: user.roleKey,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL, issuer: 'itwf-api' },
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'itwf-api' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    }
    throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
}

const randomToken = () => crypto.randomBytes(64).toString('hex');

const expiryIso = (days) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19).replace('T', ' ');
};

export function issueRefreshToken(userId, userAgent) {
  const rawToken = randomToken();
  const familyId = crypto.randomUUID();
  refreshTokenModel.create({
    userId,
    rawToken,
    familyId,
    expiresAt: expiryIso(env.REFRESH_TOKEN_TTL_DAYS),
    userAgent,
  });
  return rawToken;
}

// Rotates on every use; a revoked token presented again revokes the family.
export function rotateRefreshToken(rawToken, userAgent) {
  const existing = refreshTokenModel.findByRaw(rawToken);
  if (!existing) throw ApiError.unauthorized('Refresh token not recognised', 'REFRESH_INVALID');

  if (existing.revokedAt) {
    refreshTokenModel.revokeFamily(existing.familyId);
    throw ApiError.unauthorized('Refresh token reuse detected — all sessions revoked', 'REFRESH_REUSED');
  }

  if (new Date(existing.expiresAt.replace(' ', 'T') + 'Z') < new Date()) {
    refreshTokenModel.revoke(existing.id);
    throw ApiError.unauthorized('Refresh token expired', 'REFRESH_EXPIRED');
  }

  const nextRaw = randomToken();
  const next = refreshTokenModel.create({
    userId: existing.userId,
    rawToken: nextRaw,
    familyId: existing.familyId,
    expiresAt: expiryIso(env.REFRESH_TOKEN_TTL_DAYS),
    userAgent,
  });
  refreshTokenModel.revoke(existing.id, next.id);

  return { userId: existing.userId, rawToken: nextRaw };
}

export function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const existing = refreshTokenModel.findByRaw(rawToken);
  if (existing && !existing.revokedAt) refreshTokenModel.revoke(existing.id);
}

export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
});
