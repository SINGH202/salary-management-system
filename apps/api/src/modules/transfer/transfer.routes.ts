import { employeeListQuerySchema } from '@acme/contracts';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { badRequest } from '../../common/error-handler.js';
import type { TransferService } from './transfer.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype ?? '').toLowerCase();
    const name = (file.originalname ?? '').toLowerCase();
    const okMime =
      mime === 'text/csv' ||
      mime === 'application/csv' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/octet-stream';
    const okName = name.endsWith('.csv');
    if (okMime || okName) {
      cb(null, true);
      return;
    }
    cb(badRequest('Only text/csv uploads are accepted'));
  },
});

const exportQuerySchema = employeeListQuerySchema.pick({
  country: true,
  department: true,
  level: true,
  status: true,
  search: true,
});

export function createImportRouter(service: TransferService): Router {
  const router = Router();

  router.post(
    '/employees',
    (req: Request, res: Response, next: NextFunction) => {
      upload.single('file')(req, res, (err: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await service.importEmployees(req.file);
        const status = result.errors.length > 0 ? 400 : 200;
        res.status(status).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export function createExportRouter(service: TransferService): Router {
  const router = Router();

  router.get('/employees', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = exportQuerySchema.parse(req.query);
      await service.exportEmployees(
        {
          country: query.country,
          department: query.department,
          level: query.level,
          status: query.status,
          search: query.search,
        },
        res,
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
