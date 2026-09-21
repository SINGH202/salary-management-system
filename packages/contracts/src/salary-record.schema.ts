import { z } from 'zod';
import {
  changeReasonSchema,
  moneyMinorStringSchema,
  payFrequencySchema,
} from './employee.schema.js';

/** Reasons allowed on POST /employees/:id/salary-changes — never 'hire'. */
export const salaryChangeReasonSchema = z.enum([
  'promotion',
  'merit',
  'market_adjustment',
  'correction',
]);

export const salaryRecordSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  amountMinor: moneyMinorStringSchema,
  currency: z.string().min(3).max(3),
  payFrequency: payFrequencySchema,
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
  changeReason: changeReasonSchema,
  note: z.string().nullable(),
  fxRateToBase: z.number(),
  amountBaseMinor: moneyMinorStringSchema,
  createdAt: z.string().datetime(),
});

export type SalaryRecord = z.infer<typeof salaryRecordSchema>;

export const salaryChangeCreateSchema = z.object({
  amountMinor: moneyMinorStringSchema,
  currency: z.string().min(3).max(3),
  payFrequency: payFrequencySchema,
  effectiveFrom: z.string().datetime(),
  changeReason: salaryChangeReasonSchema,
  note: z.string().optional(),
});

export type SalaryChangeCreate = z.infer<typeof salaryChangeCreateSchema>;
