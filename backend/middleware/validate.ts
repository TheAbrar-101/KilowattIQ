import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          status: 'error',
          statusCode: 400,
          message: 'Validation failed',
          errors: err.issues,
        });
      } else {
        next(err);
      }
    }
  };
}
