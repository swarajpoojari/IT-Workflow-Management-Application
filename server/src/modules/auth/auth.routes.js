import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller.js';
import { loginSchema } from './auth.schema.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});

router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);

router.post('/refresh', authController.refresh);

router.post('/logout', optionalAuthenticate, authController.logout);

router.get('/me', authenticate, authController.me);

export default router;
