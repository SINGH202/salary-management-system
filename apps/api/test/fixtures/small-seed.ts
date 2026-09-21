import type { PrismaClient } from '@prisma/client';
import {
  applyTerminate,
  insertEmployeeWithHire,
} from '../../src/modules/compensation/compensation.writes.js';
import { createFakeFxRateProvider } from '../../src/modules/fx/index.js';

const DEPARTMENTS = ['Engineering', 'Product', 'Sales', 'Finance', 'HR', 'Ops'] as const;
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;
const COUNTRIES = [
  { code: 'IN', currency: 'INR', location: 'Bengaluru' },
  { code: 'US', currency: 'USD', location: 'Austin' },
  { code: 'UK', currency: 'GBP', location: 'London' },
] as const;

const BASE_CURRENCY = 'INR';
const SEED_TODAY = new Date('2026-09-01T00:00:00.000Z');

export type SmallSeedOptions = {
  count?: number;
};

/**
 * Small deterministic fixture (~50 employees) via insertEmployeeWithHire / applyTerminate.
 */
export async function seedSmallFixture(
  db: PrismaClient,
  options: SmallSeedOptions = {},
): Promise<{ employeeIds: string[] }> {
  const count = options.count ?? 50;
  const fx = createFakeFxRateProvider(
    { INR: 1, USD: 83, GBP: 105, EUR: 90 },
    BASE_CURRENCY,
  );

  for (const row of [
    { currencyCode: 'INR', rateToBase: 1, asOf: SEED_TODAY },
    { currencyCode: 'USD', rateToBase: 83, asOf: SEED_TODAY },
    { currencyCode: 'GBP', rateToBase: 105, asOf: SEED_TODAY },
    { currencyCode: 'EUR', rateToBase: 90, asOf: SEED_TODAY },
  ]) {
    await db.fxRate.upsert({
      where: { currencyCode: row.currencyCode },
      create: row,
      update: { rateToBase: row.rateToBase, asOf: row.asOf },
    });
  }

  // One band per (jobFamily, level, country) used by this fixture.
  for (const country of COUNTRIES) {
    for (const level of LEVELS) {
      const levelIndex = LEVELS.indexOf(level);
      const midAnnualNative = BigInt(700_000_00 + levelIndex * 150_000_00);
      const minAnnualNative = (midAnnualNative * 80n) / 100n;
      const maxAnnualNative = (midAnnualNative * 120n) / 100n;
      await db.compensationBand.upsert({
        where: {
          jobFamily_level_countryCode: {
            jobFamily: 'Software',
            level,
            countryCode: country.code,
          },
        },
        create: {
          jobFamily: 'Software',
          level,
          countryCode: country.code,
          minMinor: minAnnualNative,
          midMinor: midAnnualNative,
          maxMinor: maxAnnualNative,
          currency: country.currency,
        },
        update: {
          minMinor: minAnnualNative,
          midMinor: midAnnualNative,
          maxMinor: maxAnnualNative,
          currency: country.currency,
        },
      });
    }
  }

  const employeeIds: string[] = [];

  await db.$transaction(async (tx) => {
    for (let i = 0; i < count; i++) {
      const country = COUNTRIES[i % COUNTRIES.length]!;
      const department = DEPARTMENTS[i % DEPARTMENTS.length]!;
      const level = LEVELS[i % LEVELS.length]!;
      const payFrequency = i % 3 === 0 ? 'monthly' : 'annual';
      const annualNative = BigInt(600_000_00 + i * 10_000_00);
      const periodNative = payFrequency === 'monthly' ? annualNative / 12n : annualNative;
      const hireDate = new Date(`2020-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`);

      const { employeeId } = await insertEmployeeWithHire(
        tx,
        {
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
          hireDate: hireDate.toISOString(),
          amountMinor: periodNative.toString(),
          currency: country.currency,
          payFrequency,
        },
        fx,
        BASE_CURRENCY,
      );

      if (i % 10 === 0) {
        await applyTerminate(
          tx,
          employeeId,
          { terminationDate: '2025-06-01T00:00:00.000Z' },
          SEED_TODAY,
        );
      }

      employeeIds.push(employeeId);
    }
  });

  return { employeeIds };
}
