import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[KilowattIQ API] ${method} ${originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
}
