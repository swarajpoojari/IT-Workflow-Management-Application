import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });

// A team is optional, and clearing it is meaningful — so '' and null both have
// to survive coercion as an explicit null rather than failing `positive()`.
const optionalTeamId = z
  .preprocess((value) => (value === '' || value === null ? null : value),
    z.coerce.number().int().positive().nullable())
  .optional();

// No password field: the API generates a temporary one and emails it. An admin
// never chooses another person's password.
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  roleId: z.coerce.number().int().positive(),
  teamId: optionalTeamId,
  clientName: z.string().trim().max(120).optional().nullable(),
});

export const updateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  teamId: optionalTeamId,
  clientName: z.string().trim().max(120).optional().nullable(),
});

export const listUsersSchema = z.object({
  search: z.string().trim().max(120).optional(),
  roleId: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
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

export const teamSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(80),
  description: z.string().trim().max(240).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  leadUserId: optionalTeamId,
  isActive: z.boolean().optional(),
});

export const updateTeamSchema = teamSchema.partial();
