import { analyticsQuerySchema } from '@acme/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { BandsService } from '../bands/bands.service.js';
import type { AnalyticsRepository } from './analytics.repository.js';

export function createAnalyticsRouter(
  repo: AnalyticsRepository,
  bands: BandsService,
): Router {
  const router = Router();

  router.get('/headcount', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const buckets = await repo.headcount(query.groupBy, {
        includeTerminated: query.includeTerminated,
        includeContractors: query.includeContractors,
      });
      res.status(200).json({ groupBy: query.groupBy, buckets });
    } catch (err) {
      next(err);
    }
  });

  router.get('/payroll-cost', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const buckets = await repo.payrollCost(query.groupBy, {
        includeTerminated: query.includeTerminated,
        includeContractors: query.includeContractors,
      });
      res.status(200).json({ groupBy: query.groupBy, buckets });
    } catch (err) {
      next(err);
    }
  });

  router.get('/distribution', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const buckets = await repo.distribution(query.groupBy, {
        includeTerminated: query.includeTerminated,
        includeContractors: query.includeContractors,
      });
      res.status(200).json({ groupBy: query.groupBy, buckets });
    } catch (err) {
      next(err);
    }
  });

  router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = analyticsQuerySchema.parse(req.query);
      const scope = {
        includeTerminated: query.includeTerminated,
        includeContractors: query.includeContractors,
      };
      const outliers = await bands.listOutliers({
        page: 1,
        pageSize: 1,
        includeTerminated: query.includeTerminated === true,
        // Honor the same flag as the rest of summary; default (undefined) keeps contractors.
        includeContractors: query.includeContractors,
      });
      const summary = await repo.summary(scope, outliers.total);
      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
