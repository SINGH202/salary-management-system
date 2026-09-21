import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { resetDbReadyForTests } from '../../db/client.js';
import { seedSmallFixture } from '../../../test/fixtures/small-seed.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));
const TOKEN = 'test-demo-token';

describe('employees API', () => {
  let dir: string;
  let db: PrismaClient;
  let app: ReturnType<typeof createApp>;
  let employeeIds: string[];

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    dir = mkdtempSync(join(tmpdir(), 'acme-employees-'));
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
    ({ employeeIds } = await seedSmallFixture(db, { count: 50 }));
    app = createApp({ prisma: db });
  });

  afterAll(async () => {
    await db.$disconnect();
    resetDbReadyForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists active employees by default with pagination', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.total).toBe(45); // 50 seeded, ~10% terminated (every 10th)
    for (const row of res.body.data) {
      expect(row.status).toBe('active');
      expect(typeof row.currentSalaryBaseMinor).toBe('string');
    }
  });

  it('filters by country and searches by name when search length >= 2', async () => {
    const res = await request(app)
      .get('/api/employees')
      .query({ country: 'IN', search: 'First1', status: 'active' })
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const row of res.body.data) {
      expect(row.countryCode).toBe('IN');
      expect(
        `${row.firstName} ${row.lastName} ${row.workEmail}`.toLowerCase(),
      ).toContain('first1');
    }
  });

  it('ignores search when fewer than 2 characters', async () => {
    const res = await request(app)
      .get('/api/employees')
      .query({ search: 'F' })
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
  });

  it('sorts by annualized currentSalaryBaseMinor', async () => {
    const res = await request(app)
      .get('/api/employees')
      .query({ sort: 'currentSalaryBaseMinor', sortDir: 'desc', pageSize: 5 })
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    const annualized = res.body.data.map(
      (row: { currentSalaryBaseMinor: string; currentPayFrequency: string }) => {
        const period = BigInt(row.currentSalaryBaseMinor);
        return row.currentPayFrequency === 'monthly' ? period * 12n : period;
      },
    );
    for (let i = 1; i < annualized.length; i++) {
      expect(annualized[i - 1]! >= annualized[i]!).toBe(true);
    }
  });

  it('returns employee detail by id', async () => {
    const id = employeeIds[1]!;
    const res = await request(app)
      .get(`/api/employees/${id}`)
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.employeeCode).toBe('T-E0002');
  });

  it('returns 404 for unknown employee', async () => {
    const res = await request(app)
      .get('/api/employees/does-not-exist')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('patches mutable fields and rejects status in body', async () => {
    const id = employeeIds[2]!;

    const bad = await request(app)
      .patch(`/api/employees/${id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ status: 'terminated' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await request(app)
      .patch(`/api/employees/${id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ department: 'Platform', location: 'Hyderabad' });
    expect(ok.status).toBe(200);
    expect(ok.body.department).toBe('Platform');
    expect(ok.body.location).toBe('Hyderabad');
    expect(ok.body.status).toBe('active');
  });

  it('rejects self-referential managerId', async () => {
    const id = employeeIds[3]!;
    const res = await request(app)
      .patch(`/api/employees/${id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ managerId: id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
});
