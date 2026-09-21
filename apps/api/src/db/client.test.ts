import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ensureDbReady, resetDbReadyForTests } from './client.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('ensureDbReady', () => {
  let dir: string;
  let dbUrl: string;
  let client: PrismaClient;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'acme-wal-'));
    const dbPath = join(dir, 'test.db');
    dbUrl = `file:${dbPath}?connection_limit=1`;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
    });
    resetDbReadyForTests();
    client = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  });

  afterAll(async () => {
    await client.$disconnect();
    resetDbReadyForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  it('enables WAL at connection time (not via migration transaction)', async () => {
    await ensureDbReady(client);
    const rows = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>(
      'PRAGMA journal_mode;',
    );
    expect(rows[0]?.journal_mode.toLowerCase()).toBe('wal');
  });
});
