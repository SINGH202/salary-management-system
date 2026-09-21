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
import { resetDbReadyForTests } from '../../db/client.js';
import { createFakeFxRateProvider } from '../fx/index.js';

const apiRoot = fileURLToPath(new URL('../../..', import.meta.url));
const TOKEN = 'test-demo-token';
const NOW = new Date('2026-09-01T00:00:00.000Z');

function auth(req: request.Test): request.Test {
  return req.set('Authorization', `Bearer ${TOKEN}`);
}

describe('bands API', () => {
  let dir: string;
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof createApp>>;
  let seq = 0;

  function nextCode(): string {
    seq += 1;
    return `B-${String(seq).padStart(5, '0')}`;
  }

  async function hire(overrides: Record<string, unknown> = {}) {
    const code = nextCode();
    const res = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Band',
      lastName: `Emp${seq}`,
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Bengaluru',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L3',
      employmentType: 'full_time',
      hireDate: '2024-01-01T00:00:00.000Z',
      amountMinor: '100000000', // ₹1,000,000.00 annual
      currency: 'INR',
      payFrequency: 'annual',
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; employeeCode: string };
  }

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    process.env.BASE_CURRENCY = 'INR';
    dir = mkdtempSync(join(tmpdir(), 'acme-bands-'));
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
      fx: createFakeFxRateProvider({ INR: 1, USD: 83, GBP: 105 }, 'INR'),
      baseCurrency: 'INR',
    });
  });

  afterAll(async () => {
    await db.$disconnect();
    resetDbReadyForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('upserts a band and lists it with filters', async () => {
    const put = await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Software',
      level: 'L3',
      countryCode: 'IN',
      minMinor: '80000000',
      midMinor: '100000000',
      maxMinor: '120000000',
      currency: 'INR',
    });
    expect(put.status).toBe(200);
    expect(put.body.midMinor).toBe('100000000');

    const again = await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Software',
      level: 'L3',
      countryCode: 'IN',
      minMinor: '85000000',
      midMinor: '105000000',
      maxMinor: '125000000',
      currency: 'INR',
    });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(put.body.id);
    expect(again.body.minMinor).toBe('85000000');

    const list = await auth(request(app).get('/api/bands')).query({
      jobFamily: 'Software',
      level: 'L3',
      countryCode: 'IN',
    });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.data[0].midMinor).toBe('105000000');
  });

  it('rejects band upsert when min > mid or mid > max', async () => {
    const res = await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Product',
      level: 'L2',
      countryCode: 'IN',
      minMinor: '100',
      midMinor: '50',
      maxMinor: '200',
      currency: 'INR',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns null compa-ratio when no band exists', async () => {
    const employee = await hire({
      jobFamily: 'NoBandFamily',
      level: 'L9',
      amountMinor: '50000000',
    });

    const res = await auth(request(app).get(`/api/employees/${employee.id}/compa-ratio`));
    expect(res.status).toBe(200);
    expect(res.body.bandId).toBeNull();
    expect(res.body.compaRatio).toBeNull();
    expect(res.body.annualBaseMinor).toBe('50000000');
    expect(res.body.bandMidBaseMinor).toBeNull();
  });

  it('computes compa-ratio using annualized base pay and current FX', async () => {
    await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Software',
      level: 'L4',
      countryCode: 'US',
      // mid $100,000.00 → ₹8,300,000.00 at 83
      minMinor: '8000000',
      midMinor: '10000000',
      maxMinor: '12000000',
      currency: 'USD',
    });

    // Monthly $10,000 → annual $120,000 → base ₹9,960,000.00
    const employee = await hire({
      countryCode: 'US',
      location: 'Austin',
      jobFamily: 'Software',
      level: 'L4',
      amountMinor: '1000000',
      currency: 'USD',
      payFrequency: 'monthly',
    });

    const res = await auth(request(app).get(`/api/employees/${employee.id}/compa-ratio`));
    expect(res.status).toBe(200);
    expect(res.body.bandId).toBeTruthy();
    expect(res.body.annualBaseMinor).toBe('996000000'); // 1000000 * 83 * 12
    expect(res.body.bandMidBaseMinor).toBe('830000000'); // 10000000 * 83
    expect(res.body.compaRatio).toBeCloseTo(996000000 / 830000000, 6);
  });

  it('lists active-only outliers by default and includes terminated when opted in', async () => {
    await auth(request(app).put('/api/bands')).send({
      jobFamily: 'Sales',
      level: 'L2',
      countryCode: 'IN',
      minMinor: '90000000',
      midMinor: '100000000',
      maxMinor: '110000000',
      currency: 'INR',
    });

    const below = await hire({
      jobFamily: 'Sales',
      level: 'L2',
      amountMinor: '50000000',
      lastName: 'Below',
    });
    const above = await hire({
      jobFamily: 'Sales',
      level: 'L2',
      amountMinor: '200000000',
      lastName: 'Above',
    });
    const inBand = await hire({
      jobFamily: 'Sales',
      level: 'L2',
      amountMinor: '100000000',
      lastName: 'InBand',
    });
    const terminatedBelow = await hire({
      jobFamily: 'Sales',
      level: 'L2',
      amountMinor: '40000000',
      lastName: 'TermBelow',
    });
    await auth(request(app).post(`/api/employees/${terminatedBelow.id}/terminate`)).send({
      terminationDate: '2025-01-01T00:00:00.000Z',
    });

    const active = await auth(request(app).get('/api/bands/outliers'));
    expect(active.status).toBe(200);
    const activeIds = active.body.data.map((row: { employeeId: string }) => row.employeeId);
    expect(activeIds).toContain(below.id);
    expect(activeIds).toContain(above.id);
    expect(activeIds).not.toContain(inBand.id);
    expect(activeIds).not.toContain(terminatedBelow.id);

    const belowRow = active.body.data.find(
      (row: { employeeId: string }) => row.employeeId === below.id,
    );
    const aboveRow = active.body.data.find(
      (row: { employeeId: string }) => row.employeeId === above.id,
    );
    expect(belowRow.side).toBe('below');
    expect(aboveRow.side).toBe('above');

    const withTerminated = await auth(request(app).get('/api/bands/outliers')).query({
      includeTerminated: 'true',
    });
    const allIds = withTerminated.body.data.map((row: { employeeId: string }) => row.employeeId);
    expect(allIds).toContain(terminatedBelow.id);
  });
});
