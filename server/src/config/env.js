import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..', '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const NODE_ENV = process.env.NODE_ENV || 'development';

export const env = {
  NODE_ENV,
  isProd: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT: int(process.env.PORT, 4000),

  DATABASE_URL: path.resolve(SERVER_ROOT, process.env.DATABASE_URL || './data/itwf.sqlite'),

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || '15m',
  REFRESH_TOKEN_TTL_DAYS: int(process.env.REFRESH_TOKEN_TTL_DAYS, 7),

  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME || 'itwf_refresh',
  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, false),
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE || 'lax',

  CORS_ORIGIN: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  SEED_PASSWORD: process.env.SEED_PASSWORD || 'Passw0rd!',

  AUTH_RATE_LIMIT_WINDOW_MS: int(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
};

export function assertProductionSecrets() {
  if (!env.isProd) return;
  const weak = [];
  if (env.JWT_ACCESS_SECRET.startsWith('dev-')) weak.push('JWT_ACCESS_SECRET');
  if (env.JWT_REFRESH_SECRET.startsWith('dev-')) weak.push('JWT_REFRESH_SECRET');
  if (weak.length) {
    throw new Error(
      `Refusing to start in production with default secrets: ${weak.join(', ')}. ` +
        'Set them in the environment (see .env.example).',
    );
  }
}
