import type { PrismaClient } from '@prisma/client';

const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'Finance', 'HR', 'Ops'] as const;
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
const COUNTRIES = [
  { code: 'IN', currency: 'INR', location: 'Bengaluru' },
  { code: 'US', currency: 'USD', location: 'Austin' },
  { code: 'UK', currency: 'GBP', location: 'London' },
] as const;

export type SmallSeedOptions = {
  /** Number of employees to create. Default 50. */
  count?: number;
};

/**
 * Small deterministic fixture for integration tests (~50 employees).
 * Commit 8: raw Prisma inserts (no insertEmployeeWithHire yet).
 * Commit 9 will refactor this to use compensation helpers.
 */
export async function seedSmallFixture(
  db: PrismaClient,
  options: SmallSeedOptions = {},
): Promise<{ employeeIds: string[] }> {
  const count = options.count ?? 50;
  const employeeIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const country = COUNTRIES[i % COUNTRIES.length]!;
    const department = DEPARTMENTS[i % DEPARTMENTS.length]!;
    const level = LEVELS[i % LEVELS.length]!;
    const status = i % 10 === 0 ? 'terminated' : 'active';
    const payFrequency = i % 3 === 0 ? 'monthly' : 'annual';
    // Period base amount — monthly values are ~1/12 of a typical annual so annualized sort can be tested
    const annualBase = BigInt(600_000_00 + i * 10_000_00); // ₹ / reporting units in minor
    const periodBase = payFrequency === 'monthly' ? annualBase / 12n : annualBase;

    const employee = await db.employee.create({
      data: {
        employeeCode: `T-E${String(i + 1).padStart(4, '0')}`,
        firstName: `First${i + 1}`,
        lastName: `Last${i + 1}`,
        workEmail: `employee${i + 1}@acme.test`,
        countryCode: country.code,
        location: country.location,
        department,
        jobFamily: 'Software',
        level,
        employmentType: i % 7 === 0 ? 'contractor' : 'full_time',
        hireDate: new Date(`2020-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
        status,
        gender: null,
        currentSalaryAmountMinor: periodBase,
        currentSalaryCurrency: country.currency,
        currentSalaryBaseMinor: periodBase,
        currentPayFrequency: payFrequency,
      },
    });
    employeeIds.push(employee.id);
  }

  return { employeeIds };
}
