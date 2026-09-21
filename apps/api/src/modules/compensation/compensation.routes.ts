import {
  employeeCreateSchema,
  salaryChangeCreateSchema,
  terminateEmployeeSchema,
} from '@acme/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { EmployeesService } from '../employees/employees.service.js';
import type { CompensationService } from './compensation.service.js';

export function createCompensationRouter(
  service: CompensationService,
  employees: EmployeesService,
): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = employeeCreateSchema.parse(req.body);
      const result = await service.createEmployee(body);
      const employee = await employees.getById(result.employeeId);
      res.status(201).json(employee);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const history = await service.listHistory(String(req.params.id));
      res.status(200).json({ data: history });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/salary-changes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = salaryChangeCreateSchema.parse(req.body);
      const record = await service.recordSalaryChange(String(req.params.id), body);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/terminate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = terminateEmployeeSchema.parse(req.body);
      await service.terminateEmployee(String(req.params.id), body);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
