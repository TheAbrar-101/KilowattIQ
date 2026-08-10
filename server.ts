import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { requestLogger } from './backend/middleware/logger';
import { errorHandler } from './backend/middleware/errorHandler';
import { authMiddleware } from './backend/middleware/authMiddleware';
import { SupabaseService } from './backend/services/SupabaseService';
import { MqttTelemetryService } from './backend/services/MqttTelemetryService';

import authRoutes from './backend/routes/v1/auth';
import profileRoutes from './backend/routes/v1/profile';
import householdRoutes from './backend/routes/v1/households';
import deviceRoutes from './backend/routes/v1/devices';
import telemetryRoutes from './backend/routes/v1/telemetry';
import analyticsRoutes from './backend/routes/v1/analytics';
import recommendationRoutes from './backend/routes/v1/recommendations';
import reportRoutes from './backend/routes/v1/reports';
import adminRoutes from './backend/routes/v1/admin';
import systemRoutes from './backend/routes/v1/system';
import tariffRoutes from './backend/routes/v1/tariffs';
import budgetRoutes from './backend/routes/v1/budgets';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Global Middlewares
  app.use(express.json());
  app.use(requestLogger);
  app.use(authMiddleware);

  // Initialize MQTT Telemetry Adapter Service
  MqttTelemetryService.getInstance().init();

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

  // RESTful API v1 Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/profile', profileRoutes);
  app.use('/api/v1/my-households', householdRoutes);
  app.use('/api/v1/households', householdRoutes);
  app.use('/api/v1/devices', deviceRoutes);
  app.use('/api/v1/telemetry', telemetryRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/recommendations', recommendationRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/system', systemRoutes);
  app.use('/api/v1/tariffs', tariffRoutes);
  app.use('/api/v1/budgets', budgetRoutes);

  // Error Handler Middleware
  app.use(errorHandler);

  // Vite Middleware for Frontend Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const urlConfigured = Boolean(
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_URL.length > 5 &&
      !process.env.SUPABASE_URL.includes('your-supabase-project')
    );
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const secretConfigured = Boolean(
      key &&
      key.length > 10 &&
      !key.includes('your-service-role-key') &&
      !key.includes('your-anon-key')
    );

    console.log('[KilowattIQ] KilowattIQ API started');
    console.log(`[KilowattIQ] Supabase URL configured: ${urlConfigured ? 'YES' : 'NO'}`);
    console.log(`[KilowattIQ] Supabase secret configured: ${secretConfigured ? 'YES' : 'NO'}`);
    console.log(`[KilowattIQ] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[KilowattIQ] Failed to start server:', err);
  process.exit(1);
});
