import {
  bandListQuerySchema,
  bandUpsertSchema,
  outliersQuerySchema,
} from '@acme/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { BandsService } from './bands.service.js';

export function createBandsRouter(service: BandsService): Router {
  const router = Router();

  router.get('/outliers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = outliersQuerySchema.parse(req.query);
      const result = await service.listOutliers({
        page: query.page,
        pageSize: query.pageSize,
        includeTerminated: query.includeTerminated,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = bandListQuerySchema.parse(req.query);
      const result = await service.list({
        page: query.page,
        pageSize: query.pageSize,
        jobFamily: query.jobFamily,
        level: query.level,
        countryCode: query.countryCode,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.put('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = bandUpsertSchema.parse(req.body);
      const band = await service.upsert(body);
      res.status(200).json(band);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Mounted under /api/employees — GET /:id/compa-ratio */
export function createCompaRatioRouter(service: BandsService): Router {
  const router = Router();

  router.get('/:id/compa-ratio', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.getCompaRatio(String(req.params.id));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
