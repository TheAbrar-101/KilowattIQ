/**
 * KilowattIQ Canonical API Router & Transparent Rewrite Layer
 * 
 * Purpose:
 * 1. Standardizes all routes under the canonical `/api/v1/*` prefix.
 * 2. Provides a transparent rewrite layer: any request to `/api/*` (without v1)
 *    internally maps to `/api/v1/*` with the `X-API-Deprecated: true` header.
 * 3. Keeps `/auth/login`, `/auth/register`, `/health`, and root pings completely public,
 *    applying `authMiddleware` ONLY to protected routes.
 * 4. Ensures `/api` endpoints always return JSON and never fall through to the Vite HTML SPA.
 */

import express, { Request, Response, NextFunction, Router } from 'express';
import { SupabaseService } from '../../backend/services/SupabaseService';
import { authMiddleware } from '../../backend/middleware/authMiddleware';

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
import alertRoutes from '../../backend/routes/v1/alerts';
import billRoutes from '../../backend/routes/v1/bills';
import nilmRoutes from '../../backend/routes/v1/nilm';
import schedulerRoutes from '../../backend/routes/v1/scheduler';
import healthRoutes from '../../backend/routes/v1/health';
import anomalyRoutes from '../../backend/routes/v1/anomalies';
import weatherRoutes from '../../backend/routes/v1/weather';

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
 * - Detects requests to `/api/*` (excluding `/api/v1/*`)
 * - Silently rewrites req.url internally to `/api/v1/*`
 * - Injects `X-API-Deprecated: true` response header
 * - Preserves existing client contracts
 */
export function legacyApiRewriteMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalUrl = req.url;

  // Root endpoint: /api or /api/
  if (originalUrl === '/api' || originalUrl === '/api/') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = '/api/v1';
    return next();
  }

  // Paths starting with /api/ but not /api/v1/
  // e.g. /api/auth/login -> /api/v1/auth/login
  if (originalUrl.startsWith('/api/') && !originalUrl.startsWith('/api/v1/') && originalUrl !== '/api/v1') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = originalUrl.replace(/^\/api\//, '/api/v1/');
    return next();
  }

  // Paths starting with /v1/ e.g. /v1/health -> /api/v1/health
  if (originalUrl.startsWith('/v1/') || originalUrl === '/v1') {
    res.setHeader('X-API-Deprecated', 'true');
    req.url = originalUrl.replace(/^\/v1/, '/api/v1');
    return next();
  }

  next();
}

/**
 * Creates and registers the canonical v1 router
 * Distinguishes public routes from protected routes
 */
export function createV1Router(): Router {
  const v1 = Router();

  // Canonical v1 Service Ping (Public)
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

  // Health check endpoint (Public)
  v1.get('/health', handleHealthCheck);

  // Authentication routes: /login, /register, and /refresh are completely public.
  // /me and /session have authMiddleware applied individually inside authRoutes.
  v1.use('/auth', authRoutes);

  // System & public utility definitions (Public)
  v1.use('/system', systemRoutes);

  // Protected Domain Routes (Require Bearer token authMiddleware)
  v1.use('/profile', authMiddleware, profileRoutes);
  v1.use('/households', authMiddleware, householdRoutes);
  v1.use('/my-households', authMiddleware, householdRoutes);
  v1.use('/devices', authMiddleware, deviceRoutes);
  v1.use('/telemetry', authMiddleware, telemetryRoutes);
  v1.use('/analytics', authMiddleware, analyticsRoutes);
  v1.use('/recommendations', authMiddleware, recommendationRoutes);
  v1.use('/reports', authMiddleware, reportRoutes);
  v1.use('/admin', authMiddleware, adminRoutes);
  v1.use('/tariffs', authMiddleware, tariffRoutes);
  v1.use('/budgets', authMiddleware, budgetRoutes);
  v1.use('/alerts', authMiddleware, alertRoutes);
  v1.use('/bills', authMiddleware, billRoutes);
  v1.use('/nilm', authMiddleware, nilmRoutes);
  v1.use('/scheduler', authMiddleware, schedulerRoutes);
  v1.use('/health', authMiddleware, healthRoutes);
  v1.use('/anomalies', authMiddleware, anomalyRoutes);
  v1.use('/weather', authMiddleware, weatherRoutes);

  return v1;
}

/**
 * Configures the Express application with rewrite middleware,
 * canonical v1 router, and API-scoped 404 handler to prevent falling through to Vite
 */
export function setupApiRouter(app: express.Application): void {
  // 1. Silent rewrite middleware for backwards compatibility
  app.use(legacyApiRewriteMiddleware);

  // 2. Direct handler for /api and /api/ to guarantee JSON output and X-API-Deprecated header
  app.get(['/api', '/api/'], (req: Request, res: Response) => {
    res.setHeader('X-API-Deprecated', 'true');
    res.json({
      status: 'success',
      service: 'KilowattIQ Backend API',
      version: '1.0.0',
      apiVersion: 'v1',
      canonical: false,
      canonicalEndpoint: '/api/v1',
      timestamp: new Date().toISOString(),
    });
  });

  // 3. Mount Canonical /api/v1 Router
  const v1Router = createV1Router();
  app.use('/api/v1', v1Router);

  // 4. Secondary alias for /v1
  app.use('/v1', v1Router);

  // 5. Universal API 404 handler: Any /api or /v1 request that wasn't matched above
  // immediately terminates with JSON, NEVER allowing fall-through to the Vite HTML SPA
  app.all(['/api', '/api/*', '/v1', '/v1/*'], (req: Request, res: Response) => {
    res.status(404).json({
      status: 'error',
      statusCode: 404,
      message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  });
}

export default setupApiRouter;
