import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { FixedClock } from '../../common/clock.js';
import { annualize } from '../../common/money.js';
import { resetDbReadyForTests } from '../../db/client.js';
import { createFakeFxRateProvider } from '../fx/index.js';
import { AnalyticsRepository } from './analytics.repository.js';

const apiRoot = fileURLToPath(new URL('../../..', import.meta.url));
const TOKEN = 'test-demo-token';
const NOW = new Date('2026-09-01T00:00:00.000Z');

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${TOKEN}`);
}

/**
 * Hand-computable fixture (all INR annual unless noted):
 * - Eng A: 100 (active FT)
 * - Eng B: 200 (active FT)
 * - Eng C: 300 (active FT)
 * - Sales D: 400 (active FT)
 * - Eng Contractor: 50 (active contractor) — in headcount, out of default payroll
 * - Eng Terminated: 1000 (terminated FT) — out of defaults
 * Band Software/L3/IN: min 150, mid 250, max 350 → A below, C in-band, Eng Terminated ignored when active-only
 */
describe('analytics API', () => {
  let dir: string;
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof createApp>>;
  let seq = 0;

  function nextCode(): string {
    seq += 1;
    return `A-${String(seq).padStart(5, '0')}`;
  }

  async function hire(input: {
    lastName: string;
    department: string;
    amountMinor: string;
    employmentType?: string;
    level?: string;
  }) {
    const code = nextCode();
    const res = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Anal',
      lastName: input.lastName,
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Bengaluru',
      department: input.department,
      jobFamily: 'Software',
      level: input.level ?? 'L3',
      employmentType: input.employmentType ?? 'full_time',
      hireDate: '2024-01-01T00:00:00.000Z',
      amountMinor: input.amountMinor,
      currency: 'INR',
      payFrequency: 'annual',
    });
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    process.env.BASE_CURRENCY = 'INR';
    dir = mkdtempSync(join(tmpdir(), 'acme-analytics-'));
    const dbPath = join(dir, 'test.db');
    const dbUrl = `file:${dbPath}?connection_limit=1`;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });
    resetDbReadyForTests();
    db = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await db.$connect();
    app = await createApp({
      prisma: db,
      clock: new FixedClock(NOW),
      fx: createFakeFxRateProvider({ INR: 1, USD: 83 }, 'INR'),
      baseCurrency: 'INR',
    });

    await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Software',
      level: 'L3',
      countryCode: 'IN',
      minMinor: '150',
      midMinor: '250',
      maxMinor: '350',
      currency: 'INR',
    });

    await hire({ lastName: 'A', department: 'Engineering', amountMinor: '100' });
    await hire({ lastName: 'B', department: 'Engineering', amountMinor: '200' });
    await hire({ lastName: 'C', department: 'Engineering', amountMinor: '300' });
    await hire({ lastName: 'D', department: 'Sales', amountMinor: '400' });
    await hire({
      lastName: 'Contractor',
      department: 'Engineering',
      amountMinor: '50',
      employmentType: 'contractor',
    });
    const term = await hire({
      lastName: 'Terminated',
      department: 'Engineering',
      amountMinor: '1000',
    });
    await auth(request(app).post(`/api/employees/${term.id}/terminate`)).send({
      terminationDate: '2025-06-01T00:00:00.000Z',
    });
  });

  afterAll(async () => {
    await db.$disconnect();
    resetDbReadyForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('getPercentile uses annualized ranking (nearest-rank)', async () => {
    const repo = new AnalyticsRepository(db);
    // Active FT only: 100,200,300,400 → n=4; p50 → ceil(0.5*4)-1 = 1 → 200
    const median = await repo.getPercentile(50, { includeContractors: false });
    expect(median).toBe(200n);

    const p25 = await repo.getPercentile(25, { includeContractors: false });
    // ceil(0.25*4)-1 = 0 → 100
    expect(p25).toBe(100n);

    const p75 = await repo.getPercentile(75, { includeContractors: false });
    // ceil(0.75*4)-1 = 2 → 300
    expect(p75).toBe(300n);
  });

  it('annualizes monthly pay before percentile (never raw period)', async () => {
    const code = nextCode();
    const monthly = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Monthly',
      lastName: 'Zed',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Pune',
      department: 'Finance',
      jobFamily: 'Software',
      level: 'L3',
      employmentType: 'full_time',
      hireDate: '2024-02-01T00:00:00.000Z',
      amountMinor: '10', // period
      currency: 'INR',
      payFrequency: 'monthly', // annual 120
    });
    expect(monthly.status).toBe(201);

    const employee = await db.employee.findUniqueOrThrow({ where: { id: monthly.body.id } });
    expect(
      AnalyticsRepository.annualBaseFromEmployee(employee),
    ).toBe(annualize(10n, 'monthly'));

    const repo = new AnalyticsRepository(db);
    // Among Finance only: just this one → median 120
    const median = await repo.getPercentile(50, { includeContractors: false }, {
      groupBy: 'department',
      groupKey: 'Finance',
    });
    expect(median).toBe(120n);
  });

  it('headcount includes contractors by default and groups by department', async () => {
    const res = await auth(request(app).get('/api/analytics/headcount')).query({
      groupBy: 'department',
    });
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      res.body.buckets.map((b: { key: string; value: number }) => [b.key, b.value]),
    );
    // Eng: A,B,C + contractor = 4 (terminated excluded); Sales: 1; Finance: 1 (monthly hire)
    expect(byKey.Engineering).toBe(4);
    expect(byKey.Sales).toBe(1);
  });

  it('payroll-cost excludes contractors by default and sums annualized base', async () => {
    const res = await auth(request(app).get('/api/analytics/payroll-cost')).query({
      groupBy: 'department',
    });
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(
      res.body.buckets.map((b: { key: string; value: string }) => [b.key, b.value]),
    );
    // Eng: 100+200+300 = 600 (no contractor 50, no terminated 1000)
    expect(byKey.Engineering).toBe('600');
    expect(byKey.Sales).toBe('400');
    expect(byKey.Finance).toBe('120');
  });

  it('distribution returns p25/median/p75 per group', async () => {
    const res = await auth(request(app).get('/api/analytics/distribution')).query({
      groupBy: 'department',
    });
    expect(res.status).toBe(200);
    const eng = res.body.buckets.find((b: { key: string }) => b.key === 'Engineering');
    // Eng FT active: 100,200,300 → p25=100, median=200, p75=300
    expect(eng.p25).toBe('100');
    expect(eng.median).toBe('200');
    expect(eng.p75).toBe('300');
  });

  it('summary combines headcount, payroll, median, and active outlier count', async () => {
    const res = await auth(request(app).get('/api/analytics/summary'));
    expect(res.status).toBe(200);
    // Headcount: Eng4 + Sales1 + Finance1 = 6
    expect(res.body.headcount).toBe(6);
    // Payroll FT active: 100+200+300+400+120 = 1120
    expect(res.body.payrollCostAnnualBase).toBe('1120');
    expect(res.body.averageAnnualBase).toBe('224'); // 1120/5
    // Median of 100,120,200,300,400 → n=5, ceil(0.5*5)-1=2 → 200
    expect(res.body.medianAnnualBase).toBe('200');
    // Outliers: A(100) below, D(400) above, contractor(50) below, Finance(120) below
    expect(res.body.outlierCount).toBe(4);
  });

  it('summary outlierCount respects includeContractors=false', async () => {
    const withContractors = await auth(request(app).get('/api/analytics/summary'));
    const without = await auth(request(app).get('/api/analytics/summary')).query({
      includeContractors: 'false',
    });

    expect(without.status).toBe(200);
    // Same active outliers minus the contractor (50)
    expect(without.body.outlierCount).toBe(withContractors.body.outlierCount - 1);
    expect(without.body.outlierCount).toBe(3);
  });
});
