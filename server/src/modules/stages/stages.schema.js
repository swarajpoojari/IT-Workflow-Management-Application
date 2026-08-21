import { z } from 'zod';
import { STAGE_STATUS, STAGE_STATUSES } from '../../config/constants.js';

export const stageParams = z.object({
  projectId: z.coerce.number().int().positive(),
  stageId: z.coerce.number().int().positive(),
});

export const projectParam = z.object({ projectId: z.coerce.number().int().positive() });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// Discriminated union: which fields are required depends on the target status.
export const updateStatusSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal(STAGE_STATUS.NOT_STARTED),
      remarks: z.string().trim().max(2000).optional().nullable(),
    }),
    z.object({
      status: z.literal(STAGE_STATUS.IN_PROGRESS),
      remarks: z.string().trim().max(2000).optional().nullable(),
    }),
    z.object({
      status: z.literal(STAGE_STATUS.BLOCKED),
      blocker: z.string().trim().min(3, 'Describe what is blocking this stage (min 3 characters)').max(1000),
      remarks: z.string().trim().max(2000).optional().nullable(),
    }),
    z.object({
      status: z.literal(STAGE_STATUS.ON_HOLD),
      holdReason: z.string().trim().min(3, 'A reason is required to put a stage on hold').max(1000),
      remarks: z.string().trim().max(2000).optional().nullable(),
    }),
    z.object({
      status: z.literal(STAGE_STATUS.COMPLETED),
      completionDate: isoDate,
      remarks: z.string().trim().max(2000).optional().nullable(),
    }),
  ])
  .describe(`One of: ${STAGE_STATUSES.join(', ')}`);

export const assignStageSchema = z.object({
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});

export const addDocumentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().trim().min(1).max(2048),
  docType: z.enum(['FILE', 'LINK']).default('FILE'),
  notes: z.string().trim().max(1000).optional().nullable(),
});
