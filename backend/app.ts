import express from 'express';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { SupabaseService } from './services/SupabaseService';

import authRoutes from './routes/v1/auth';
import profileRoutes from './routes/v1/profile';
import householdRoutes from './routes/v1/households';
import deviceRoutes from './routes/v1/devices';
import telemetryRoutes from './routes/v1/telemetry';
import analyticsRoutes from './routes/v1/analytics';
import recommendationRoutes from './routes/v1/recommendations';
import reportRoutes from './routes/v1/reports';
import adminRoutes from './routes/v1/admin';
import systemRoutes from './routes/v1/system';
import tariffRoutes from './routes/v1/tariffs';
import budgetRoutes from './routes/v1/budgets';

const app = express();

// URL normalizer middleware for Vercel Serverless and reverse proxy rewrites
app.use((req, res, next) => {
  const matchedPath = (req.headers['x-matched-path'] as string) || (req.headers['x-vercel-matched-path'] as string);
  if (matchedPath && (req.url === '/api' || req.url === '/api/') && matchedPath !== req.url) {
    req.url = matchedPath;
  }
  next();
});

// Global Middlewares
app.use(express.json());
app.use(requestLogger);
app.use(authMiddleware);

// Health check handler function with real Supabase query test
const handleHealthCheck = async (req: express.Request, res: express.Response) => {
  const db = SupabaseService.getInstance();
  const testResult = await db.testDatabaseConnection();

  if (testResult.success) {
    return res.status(200).json({
      success: true,
      data: {
        service: 'KilowattIQ API',
        database: 'Supabase PostgreSQL',
        databaseStatus: 'connected',
      },
    });
  } else {
    return res.status(503).json({
      success: false,
      data: {
        service: 'KilowattIQ API',
        database: 'Supabase PostgreSQL',
        databaseStatus: 'disconnected',
        error: testResult.error,
      },
    });
  }
};

// Health check and root ping endpoints
app.get(['/', '/api'], (req, res) => {
  res.json({
    status: 'success',
    service: 'KilowattIQ Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', handleHealthCheck);
app.get('/api/v1/health', handleHealthCheck);
app.get('/health', handleHealthCheck);
app.get('/v1/health', handleHealthCheck);

// RESTful API Routes (Mounted under /api/v1, /v1, /api, and direct root paths)
const routes = [
  { path: 'auth', router: authRoutes },
  { path: 'profile', router: profileRoutes },
  { path: 'my-households', router: householdRoutes },
  { path: 'households', router: householdRoutes },
  { path: 'devices', router: deviceRoutes },
  { path: 'telemetry', router: telemetryRoutes },
  { path: 'analytics', router: analyticsRoutes },
  { path: 'recommendations', router: recommendationRoutes },
  { path: 'reports', router: reportRoutes },
  { path: 'admin', router: adminRoutes },
  { path: 'system', router: systemRoutes },
  { path: 'tariffs', router: tariffRoutes },
  { path: 'budgets', router: budgetRoutes },
];

for (const { path, router } of routes) {
  app.use(`/api/v1/${path}`, router);
  app.use(`/v1/${path}`, router);
  app.use(`/api/${path}`, router);
  app.use(`/${path}`, router);
}

// Universal catch-all 404 handler for any unmatched endpoint (always returns JSON, never HTML)
app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`,
  });
});

// Error Handler Middleware
app.use(errorHandler);

export default app;
