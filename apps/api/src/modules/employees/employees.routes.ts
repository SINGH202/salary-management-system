import {
  employeeListQuerySchema,
  employeeUpdateSchema,
} from '@acme/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { EmployeesService } from './employees.service.js';

export function createEmployeesRouter(service: EmployeesService): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = employeeListQuerySchema.parse(req.query);
      const result = await service.list({
        page: query.page,
        pageSize: query.pageSize,
        country: query.country,
        department: query.department,
        level: query.level,
        status: query.status,
        search: query.search,
        sort: query.sort,
        sortDir: query.sortDir,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const employee = await service.getById(id);
      res.status(200).json(employee);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const body = employeeUpdateSchema.parse(req.body);
      const employee = await service.update(id, body);
      res.status(200).json(employee);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
