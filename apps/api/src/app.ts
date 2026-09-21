import cors from 'cors';
import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Clock } from './common/clock.js';
import { authGate } from './common/auth-gate.js';
import { errorHandler, notFoundHandler } from './common/error-handler.js';
import { ensureDbReady, prisma as defaultPrisma } from './db/client.js';
import { createBandsModule } from './modules/bands/index.js';
import { createCompensationModule } from './modules/compensation/index.js';
import { createEmployeesModule } from './modules/employees/index.js';
import { createPrismaFxRateProvider, type FxRateProvider } from './modules/fx/index.js';

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
  fx?: FxRateProvider;
  clock?: Clock;
  baseCurrency?: string;
  /** Optional routes registered after domain routers and before the 404 handler (tests). */
  registerRoutes?: (app: Express) => void;
};

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const db = options.prisma ?? defaultPrisma;
  const baseCurrency = options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR';
  const fx = options.fx ?? (await createPrismaFxRateProvider(db, baseCurrency));
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
  const compensation = createCompensationModule(db, employees.service, {
    fx,
    clock: options.clock,
    baseCurrency,
  });
  const bands = createBandsModule(db, { fx, baseCurrency });

  app.use('/api/bands', bands.router);
  // Compensation + compa-ratio before employees /:id so nested paths win
  app.use('/api/employees', compensation.router);
  app.use('/api/employees', bands.compaRatioRouter);
  app.use('/api/employees', employees.router);

  options.registerRoutes?.(app);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
