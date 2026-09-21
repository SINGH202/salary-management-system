import type { PrismaClient } from '@prisma/client';
import type { Clock } from '../../common/clock.js';
import { SystemClock } from '../../common/clock.js';
import type { FxRateProvider } from '../fx/index.js';
import { createFakeFxRateProvider } from '../fx/index.js';
import type { EmployeesService } from '../employees/employees.service.js';
import { createCompensationRouter } from './compensation.routes.js';
import { CompensationService } from './compensation.service.js';

export type CompensationModuleOptions = {
  fx?: FxRateProvider;
  clock?: Clock;
  baseCurrency?: string;
};

export function createCompensationModule(
  db: PrismaClient,
  employees: EmployeesService,
  options: CompensationModuleOptions = {},
) {
  const fx =
    options.fx ??
    createFakeFxRateProvider(
      { INR: 1, USD: 83, GBP: 105, EUR: 90, SGD: 62, BRL: 15 },
      options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR',
    );
  const clock = options.clock ?? new SystemClock();
  const service = new CompensationService(
    db,
    fx,
    clock,
    options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR',
  );
  const router = createCompensationRouter(service, employees);
  return { service, router, fx, clock };
}

export { CompensationService } from './compensation.service.js';
export {
  insertEmployeeWithHire,
  applySalaryChange,
  applyTerminate,
} from './compensation.writes.js';
