import type { PrismaClient } from '@prisma/client';
import type { FxRateProvider } from '../fx/index.js';
import { createExportRouter, createImportRouter } from './transfer.routes.js';
import { TransferService } from './transfer.service.js';

export type TransferModuleOptions = {
  fx: FxRateProvider;
  baseCurrency?: string;
};

export function createTransferModule(db: PrismaClient, options: TransferModuleOptions) {
  const service = new TransferService(
    db,
    options.fx,
    options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR',
  );
  const importRouter = createImportRouter(service);
  const exportRouter = createExportRouter(service);
  return { service, importRouter, exportRouter };
}

export { TransferService } from './transfer.service.js';
export { createImportRouter, createExportRouter } from './transfer.routes.js';
