import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { FxRateNotFoundError } from '../modules/fx/fx.types.js';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(message = 'Resource not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function unauthorized(message = 'Unauthorized'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(409, 'CONFLICT', message, details);
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof FxRateNotFoundError) {
    sendError(res, 400, err.code, err.message, { currency: err.currency });
    return;
  }

  if (err instanceof ZodError) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', err.flatten());
    return;
  }

  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
