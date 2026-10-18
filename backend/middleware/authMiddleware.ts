import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../services/SupabaseService';
import { UserRole, normalizeRole } from '../../src/server/auth/roles';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName?: string;
    phone?: string;
    role: string;
    householdRole?: UserRole;
    householdIds?: string[];
    auditorExpiresAt?: string | null;
  };
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const db = SupabaseService.getInstance();
    const authHeader = req.headers.authorization || 
      (req.query.token ? `Bearer ${req.query.token}` : undefined) ||
      (req.query.access_token ? `Bearer ${req.query.access_token}` : undefined);

    const roleOverrideHeader = (req.headers['x-role-override'] as string) || (req.query.role_override as string);

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();

      if (token === 'admin-jwt-token') {
        req.user = {
          id: 'usr_admin',
          email: 'admin@kilowattiq.bd',
          fullName: 'System Administrator',
          role: 'ADMIN',
          householdRole: 'admin',
          householdIds: ['11111111-1111-4111-a111-111111111111'],
        };
      } else if (token === 'auditor-jwt-token') {
        req.user = {
          id: 'usr_auditor_01',
          email: 'auditor@desco.org.bd',
          fullName: 'DESCO Meter Inspector #402',
          role: 'utility_auditor',
          householdRole: 'utility_auditor',
          householdIds: ['11111111-1111-4111-a111-111111111111'],
          auditorExpiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        };
      } else if (token === 'family-jwt-token') {
        req.user = {
          id: 'usr_family_02',
          email: 'nusrat@gulshan.bd',
          fullName: 'Nusrat Hossain',
          role: 'family_member',
          householdRole: 'family_member',
          householdIds: ['11111111-1111-4111-a111-111111111111'],
        };
      } else if (token === 'demo-jwt-token' || token === 'owner-jwt-token') {
        req.user = {
          id: 'usr_dhaka_01',
          email: 'demo@kilowattiq.bd',
          fullName: 'Tanvir Hossain',
          role: 'owner',
          householdRole: 'owner',
          householdIds: ['11111111-1111-4111-a111-111111111111'],
        };
      }

      if (req.user) {
        if (roleOverrideHeader) {
          const overridden = normalizeRole(roleOverrideHeader);
          req.user.role = overridden;
          req.user.householdRole = overridden;
          if (overridden === 'utility_auditor' && !req.user.auditorExpiresAt) {
            req.user.auditorExpiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
          }
        }
        return next();
      }

      try {
        const verified = await db.verifyToken(token);
        if (verified && verified.user) {
          const userRole = normalizeRole(verified.profile?.role || 'owner');
          req.user = {
            id: verified.user.id,
            email: verified.user.email,
            fullName: verified.profile?.full_name || 'KilowattIQ Consumer',
            phone: verified.profile?.phone || '',
            role: userRole,
            householdRole: userRole,
            householdIds: verified.householdIds || [],
          };
          if (roleOverrideHeader) {
            const overridden = normalizeRole(roleOverrideHeader);
            req.user.role = overridden;
            req.user.householdRole = overridden;
            if (overridden === 'utility_auditor' && !req.user.auditorExpiresAt) {
              req.user.auditorExpiresAt = new Date(Date.now() + 48 * 3600000).toISOString();
            }
          }
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

    // Demo header fallback
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
