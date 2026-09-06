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

// Health check endpoints
app.get('/api/health', handleHealthCheck);
app.get('/api/v1/health', handleHealthCheck);
app.get('/health', handleHealthCheck);
app.get('/v1/health', handleHealthCheck);

// RESTful API v1 Routes (Both with /api and direct /v1 prefixes)
app.use('/api/v1/auth', authRoutes);
app.use('/v1/auth', authRoutes);

app.use('/api/v1/profile', profileRoutes);
app.use('/v1/profile', profileRoutes);

app.use('/api/v1/my-households', householdRoutes);
app.use('/v1/my-households', householdRoutes);

app.use('/api/v1/households', householdRoutes);
app.use('/v1/households', householdRoutes);

app.use('/api/v1/devices', deviceRoutes);
app.use('/v1/devices', deviceRoutes);

app.use('/api/v1/telemetry', telemetryRoutes);
app.use('/v1/telemetry', telemetryRoutes);

app.use('/api/v1/analytics', analyticsRoutes);
app.use('/v1/analytics', analyticsRoutes);

app.use('/api/v1/recommendations', recommendationRoutes);
app.use('/v1/recommendations', recommendationRoutes);

app.use('/api/v1/reports', reportRoutes);
app.use('/v1/reports', reportRoutes);

app.use('/api/v1/admin', adminRoutes);
app.use('/v1/admin', adminRoutes);

app.use('/api/v1/system', systemRoutes);
app.use('/v1/system', systemRoutes);

app.use('/api/v1/tariffs', tariffRoutes);
app.use('/v1/tariffs', tariffRoutes);

app.use('/api/v1/budgets', budgetRoutes);
app.use('/v1/budgets', budgetRoutes);

// Catch-all 404 handler for unmatched API calls (ensures API returns JSON instead of HTML)
app.use(['/api/*', '/v1/*'], (req: express.Request, res: express.Response) => {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Error Handler Middleware
app.use(errorHandler);

export default app;
