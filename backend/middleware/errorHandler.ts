import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  console.error('[API Error]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    details: err.details || null,
    timestamp: new Date().toISOString(),
  });
}
