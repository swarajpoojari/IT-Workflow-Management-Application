import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { publicService } from './public.service.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';

const router = Router();

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many lookups. Please try again shortly.' } },
});

router.get(
  '/track',
  lookupLimiter,
  validate({ query: z.object({ brd: z.string().trim().min(1).max(40) }) }),
  asyncHandler((req, res) => {
    res.json(publicService.trackByBrd(req.query.brd, { ip: req.ip, userAgent: req.headers['user-agent'] }));
  }),
);

export default router;
