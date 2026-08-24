import { z } from 'zod';
import { BUG_STATUS, BUG_SEVERITY } from '../../config/constants.js';

export const raiseBugSchema = z.object({
  title: z.string().trim().min(4, 'Give the bug a descriptive title').max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  severity: z.enum(BUG_SEVERITY).default('MEDIUM'),
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
});

export const transitionBugSchema = z.object({
  status: z.enum(Object.values(BUG_STATUS)),
  note: z.string().trim().max(2000).optional().nullable(),
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
});
