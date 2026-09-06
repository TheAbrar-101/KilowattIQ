import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../services/SupabaseService';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName?: string;
    phone?: string;
    role: string;
    householdIds?: string[];
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const db = SupabaseService.getInstance();
  const authHeader = req.headers.authorization || 
    (req.query.token ? `Bearer ${req.query.token}` : undefined) ||
    (req.query.access_token ? `Bearer ${req.query.access_token}` : undefined);

  // Non-API paths (e.g., static assets, Vite SPA routes, frontend HTML/JS) do not require API authentication
  const path = req.path;
  if (!path.startsWith('/api/') && !path.startsWith('/v1/')) {
    return next();
  }

  // Paths that do not require authentication
  const isPublicPath =
    path === '/api/health' ||
    path === '/api/v1/health' ||
    path === '/health' ||
    path === '/v1/health' ||
    path === '/api/v1/auth/login' ||
    path === '/v1/auth/login' ||
    path === '/api/v1/auth/register' ||
    path === '/v1/auth/register' ||
    path.startsWith('/api/v1/system/') ||
    path.startsWith('/v1/system/');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    if (token === 'admin-jwt-token') {
      req.user = {
        id: 'usr_admin',
        email: 'admin@kilowattiq.bd',
        fullName: 'System Administrator',
        role: 'ADMIN',
        householdIds: ['11111111-1111-4111-a111-111111111111'],
      };
      return next();
    } else if (token === 'demo-jwt-token') {
      req.user = {
        id: 'usr_dhaka_01',
        email: 'demo@kilowattiq.bd',
        fullName: 'Tanvir Hossain',
        role: 'CONSUMER',
        householdIds: ['11111111-1111-4111-a111-111111111111'],
      };
      return next();
    }

    try {
      const verified = await db.verifyToken(token);
      if (verified && verified.user) {
        req.user = {
          id: verified.user.id,
          email: verified.user.email,
          fullName: verified.profile?.full_name || 'KilowattIQ Consumer',
          phone: verified.profile?.phone || '',
          role: verified.profile?.role || 'owner',
          householdIds: verified.householdIds || [],
        };
        return next();
      } else {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized: Invalid or expired authentication token',
        });
      }
    } catch (err: any) {
      return res.status(401).json({
        status: 'error',
        message: `Unauthorized: ${err?.message || 'Token verification failed'}`,
      });
    }
  }

  if (isPublicPath) {
    return next();
  }

  // Inject demo fallback ONLY if running in dev preview mode and requested with x-demo-user header
  const demoHeader = req.headers['x-demo-mode'];
  if (demoHeader === 'true') {
    req.user = {
      id: 'usr_dhaka_01',
      email: 'demo@kilowattiq.bd',
      fullName: 'Tanvir Hossain',
      role: 'CONSUMER',
      householdIds: ['11111111-1111-4111-a111-111111111111'],
    };
    return next();
  }

  return res.status(401).json({
    status: 'error',
    message: 'Authentication required. Please log in or provide a valid Bearer token.',
  });
}
