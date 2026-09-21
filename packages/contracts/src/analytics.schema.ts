import { z } from 'zod';
import { moneyMinorStringSchema } from './employee.schema.js';

export const analyticsGroupBySchema = z.enum(['country', 'department', 'level']);

export const analyticsQuerySchema = z.object({
  groupBy: analyticsGroupBySchema.default('department'),
  includeTerminated: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
  includeContractors: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const analyticsBucketSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), moneyMinorStringSchema]),
});

export const analyticsSummarySchema = z.object({
  headcount: z.number().int().min(0),
  payrollCostAnnualBase: moneyMinorStringSchema,
  averageAnnualBase: moneyMinorStringSchema,
  medianAnnualBase: moneyMinorStringSchema,
  outlierCount: z.number().int().min(0),
});

export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

export const analyticsDistributionSchema = z.object({
  groupBy: analyticsGroupBySchema,
  buckets: z.array(
    z.object({
      key: z.string(),
      p25: moneyMinorStringSchema,
      median: moneyMinorStringSchema,
      p75: moneyMinorStringSchema,
    }),
  ),
});

export type AnalyticsDistribution = z.infer<typeof analyticsDistributionSchema>;
