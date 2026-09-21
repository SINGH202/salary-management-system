/**
 * Deterministic 10k employee seed.
 * Fixed clock SEED_TODAY + faker.seed(42) + BASE_CURRENCY='INR' (not from process.env).
 *
 * All hire / raise / terminate paths go through compensation.writes so invariants match production.
 */
import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';
import {
  applySalaryChange,
  applyTerminate,
  insertEmployeeWithHire,
} from '../../modules/compensation/compensation.writes.js';
import { createFakeFxRateProvider } from '../../modules/fx/index.js';
import { ensureDbReady } from '../client.js';

const SEED_TODAY = new Date('2026-09-01T00:00:00.000Z');
const BASE_CURRENCY = 'INR';
const EMPLOYEE_COUNT = 10_000;
const BATCH_SIZE = 1000;

const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
type Level = (typeof LEVELS)[number];

const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Sales',
  'Finance',
  'HR',
  'Ops',
  'Marketing',
  'Customer Success',
] as const;

const JOB_FAMILIES = [
  'Software',
  'Data',
  'Design',
  'Sales',
  'People',
  'Operations',
] as const;

const COUNTRIES = [
  { code: 'US', currency: 'USD', location: 'Austin' },
  { code: 'IN', currency: 'INR', location: 'Bengaluru' },
  { code: 'UK', currency: 'GBP', location: 'London' },
  { code: 'DE', currency: 'EUR', location: 'Berlin' },
  { code: 'SG', currency: 'SGD', location: 'Singapore' },
  { code: 'BR', currency: 'BRL', location: 'São Paulo' },
] as const;

const FX_RATES: Array<{ currencyCode: string; rateToBase: number }> = [
  { currencyCode: 'INR', rateToBase: 1 },
  { currencyCode: 'USD', rateToBase: 83 },
  { currencyCode: 'GBP', rateToBase: 105 },
  { currencyCode: 'EUR', rateToBase: 90 },
  { currencyCode: 'SGD', rateToBase: 62 },
  { currencyCode: 'BRL', rateToBase: 15 },
];

const LEVEL_RANK: Record<Level, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
  L6: 6,
};

function pickLevel(index: number): Level {
  // Pyramid: 45% L1–L2, 35% L3–L4, 15% L5, 5% L6
  const bucket = index % 100;
  if (bucket < 22) return 'L1';
  if (bucket < 45) return 'L2';
  if (bucket < 62) return 'L3';
  if (bucket < 80) return 'L4';
  if (bucket < 95) return 'L5';
  return 'L6';
}

function pickEmploymentType(index: number): 'full_time' | 'part_time' | 'contractor' {
  const bucket = index % 100;
  if (bucket < 85) return 'full_time';
  if (bucket < 95) return 'contractor';
  return 'part_time';
}

/** Annual mid in native minor units for band (jobFamily × level × country). */
function bandMidAnnualNative(level: Level, currency: string): bigint {
  const baseByCurrency: Record<string, number> = {
    INR: 800_000_00,
    USD: 90_000_00,
    GBP: 70_000_00,
    EUR: 75_000_00,
    SGD: 100_000_00,
    BRL: 180_000_00,
  };
  const base = baseByCurrency[currency] ?? 80_000_00;
  const levelMult = 1 + (LEVEL_RANK[level] - 1) * 0.35;
  return BigInt(Math.round(base * levelMult));
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function clampDate(date: Date, max: Date): Date {
  return date.getTime() > max.getTime() ? max : date;
}

type PlannedEmployee = {
  index: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  countryCode: string;
  location: string;
  currency: string;
  department: string;
  jobFamily: string;
  level: Level;
  employmentType: 'full_time' | 'part_time' | 'contractor';
  hireDate: Date;
  gender: string | null;
  payFrequency: 'annual' | 'monthly';
  /** Period amount in native currency at hire */
  hireAmountMinor: bigint;
  raises: Array<{
    effectiveFrom: Date;
    amountMinor: bigint;
    changeReason: 'promotion' | 'merit';
  }>;
  terminateAt: Date | null;
  forceBelowBand: boolean;
};

function planEmployees(): PlannedEmployee[] {
  const planned: PlannedEmployee[] = [];

  for (let i = 0; i < EMPLOYEE_COUNT; i++) {
    const country = COUNTRIES[i % COUNTRIES.length]!;
    const level = pickLevel(i);
    const department = DEPARTMENTS[i % DEPARTMENTS.length]!;
    const jobFamily = JOB_FAMILIES[i % JOB_FAMILIES.length]!;
    const employmentType = pickEmploymentType(i);
    const payFrequency = i % 4 === 0 ? 'monthly' : 'annual';

    const mid = bandMidAnnualNative(level, country.currency);
    const min = (mid * 80n) / 100n;
    // ~4% of actives will be forced below band (every 25th); terminated later skip outlier set
    const forceBelowBand = i % 25 === 0;
    let annualNative = forceBelowBand
      ? (min * 85n) / 100n
      : (mid * BigInt(90 + (i % 21))) / 100n; // 90–110% of mid

    if (employmentType === 'part_time') {
      annualNative = (annualNative * 60n) / 100n;
    }

    const hireYearsAgo = 1 + (i % 8);
    const hireDate = addMonths(SEED_TODAY, -hireYearsAgo * 12 - (i % 11));

    const raiseCount = 1 + (i % 5); // 1–5 total records including hire → 0–4 raises
    const raises: PlannedEmployee['raises'] = [];
    let currentAnnual = annualNative;
    let cursor = hireDate;

    for (let r = 1; r < raiseCount; r++) {
      const gapMonths = 9 + (i % 16); // 9–24
      cursor = addMonths(cursor, gapMonths);
      if (cursor.getTime() >= SEED_TODAY.getTime()) {
        break;
      }
      const pct = 3 + (i % 13); // 3–15%
      currentAnnual = currentAnnual + (currentAnnual * BigInt(pct)) / 100n;
      raises.push({
        effectiveFrom: cursor,
        amountMinor: payFrequency === 'monthly' ? currentAnnual / 12n : currentAnnual,
        changeReason: r % 2 === 0 ? 'promotion' : 'merit',
      });
    }

    const willTerminate = i % 10 === 0; // ~10%
    let terminateAt: Date | null = null;
    if (willTerminate) {
      const lastEvent = raises.length > 0 ? raises[raises.length - 1]!.effectiveFrom : hireDate;
      terminateAt = clampDate(addMonths(lastEvent, 2 + (i % 6)), SEED_TODAY);
      if (terminateAt.getTime() <= lastEvent.getTime()) {
        terminateAt = clampDate(addMonths(lastEvent, 1), SEED_TODAY);
      }
      if (terminateAt.getTime() <= lastEvent.getTime()) {
        terminateAt = null; // cannot terminate; keep active
      }
    }

    const code = `E-${String(i + 1).padStart(5, '0')}`;
    planned.push({
      index: i,
      employeeCode: code,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: country.code,
      location: country.location,
      currency: country.currency,
      department,
      jobFamily,
      level,
      employmentType,
      hireDate,
      gender: i % 3 === 0 ? null : faker.person.sex(),
      payFrequency,
      hireAmountMinor: payFrequency === 'monthly' ? annualNative / 12n : annualNative,
      raises,
      terminateAt,
      forceBelowBand: forceBelowBand && terminateAt === null,
    });
  }

  return planned;
}

async function seedFx(db: PrismaClient): Promise<void> {
  for (const row of FX_RATES) {
    await db.fxRate.upsert({
      where: { currencyCode: row.currencyCode },
      create: { ...row, asOf: SEED_TODAY },
      update: { rateToBase: row.rateToBase, asOf: SEED_TODAY },
    });
  }
}

async function seedBands(db: PrismaClient): Promise<void> {
  for (const country of COUNTRIES) {
    for (const jobFamily of JOB_FAMILIES) {
      for (const level of LEVELS) {
        const mid = bandMidAnnualNative(level, country.currency);
        const min = (mid * 80n) / 100n;
        const max = (mid * 120n) / 100n;
        await db.compensationBand.upsert({
          where: {
            jobFamily_level_countryCode: {
              jobFamily,
              level,
              countryCode: country.code,
            },
          },
          create: {
            jobFamily,
            level,
            countryCode: country.code,
            minMinor: min,
            midMinor: mid,
            maxMinor: max,
            currency: country.currency,
          },
          update: {
            minMinor: min,
            midMinor: mid,
            maxMinor: max,
            currency: country.currency,
          },
        });
      }
    }
  }
}

async function assignManagers(db: PrismaClient): Promise<number> {
  /**
   * Top-down: prefer same department + country, one level above.
   * Falls back to any higher-level peer; leaves null when none exist.
   */
  const employees = await db.employee.findMany({
    select: {
      id: true,
      level: true,
      department: true,
      countryCode: true,
    },
  });

  const byKey = new Map<string, string[]>();
  for (const e of employees) {
    const key = `${e.department}\0${e.countryCode}\0${e.level}`;
    const list = byKey.get(key) ?? [];
    list.push(e.id);
    byKey.set(key, list);
  }

  let assigned = 0;
  const updates: Array<{ id: string; managerId: string }> = [];

  for (const e of employees) {
    const rank = LEVEL_RANK[e.level as Level] ?? 0;
    if (rank >= 6) continue;

    let managerId: string | undefined;
    const preferred = byKey.get(`${e.department}\0${e.countryCode}\0L${rank + 1}`);
    if (preferred && preferred.length > 0) {
      managerId = preferred[Math.abs(e.id.charCodeAt(0)) % preferred.length]!;
    } else {
      for (let r = rank + 2; r <= 6 && !managerId; r++) {
        const pool = byKey.get(`${e.department}\0${e.countryCode}\0L${r}`);
        if (pool && pool.length > 0) {
          managerId = pool[0]!;
        }
      }
    }

    if (managerId && managerId !== e.id) {
      updates.push({ id: e.id, managerId });
    }
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    await db.$transaction(
      chunk.map((u) =>
        db.employee.update({
          where: { id: u.id },
          data: { managerId: u.managerId },
        }),
      ),
    );
    assigned += chunk.length;
  }
  return assigned;
}

async function main(): Promise<void> {
  faker.seed(42);

  const db = new PrismaClient();
  const started = Date.now();
  await ensureDbReady(db);

  console.log('Clearing existing data…');
  await db.salaryRecord.deleteMany();
  await db.employee.deleteMany();
  await db.compensationBand.deleteMany();
  await db.fxRate.deleteMany();

  console.log('Seeding FX rates + compensation bands…');
  await seedFx(db);
  await seedBands(db);

  const fx = createFakeFxRateProvider(
    Object.fromEntries(FX_RATES.map((r) => [r.currencyCode, r.rateToBase])),
    BASE_CURRENCY,
  );

  const planned = planEmployees();
  console.log(`Seeding ${planned.length} employees in batches of ${BATCH_SIZE}…`);

  for (let offset = 0; offset < planned.length; offset += BATCH_SIZE) {
    const batch = planned.slice(offset, offset + BATCH_SIZE);
    await db.$transaction(
      async (tx) => {
        for (const p of batch) {
          const { employeeId } = await insertEmployeeWithHire(
            tx,
            {
              employeeCode: p.employeeCode,
              firstName: p.firstName,
              lastName: p.lastName,
              workEmail: p.workEmail,
              countryCode: p.countryCode,
              location: p.location,
              department: p.department,
              jobFamily: p.jobFamily,
              level: p.level,
              employmentType: p.employmentType,
              hireDate: p.hireDate.toISOString(),
              gender: p.gender,
              amountMinor: p.hireAmountMinor.toString(),
              currency: p.currency,
              payFrequency: p.payFrequency,
            },
            fx,
            BASE_CURRENCY,
          );

          for (const raise of p.raises) {
            await applySalaryChange(
              tx,
              employeeId,
              {
                amountMinor: raise.amountMinor.toString(),
                currency: p.currency,
                payFrequency: p.payFrequency,
                effectiveFrom: raise.effectiveFrom.toISOString(),
                changeReason: raise.changeReason,
              },
              fx,
              BASE_CURRENCY,
            );
          }

          if (p.terminateAt) {
            await applyTerminate(
              tx,
              employeeId,
              { terminationDate: p.terminateAt.toISOString() },
              SEED_TODAY,
            );
          }
        }
      },
      { timeout: 120_000 },
    );
    console.log(`  … ${Math.min(offset + BATCH_SIZE, planned.length)} / ${planned.length}`);
  }

  console.log('Assigning managers (same dept/country, one level above when possible)…');
  const managersAssigned = await assignManagers(db);

  const [employees, salaryRecords, terminated, bands, fxCount] = await Promise.all([
    db.employee.count(),
    db.salaryRecord.count(),
    db.employee.count({ where: { status: 'terminated' } }),
    db.compensationBand.count(),
    db.fxRate.count(),
  ]);

  const elapsedMs = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        employees,
        salaryRecords,
        terminated,
        bands,
        fxRates: fxCount,
        managersAssigned,
        elapsedMs,
      },
      null,
      2,
    ),
  );

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
