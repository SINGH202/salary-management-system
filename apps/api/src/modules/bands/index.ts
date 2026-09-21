import type { PrismaClient } from '@prisma/client';
import type { FxRateProvider } from '../fx/index.js';
import { createBandsRouter, createCompaRatioRouter } from './bands.routes.js';
import { BandsService } from './bands.service.js';

export type BandsModuleOptions = {
  fx: FxRateProvider;
  baseCurrency?: string;
};

export function createBandsModule(db: PrismaClient, options: BandsModuleOptions) {
  const service = new BandsService(
    db,
    options.fx,
    options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR',
  );
  const router = createBandsRouter(service);
  const compaRatioRouter = createCompaRatioRouter(service);
  return { service, router, compaRatioRouter };
}

export { BandsService } from './bands.service.js';
export { createBandsRouter, createCompaRatioRouter } from './bands.routes.js';
