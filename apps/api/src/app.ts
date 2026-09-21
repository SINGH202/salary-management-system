import cors from 'cors';
import express, { type Express } from 'express';
import { authGate } from './common/auth-gate.js';
import { errorHandler } from './common/error-handler.js';
import { ensureDbReady, prisma } from './db/client.js';

/**
 * Installs BigInt → string for res.json without mutating BigInt.prototype.
 * Express 4 uses JSON.stringify(value, this.get('json replacer')).
 */
function installBigIntJsonReplacer(app: Express): void {
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export function createApp(): Express {
  const app = express();
  installBigIntJsonReplacer(app);

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  // Unauthenticated liveness — no DB dependency
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Unauthenticated readiness — cheap DB check
  app.get('/api/ready', async (_req, res, next) => {
    try {
      await ensureDbReady();
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready' });
    } catch (err) {
      next(err);
    }
  });

  // Everything else requires the demo bearer token
  app.use(authGate);

  // Domain routes mount here in later commits

  app.use(errorHandler);
  return app;
}
