import type { PrismaClient } from '@prisma/client';
import type { BandsService } from '../bands/bands.service.js';
import { AnalyticsRepository } from './analytics.repository.js';
import { createAnalyticsRouter } from './analytics.routes.js';

export function createAnalyticsModule(db: PrismaClient, bands: BandsService) {
  const repository = new AnalyticsRepository(db);
  const router = createAnalyticsRouter(repository, bands);
  return { repository, router };
}

export { AnalyticsRepository } from './analytics.repository.js';
export { createAnalyticsRouter } from './analytics.routes.js';
