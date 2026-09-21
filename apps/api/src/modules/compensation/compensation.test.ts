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

describe('compensation API', () => {
  let dir: string;
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof createApp>>;
  let seq = 0;

  function nextCode(): string {
    seq += 1;
    return `C-${String(seq).padStart(5, '0')}`;
  }

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    process.env.BASE_CURRENCY = 'INR';
    dir = mkdtempSync(join(tmpdir(), 'acme-comp-'));
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

  it('creates employee with hire record and matching denormalized fields', async () => {
    const code = nextCode();
    const res = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Ada',
      lastName: 'Lovelace',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Bengaluru',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L3',
      employmentType: 'full_time',
      hireDate: '2024-01-15T00:00:00.000Z',
      amountMinor: '1200000000',
      currency: 'INR',
      payFrequency: 'annual',
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.currentSalaryAmountMinor).toBe('1200000000');
    expect(res.body.currentSalaryBaseMinor).toBe('1200000000');

    const open = await db.salaryRecord.findMany({
      where: { employeeId: res.body.id, effectiveTo: null },
    });
    expect(open).toHaveLength(1);
    expect(open[0]!.changeReason).toBe('hire');
    expect(open[0]!.amountMinor).toBe(1200000000n);
  });

  it('records a raise and keeps exactly one open record matching denormalized pay', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Grace',
      lastName: 'Hopper',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'US',
      location: 'Austin',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L4',
      employmentType: 'full_time',
      hireDate: '2023-01-01T00:00:00.000Z',
      amountMinor: '10000000',
      currency: 'USD',
      payFrequency: 'annual',
    });
    expect(created.status).toBe(201);
    // $100,000 * 83 = ₹8,300,000.00 in minor units
    expect(created.body.currentSalaryBaseMinor).toBe('830000000');

    const raise = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '11000000',
      currency: 'USD',
      payFrequency: 'annual',
      effectiveFrom: '2024-01-01T00:00:00.000Z',
      changeReason: 'merit',
    });
    expect(raise.status).toBe(201);
    expect(raise.body.changeReason).toBe('merit');

    const open = await db.salaryRecord.findMany({
      where: { employeeId: created.body.id, effectiveTo: null },
    });
    expect(open).toHaveLength(1);
    expect(open[0]!.amountMinor).toBe(11000000n);

    const employee = await db.employee.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(employee.currentSalaryAmountMinor).toBe(11000000n);
    expect(employee.currentSalaryBaseMinor).toBe(913000000n); // 11000000 * 83
  });

  it('allows same-day raise (half-open intervals)', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Alan',
      lastName: 'Turing',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'UK',
      location: 'London',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L5',
      employmentType: 'full_time',
      hireDate: '2024-06-01T00:00:00.000Z',
      amountMinor: '5000000',
      currency: 'GBP',
      payFrequency: 'annual',
    });

    const sameDay = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '5200000',
      currency: 'GBP',
      payFrequency: 'annual',
      effectiveFrom: '2024-06-01T00:00:00.000Z',
      changeReason: 'correction',
    });
    expect(sameDay.status).toBe(201);

    const closed = await db.salaryRecord.findFirst({
      where: { employeeId: created.body.id, changeReason: 'hire' },
    });
    expect(closed?.effectiveTo?.toISOString()).toBe('2024-06-01T00:00:00.000Z');

    const history = await auth(request(app).get(`/api/employees/${created.body.id}/history`));
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0].changeReason).toBe('correction');
    expect(history.body.data[1].changeReason).toBe('hire');
    expect(history.body.data[0].effectiveFrom).toBe(history.body.data[1].effectiveFrom);
  });

  it('rejects hire with unknown managerId as BAD_REQUEST', async () => {
    const code = nextCode();
    const res = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'No',
      lastName: 'Manager',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Pune',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L2',
      managerId: 'mgr_does_not_exist',
      employmentType: 'full_time',
      hireDate: '2024-03-01T00:00:00.000Z',
      amountMinor: '100000000',
      currency: 'INR',
      payFrequency: 'monthly',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects backdated raise and hire reason on salary-changes', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Edsger',
      lastName: 'Dijkstra',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Pune',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L3',
      employmentType: 'full_time',
      hireDate: '2024-03-01T00:00:00.000Z',
      amountMinor: '200000000',
      currency: 'INR',
      payFrequency: 'monthly',
    });

    const backdate = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '210000000',
      currency: 'INR',
      payFrequency: 'monthly',
      effectiveFrom: '2024-02-01T00:00:00.000Z',
      changeReason: 'merit',
    });
    expect(backdate.status).toBe(400);

    const hireReason = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '210000000',
      currency: 'INR',
      payFrequency: 'monthly',
      effectiveFrom: '2024-04-01T00:00:00.000Z',
      changeReason: 'hire',
    });
    expect(hireReason.status).toBe(400);
    expect(hireReason.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('supports currency and pay-frequency changes mid-history', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Katherine',
      lastName: 'Johnson',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'US',
      location: 'DC',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L2',
      employmentType: 'full_time',
      hireDate: '2022-01-01T00:00:00.000Z',
      amountMinor: '800000',
      currency: 'USD',
      payFrequency: 'monthly',
    });

    const change = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '10000000',
      currency: 'INR',
      payFrequency: 'annual',
      effectiveFrom: '2023-01-01T00:00:00.000Z',
      changeReason: 'market_adjustment',
    });
    expect(change.status).toBe(201);

    const employee = await db.employee.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(employee.currentSalaryCurrency).toBe('INR');
    expect(employee.currentPayFrequency).toBe('annual');
    expect(employee.currentSalaryBaseMinor).toBe(10000000n);
  });

  it('terminates an employee, freezes pay, and rejects double terminate / raise', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Donald',
      lastName: 'Knuth',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'US',
      location: 'Stanford',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L6',
      employmentType: 'full_time',
      hireDate: '2020-01-01T00:00:00.000Z',
      amountMinor: '20000000',
      currency: 'USD',
      payFrequency: 'annual',
    });

    const before = await db.employee.findUniqueOrThrow({ where: { id: created.body.id } });

    const term = await auth(request(app).post(`/api/employees/${created.body.id}/terminate`)).send({
      terminationDate: '2025-01-01T00:00:00.000Z',
    });
    expect(term.status).toBe(204);

    const open = await db.salaryRecord.count({
      where: { employeeId: created.body.id, effectiveTo: null },
    });
    expect(open).toBe(0);

    const after = await db.employee.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(after.status).toBe('terminated');
    expect(after.currentSalaryBaseMinor).toBe(before.currentSalaryBaseMinor);

    const again = await auth(
      request(app).post(`/api/employees/${created.body.id}/terminate`),
    ).send({ terminationDate: '2025-02-01T00:00:00.000Z' });
    expect(again.status).toBe(409);

    const raise = await auth(
      request(app).post(`/api/employees/${created.body.id}/salary-changes`),
    ).send({
      amountMinor: '21000000',
      currency: 'USD',
      payFrequency: 'annual',
      effectiveFrom: '2025-03-01T00:00:00.000Z',
      changeReason: 'merit',
    });
    expect(raise.status).toBe(409);
  });

  it('returns salary history newest first', async () => {
    const code = nextCode();
    const created = await auth(request(app).post('/api/employees')).send({
      employeeCode: code,
      firstName: 'Barbara',
      lastName: 'Liskov',
      workEmail: `${code.toLowerCase()}@acme.test`,
      countryCode: 'IN',
      location: 'Chennai',
      department: 'Engineering',
      jobFamily: 'Software',
      level: 'L4',
      employmentType: 'full_time',
      hireDate: '2021-01-01T00:00:00.000Z',
      amountMinor: '150000000',
      currency: 'INR',
      payFrequency: 'monthly',
    });

    await auth(request(app).post(`/api/employees/${created.body.id}/salary-changes`)).send({
      amountMinor: '160000000',
      currency: 'INR',
      payFrequency: 'monthly',
      effectiveFrom: '2022-01-01T00:00:00.000Z',
      changeReason: 'promotion',
    });

    const history = await auth(request(app).get(`/api/employees/${created.body.id}/history`));
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[0].changeReason).toBe('promotion');
    expect(history.body.data[1].changeReason).toBe('hire');
  });
});
