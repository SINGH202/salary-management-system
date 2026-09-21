import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ensureDbReady, resetDbReadyForTests } from './db/client.js';

const TOKEN = 'test-demo-token';

describe('createApp plumbing', () => {
  const previousToken = process.env.DEMO_ACCESS_TOKEN;
  const previousCors = process.env.CORS_ORIGIN;

  beforeAll(async () => {
    process.env.DEMO_ACCESS_TOKEN = TOKEN;
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    resetDbReadyForTests();
    await ensureDbReady();
  });

  afterAll(() => {
    process.env.DEMO_ACCESS_TOKEN = previousToken;
    process.env.CORS_ORIGIN = previousCors;
    resetDbReadyForTests();
  });

  it('GET /api/health is public and does not require auth', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/ready is public and checks the database', async () => {
    const res = await request(createApp()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('rejects protected routes without a bearer token', async () => {
    const res = await request(createApp()).get('/api/does-not-exist-yet');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects protected routes with a wrong token', async () => {
    const res = await request(createApp())
      .get('/api/does-not-exist-yet')
      .set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('serializes bigint fields as strings via json replacer', async () => {
    const app = createApp();
    app.get('/api/__test/bigint', (_req, res) => {
      res.json({ amount: 12345n });
    });

    const res = await request(app)
      .get('/api/__test/bigint')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ amount: '12345' });
  });
});
