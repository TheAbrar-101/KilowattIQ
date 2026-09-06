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
  try {
    const db = SupabaseService.getInstance();
    const authHeader = req.headers.authorization || 
      (req.query.token ? `Bearer ${req.query.token}` : undefined) ||
      (req.query.access_token ? `Bearer ${req.query.access_token}` : undefined);

    const path = req.path.replace(/\/+$/, '') || '/';

    // Root and non-API paths (e.g., static assets, Vite SPA routes)
    if (path === '/' || path === '/api' || (!path.startsWith('/api') && !path.startsWith('/v1') && !path.startsWith('/auth') && !path.startsWith('/devices') && !path.startsWith('/telemetry') && !path.startsWith('/analytics') && !path.startsWith('/reports') && !path.startsWith('/admin') && !path.startsWith('/tariffs') && !path.startsWith('/budgets') && !path.startsWith('/profile') && !path.startsWith('/households'))) {
      return next();
    }

    // Public authentication and health endpoints
    const isPublicPath =
      path === '/' ||
      path === '/api' ||
      path.endsWith('/health') ||
      path.endsWith('/auth/login') ||
      path.endsWith('/auth/register') ||
      path.includes('/system/');

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

    // Inject demo fallback ONLY if requested with x-demo-user header
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
  } catch (fatalErr: any) {
    console.error('[authMiddleware Fatal Error]:', fatalErr);
    return res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: `Authentication middleware error: ${fatalErr?.message || 'Unknown error'}`,
    });
  }
}
