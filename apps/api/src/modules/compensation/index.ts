import type { PrismaClient } from '@prisma/client';
import type { Clock } from '../../common/clock.js';
import { SystemClock } from '../../common/clock.js';
import type { FxRateProvider } from '../fx/index.js';
import type { EmployeesService } from '../employees/employees.service.js';
import { createCompensationRouter } from './compensation.routes.js';
import { CompensationService } from './compensation.service.js';

export type CompensationModuleOptions = {
  /** Required — production loads Prisma FX; tests pass createFakeFxRateProvider. */
  fx: FxRateProvider;
  clock?: Clock;
  baseCurrency?: string;
};

export function createCompensationModule(
  db: PrismaClient,
  employees: EmployeesService,
  options: CompensationModuleOptions,
) {
  const clock = options.clock ?? new SystemClock();
  const service = new CompensationService(
    db,
    options.fx,
    clock,
    options.baseCurrency ?? process.env.BASE_CURRENCY ?? 'INR',
  );
  const router = createCompensationRouter(service, employees);
  return { service, router, fx: options.fx, clock };
}

export { CompensationService } from './compensation.service.js';
export {
  insertEmployeeWithHire,
  applySalaryChange,
  applyTerminate,
} from './compensation.writes.js';
