import { z } from 'zod';

/** Base-10 integer string of minor currency units (e.g. cents). Never a number/float. */
export const moneyMinorStringSchema = z
  .string()
  .regex(/^-?\d+$/, 'must be an integer string of minor units');

export const employmentTypeSchema = z.enum(['full_time', 'part_time', 'contractor']);
export const employeeStatusSchema = z.enum(['active', 'terminated']);
export const payFrequencySchema = z.enum(['annual', 'monthly']);
export const changeReasonSchema = z.enum([
  'hire',
  'promotion',
  'merit',
  'market_adjustment',
  'correction',
]);

export const employeeSchema = z.object({
  id: z.string(),
  employeeCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  workEmail: z.string().email(),
  countryCode: z.string().min(2).max(2),
  location: z.string().min(1),
  department: z.string().min(1),
  jobFamily: z.string().min(1),
  level: z.string().min(1),
  managerId: z.string().min(1).nullable(),
  employmentType: employmentTypeSchema,
  hireDate: z.string().datetime(),
  status: employeeStatusSchema,
  gender: z.string().nullable(),
  currentSalaryAmountMinor: moneyMinorStringSchema,
  currentSalaryCurrency: z.string().min(3).max(3),
  currentSalaryBaseMinor: moneyMinorStringSchema,
  currentPayFrequency: payFrequencySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Employee = z.infer<typeof employeeSchema>;

/** Create = profile + starting pay. effectiveFrom is always hireDate (no separate field). */
export const employeeCreateSchema = z
  .object({
    employeeCode: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    workEmail: z.string().email(),
    countryCode: z.string().min(2).max(2),
    location: z.string().min(1),
    department: z.string().min(1),
    jobFamily: z.string().min(1),
    level: z.string().min(1),
    managerId: z.string().min(1).nullable().optional(),
    employmentType: employmentTypeSchema,
    hireDate: z.string().datetime(),
    gender: z.string().nullable().optional(),
    amountMinor: moneyMinorStringSchema,
    currency: z.string().min(3).max(3),
    payFrequency: payFrequencySchema,
  })
  .strict();

export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;

/**
 * Mutable profile fields only. `.strict()` rejects immutable fields (incl. status)
 * and unknown keys at the schema boundary.
 */
export const employeeUpdateSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    department: z.string().min(1).optional(),
    jobFamily: z.string().min(1).optional(),
    level: z.string().min(1).optional(),
    managerId: z.string().min(1).nullable().optional(),
    employmentType: employmentTypeSchema.optional(),
    gender: z.string().nullable().optional(),
    countryCode: z.string().min(2).max(2).optional(),
  })
  .strict();

export type EmployeeUpdate = z.infer<typeof employeeUpdateSchema>;

export const terminateEmployeeSchema = z.object({
  terminationDate: z.string().datetime(),
  note: z.string().optional(),
});

export type TerminateEmployee = z.infer<typeof terminateEmployeeSchema>;

export const employeeSortFieldSchema = z.enum([
  'lastName',
  'hireDate',
  'department',
  'currentSalaryBaseMinor',
]);

export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  country: z.string().optional(),
  department: z.string().optional(),
  level: z.string().optional(),
  status: employeeStatusSchema.default('active'),
  search: z.string().optional(),
  sort: employeeSortFieldSchema.optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
