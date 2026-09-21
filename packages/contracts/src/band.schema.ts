import { z } from 'zod';
import { moneyMinorStringSchema } from './employee.schema.js';

export const bandSchema = z.object({
  id: z.string(),
  jobFamily: z.string().min(1),
  level: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  minMinor: moneyMinorStringSchema,
  midMinor: moneyMinorStringSchema,
  maxMinor: moneyMinorStringSchema,
  currency: z.string().min(3).max(3),
});

export type Band = z.infer<typeof bandSchema>;

export const bandUpsertSchema = z.object({
  jobFamily: z.string().min(1),
  level: z.string().min(1),
  countryCode: z.string().min(2).max(2),
  minMinor: moneyMinorStringSchema,
  midMinor: moneyMinorStringSchema,
  maxMinor: moneyMinorStringSchema,
  currency: z.string().min(3).max(3),
});

export type BandUpsert = z.infer<typeof bandUpsertSchema>;

export const bandListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  jobFamily: z.string().optional(),
  level: z.string().optional(),
  countryCode: z.string().optional(),
});

export type BandListQuery = z.infer<typeof bandListQuerySchema>;

export const outliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  includeTerminated: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type OutliersQuery = z.infer<typeof outliersQuerySchema>;

export const compaRatioResponseSchema = z.object({
  employeeId: z.string(),
  bandId: z.string().nullable(),
  compaRatio: z.number().nullable(),
  annualBaseMinor: moneyMinorStringSchema,
  bandMidBaseMinor: moneyMinorStringSchema.nullable(),
});

export type CompaRatioResponse = z.infer<typeof compaRatioResponseSchema>;
