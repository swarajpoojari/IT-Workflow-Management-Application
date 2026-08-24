import { z } from 'zod';
import { PROJECT_STATUS } from '../../config/constants.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional()
  .nullable();

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const createProjectSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, 'Code must be 3-30 chars: letters, digits and dashes'),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  clientName: z.string().trim().min(2).max(120),
  // The reference a client quotes on the public tracking page.
  brdNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,29}$/, 'BRD must be 3-30 chars: letters, digits and dashes').optional().nullable(),
  sopTemplateId: z.coerce.number().int().positive(),
  ownerId: z.coerce.number().int().positive().optional().nullable(),
  startDate: isoDate,
  targetEndDate: isoDate,
  memberIds: z.array(z.coerce.number().int().positive()).optional().default([]),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  clientName: z.string().trim().min(2).max(120).optional(),
  brdNumber: z.string().trim().toUpperCase().max(30).optional().nullable(),
  ownerId: z.coerce.number().int().positive().optional().nullable(),
  status: z.enum(Object.values(PROJECT_STATUS)).optional(),
  startDate: isoDate,
  targetEndDate: isoDate,
});

export const listProjectsSchema = z.object({
  status: z.enum(Object.values(PROJECT_STATUS)).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const previewSchema = z.object({
  sopTemplateId: z.coerce.number().int().positive(),
});

export const memberSchema = z.object({
  userId: z.coerce.number().int().positive(),
  roleInProject: z.enum(['OWNER', 'MEMBER', 'VIEWER']).default('MEMBER'),
});
