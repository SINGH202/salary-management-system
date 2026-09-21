import { z } from 'zod';
import { employeeCreateSchema } from './employee.schema.js';

/** CSV import row = EmployeeCreate shape (profile + hire pay). */
export const importEmployeeRowSchema = employeeCreateSchema;

export type ImportEmployeeRow = z.infer<typeof importEmployeeRowSchema>;

export const importRowErrorSchema = z.object({
  row: z.number().int().min(1),
  field: z.string(),
  message: z.string(),
});

export const importEmployeesResultSchema = z.object({
  imported: z.number().int().min(0),
  errors: z.array(importRowErrorSchema),
});

export type ImportEmployeesResult = z.infer<typeof importEmployeesResultSchema>;
