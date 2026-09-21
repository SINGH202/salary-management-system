import { createEmployeesRouter } from './employees.routes.js';
import { EmployeesRepository } from './employees.repository.js';
import { EmployeesService } from './employees.service.js';
import type { PrismaClient } from '@prisma/client';

export function createEmployeesModule(db: PrismaClient) {
  const repository = new EmployeesRepository(db);
  const service = new EmployeesService(repository);
  const router = createEmployeesRouter(service);
  return { repository, service, router };
}

export { EmployeesRepository } from './employees.repository.js';
export { EmployeesService } from './employees.service.js';
export { createEmployeesRouter } from './employees.routes.js';
