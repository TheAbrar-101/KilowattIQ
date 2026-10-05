/**
 * KilowattIQ Canonical API Router & Transparent Rewrite Layer
 * 
 * Purpose:
 * Standardizes all application routes under the canonical `/api/v1/*` prefix, while providing
 * an intelligent, non-breaking rewrite layer that silently rewrites legacy `/api/*` requests
 * to `/api/v1/*` and emits an `X-API-Deprecated: true` header.
 */

import express, { Request, Response, NextFunction, Router } from 'express';
import { SupabaseService } from '../../backend/services/SupabaseService';

import authRoutes from '../../backend/routes/v1/auth';
import profileRoutes from '../../backend/routes/v1/profile';
import householdRoutes from '../../backend/routes/v1/households';
import deviceRoutes from '../../backend/routes/v1/devices';
import telemetryRoutes from '../../backend/routes/v1/telemetry';
import analyticsRoutes from '../../backend/routes/v1/analytics';
import recommendationRoutes from '../../backend/routes/v1/recommendations';
import reportRoutes from '../../backend/routes/v1/reports';
import adminRoutes from '../../backend/routes/v1/admin';
import systemRoutes from '../../backend/routes/v1/system';
import tariffRoutes from '../../backend/routes/v1/tariffs';
import budgetRoutes from '../../backend/routes/v1/budgets';

export interface ApiRouterOptions {
  enableDeprecationHeader?: boolean;
}

/**
 * Health check handler verifying live Supabase connection status
 */
export const handleHealthCheck = async (req: Request, res: Response) => {
  const db = SupabaseService.getInstance();
  const testResult = await db.testDatabaseConnection();

  if (testResult.success) {
    return res.status(200).json({
      success: true,
      data: {
        service: 'KilowattIQ API',
        version: '1.0.0',
        apiVersion: 'v1',
        database: 'Supabase PostgreSQL',
        databaseStatus: 'connected',
        timestamp: new Date().toISOString(),
      },
    });
  } else {
    return res.status(503).json({
      success: false,
      data: {
        service: 'KilowattIQ API',
        version: '1.0.0',
        apiVersion: 'v1',
        database: 'Supabase PostgreSQL',
        databaseStatus: 'disconnected',
        error: testResult.error,
        timestamp: new Date().toISOString(),
      },
    });
  }
};

/**
 * Rewrite Middleware Layer:
 * - Detects requests to `/api/*` that do not target `/api/v1/*`
 * - Silently rewrites `req.url` to point to `/api/v1/*`
 * - Injects `X-API-Deprecated: true` HTTP response header
 * - Preserves complete backwards compatibility for legacy clients
 */
export function legacyApiRewriteMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalUrl = req.url;

  // Exact root match: /api or /api/
  if (originalUrl === '/api' || originalUrl === '/api/') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = '/api/v1';
    return next();
  }

  // Paths starting with /api/ but not /api/v1
  // e.g. /api/telemetry/live -> /api/v1/telemetry/live
  if (originalUrl.startsWith('/api/') && !originalUrl.startsWith('/api/v1/') && originalUrl !== '/api/v1') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = originalUrl.replace(/^\/api\//, '/api/v1/');
    return next();
  }

  // Paths starting with /v1/ e.g. /v1/telemetry -> /api/v1/telemetry
  if (originalUrl.startsWith('/v1/') || originalUrl === '/v1') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = originalUrl.replace(/^\/v1/, '/api/v1');
    return next();
  }

  next();
}

/**
 * Creates and registers the canonical v1 router and all sub-domain endpoints
 */
export function createV1Router(): Router {
  const v1 = Router();

  // Canonical v1 Service Ping
  v1.get('/', (req: Request, res: Response) => {
    res.json({
      status: 'success',
      service: 'KilowattIQ Backend API',
      version: '1.0.0',
      apiVersion: 'v1',
      canonical: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Health check endpoint
  v1.get('/health', handleHealthCheck);

  // Mount domain sub-routes under v1
  v1.use('/auth', authRoutes);
  v1.use('/profile', profileRoutes);
  v1.use('/households', householdRoutes);
  v1.use('/my-households', householdRoutes);
  v1.use('/devices', deviceRoutes);
  v1.use('/telemetry', telemetryRoutes);
  v1.use('/analytics', analyticsRoutes);
  v1.use('/recommendations', recommendationRoutes);
  v1.use('/reports', reportRoutes);
  v1.use('/admin', adminRoutes);
  v1.use('/system', systemRoutes);
  v1.use('/tariffs', tariffRoutes);
  v1.use('/budgets', budgetRoutes);

  return v1;
}

/**
 * Configures an Express application with the canonical v1 router and silent rewrite layer
 */
export function setupApiRouter(app: express.Application): void {
  // 1. Silent rewrite middleware for backwards compatibility
  app.use(legacyApiRewriteMiddleware);

  // 2. Canonical /api/v1 router
  const v1Router = createV1Router();
  app.use('/api/v1', v1Router);

  // 3. Fallback compatibility bindings ensuring direct routing if rewrite was bypassed
  app.use('/v1', v1Router);

  // 4. Universal 404 handler for API paths
  app.use(['/api', '/api/v1', '/v1'], (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      statusCode: 404,
      message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  });
}

export default setupApiRouter;
