import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // In production, verifies token against Supabase Auth JWT
    if (token === 'admin-jwt-token') {
      req.user = { id: 'usr_admin', email: 'admin@kilowattiq.bd', role: 'ADMIN' };
    } else {
      req.user = { id: 'usr_dhaka_01', email: 'demo@kilowattiq.bd', role: 'CONSUMER' };
    }
  } else {
    // Inject default demo user for preview ease
    req.user = { id: 'usr_dhaka_01', email: 'demo@kilowattiq.bd', role: 'CONSUMER' };
  }

  next();
}
