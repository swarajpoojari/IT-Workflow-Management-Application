import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a digit'),
  fullName: z.string().trim().min(2).max(120),
  roleId: z.coerce.number().int().positive(),
  team: z.string().trim().max(80).optional().nullable(),
  clientName: z.string().trim().max(120).optional().nullable(),
});

export const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  team: z.string().trim().max(80).optional().nullable(),
  clientName: z.string().trim().max(120).optional().nullable(),
});

export const listUsersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  isActive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const reassignSchema = z.object({
  toUserId: z.coerce.number().int().positive(),
  stageIds: z.array(z.coerce.number().int().positive()).optional(),
});
