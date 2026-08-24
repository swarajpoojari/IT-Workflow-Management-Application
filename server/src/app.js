import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { getDriverName } from './db/index.js';
import { authenticate } from './middleware/authenticate.js';
import { filterClientData } from './middleware/filterClientData.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { stagesService } from './modules/stages/stages.service.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import roleRoutes from './modules/roles/roles.routes.js';
import sopRoutes from './modules/sop/sop.routes.js';
import projectRoutes from './modules/projects/projects.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import publicRoutes from './modules/public/public.routes.js';
import notificationRoutes from './modules/platform/notifications.routes.js';
import settingsRoutes from './modules/platform/settings.routes.js';
import reportRoutes from './modules/platform/reports.routes.js';
import searchRoutes from './modules/platform/search.routes.js';
import rolePreviewRoutes from './modules/platform/rolePreview.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) =>
    res.json({
      status: 'ok',
      service: 'itwf-api',
      env: env.NODE_ENV,
      node: process.version,
      dbDriver: getDriverName(),
      time: new Date().toISOString(),
    }),
  );

  app.use(filterClientData);

  // Unauthenticated, mounted before the authenticated routers. Its own
  // rate limit and whitelist live in modules/public.
  app.use('/api/public', publicRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/sop', sopRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/roles', rolePreviewRoutes);

  app.get(
    '/api/me/assignments',
    authenticate,
    asyncHandler((req, res) => {
      res.json({ stages: stagesService.myAssignments(req.user) });
    }),
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
