import { z } from 'zod';

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const stageParams = z.object({
  id: z.coerce.number().int().positive(),
  stageId: z.coerce.number().int().positive(),
});

export const createTemplateSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
});

export const updateTemplateSchema = createTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createStageSchema = z.object({
  name: z.string().trim().min(2, 'Stage name is required').max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  clientVisible: z.boolean().default(true),
  requiresDocument: z.boolean().default(false),
  // TESTING stages carry the bug loop and cannot close with bugs open.
  stageType: z.enum(['GENERIC', 'DEVELOPMENT', 'TESTING', 'UAT']).default('GENERIC'),
  requiresSignoff: z.boolean().default(false),
  expectedDurationDays: z.coerce.number().int().min(0).max(3650).optional().nullable(),
  defaultOwnerTeam: z.string().trim().max(80).optional().nullable(),
});

export const updateStageSchema = createStageSchema.partial();

export const reorderSchema = z.object({
  stageIds: z.array(z.coerce.number().int().positive()).min(1, 'Provide the full ordered list of stage ids'),
});

export const publishSchema = z.object({
  changeNote: z.string().trim().max(500).optional().nullable(),
});
