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

type HttpError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

function isBodyParserError(err: unknown): err is HttpError {
  if (!(err instanceof Error)) return false;
  const httpErr = err as HttpError;
  const status = httpErr.status ?? httpErr.statusCode;
  // express.json / body-parser: SyntaxError for bad JSON (400), entity.too.large (413)
  if (err instanceof SyntaxError && status === 400) return true;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return (
      httpErr.type === 'entity.parse.failed' ||
      httpErr.type === 'entity.too.large' ||
      httpErr.type === 'request.aborted' ||
      httpErr.type === 'encoding.unsupported' ||
      err instanceof SyntaxError
    );
  }
  return false;
}

/** Catch-all for authenticated unmatched routes — keeps the JSON error envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`No route for ${req.method} ${req.path}`));
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

  if (isBodyParserError(err)) {
    const status = err.status ?? err.statusCode ?? 400;
    const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST';
    const message =
      status === 413 ? 'Request body too large' : 'Malformed JSON request body';
    sendError(res, status, code, message);
    return;
  }

  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
