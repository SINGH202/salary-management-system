import { describe, expect, it } from 'vitest';
import {
  employeeCreateSchema,
  employeeListQuerySchema,
  employeeUpdateSchema,
} from './employee.schema.js';

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

describe('employeeListQuerySchema', () => {
  it('defaults status to active when omitted', () => {
    const parsed = employeeListQuerySchema.parse({});
    expect(parsed.status).toBe('active');
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('allows explicit terminated status', () => {
    const parsed = employeeListQuerySchema.parse({ status: 'terminated' });
    expect(parsed.status).toBe('terminated');
  });
});
