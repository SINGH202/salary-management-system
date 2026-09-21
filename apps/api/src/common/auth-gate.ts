import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from './error-handler.js';

/**
 * Shared demo token gate — not a user auth system.
 * Mount AFTER /api/health and /api/ready.
 */
export function authGate(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.DEMO_ACCESS_TOKEN;
  if (!expected) {
    next(unauthorized('DEMO_ACCESS_TOKEN is not configured'));
    return;
  }

  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing or invalid Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (token !== expected) {
    next(unauthorized('Invalid access token'));
    return;
  }

  next();
}
