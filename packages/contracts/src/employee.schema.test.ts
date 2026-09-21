import { describe, expect, it } from 'vitest';
import { employeeCreateSchema, employeeUpdateSchema } from './employee.schema.js';

describe('employeeUpdateSchema', () => {
  it('accepts mutable fields', () => {
    const parsed = employeeUpdateSchema.parse({ firstName: 'Ada', department: 'Engineering' });
    expect(parsed.firstName).toBe('Ada');
  });

  it('rejects status (immutable / terminate-only)', () => {
    const result = employeeUpdateSchema.safeParse({ status: 'terminated' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys via .strict()', () => {
    const result = employeeUpdateSchema.safeParse({ employeeCode: 'E-1' });
    expect(result.success).toBe(false);
  });
});

describe('employeeCreateSchema', () => {
  it('requires hire pay fields and has no separate effectiveFrom', () => {
    const result = employeeCreateSchema.safeParse({
      employeeCode: 'E-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      workEmail: 'ada@acme.test',
      countryCode: 'US',
      location: 'NYC',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L3',
      employmentType: 'full_time',
      hireDate: '2026-01-15T00:00:00.000Z',
      amountMinor: '12000000',
      currency: 'USD',
      payFrequency: 'annual',
      effectiveFrom: '2026-01-15T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
