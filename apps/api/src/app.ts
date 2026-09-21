import cors from 'cors';
import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authGate } from './common/auth-gate.js';
import { errorHandler, notFoundHandler } from './common/error-handler.js';
import { ensureDbReady, prisma as defaultPrisma } from './db/client.js';
import { createEmployeesModule } from './modules/employees/index.js';

/**
 * Installs BigInt → string for res.json without mutating BigInt.prototype.
 * Express 4 uses JSON.stringify(value, this.get('json replacer')).
 */
function installBigIntJsonReplacer(app: Express): void {
  app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

export type CreateAppOptions = {
  prisma?: PrismaClient;
  /** Optional routes registered after domain routers and before the 404 handler (tests). */
  registerRoutes?: (app: Express) => void;
};

export function createApp(options: CreateAppOptions = {}): Express {
  const db = options.prisma ?? defaultPrisma;
  const app = express();
  installBigIntJsonReplacer(app);

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/ready', async (_req, res, next) => {
    try {
      await ensureDbReady(db);
      await db.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready' });
    } catch (err) {
      next(err);
    }
  });

  app.use(authGate);

  const employees = createEmployeesModule(db);
  app.use('/api/employees', employees.router);

  options.registerRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
