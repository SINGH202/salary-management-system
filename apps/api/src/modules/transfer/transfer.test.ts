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

function csvRow(overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    employeeCode: 'IMP-001',
    firstName: 'Import',
    lastName: 'One',
    workEmail: 'imp1@acme.test',
    countryCode: 'IN',
    location: 'Bengaluru',
    department: 'Engineering',
    jobFamily: 'Software',
    level: 'L3',
    managerId: '',
    employmentType: 'full_time',
    hireDate: '2024-01-15T00:00:00.000Z',
    gender: '',
    amountMinor: '100000000',
    currency: 'INR',
    payFrequency: 'annual',
    ...overrides,
  };
  const headers = Object.keys(base);
  // Stable header order matching IMPORT_HEADERS-ish
  const ordered = [
    'employeeCode',
    'firstName',
    'lastName',
    'workEmail',
    'countryCode',
    'location',
    'department',
    'jobFamily',
    'level',
    'managerId',
    'employmentType',
    'hireDate',
    'gender',
    'amountMinor',
    'currency',
    'payFrequency',
  ];
  return ordered.map((h) => base[h] ?? '').join(',');
}

describe('transfer CSV API', () => {
  let dir: string;
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    process.env.BASE_CURRENCY = 'INR';
    dir = mkdtempSync(join(tmpdir(), 'acme-transfer-'));
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
  });

  afterAll(async () => {
    await db.$disconnect();
    resetDbReadyForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('imports valid CSV rows via insertEmployeeWithHire', async () => {
    const header =
      'employeeCode,firstName,lastName,workEmail,countryCode,location,department,jobFamily,level,managerId,employmentType,hireDate,gender,amountMinor,currency,payFrequency';
    const body = [
      header,
      csvRow({ employeeCode: 'IMP-100', workEmail: 'imp100@acme.test' }),
      csvRow({
        employeeCode: 'IMP-101',
        workEmail: 'imp101@acme.test',
        firstName: 'Two',
        amountMinor: '200000000',
      }),
    ].join('\n');

    const res = await auth(request(app).post('/api/import/employees'))
      .attach('file', Buffer.from(body, 'utf8'), {
        filename: 'hires.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);
    expect(res.body.errors).toEqual([]);

    const count = await db.employee.count({
      where: { employeeCode: { in: ['IMP-100', 'IMP-101'] } },
    });
    expect(count).toBe(2);

    const open = await db.salaryRecord.count({
      where: {
        employee: { employeeCode: 'IMP-100' },
        effectiveTo: null,
        changeReason: 'hire',
      },
    });
    expect(open).toBe(1);
  });

  it('rejects invalid rows without writing any employees', async () => {
    const header =
      'employeeCode,firstName,lastName,workEmail,countryCode,location,department,jobFamily,level,managerId,employmentType,hireDate,gender,amountMinor,currency,payFrequency';
    const body = [
      header,
      csvRow({
        employeeCode: 'IMP-BAD',
        workEmail: 'not-an-email',
        amountMinor: 'not-money',
      }),
      csvRow({ employeeCode: 'IMP-OK', workEmail: 'impok@acme.test' }),
    ].join('\n');

    const before = await db.employee.count();
    const res = await auth(request(app).post('/api/import/employees'))
      .attach('file', Buffer.from(body, 'utf8'), {
        filename: 'bad.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(400);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors.some((e: { field: string }) => e.field === 'workEmail')).toBe(true);
    expect(await db.employee.count()).toBe(before);
  });

  it('exports active employees as CSV with current pay columns', async () => {
    const res = await auth(request(app).get('/api/export/employees'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/employees\.csv/);
    expect(res.text).toContain('employeeCode');
    expect(res.text).toContain('currentSalaryAmountMinor');
    expect(res.text).toContain('IMP-100');
  });

  it('export respects status and department filters', async () => {
    const res = await auth(request(app).get('/api/export/employees')).query({
      department: 'Engineering',
      status: 'active',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('IMP-100');
    expect(res.text.split('\n').filter((l) => l.includes('IMP-')).length).toBeGreaterThan(0);
  });
});
