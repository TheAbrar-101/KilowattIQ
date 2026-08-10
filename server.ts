import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { requestLogger } from './backend/middleware/logger';
import { errorHandler } from './backend/middleware/errorHandler';
import { authMiddleware } from './backend/middleware/authMiddleware';

import authRoutes from './backend/routes/v1/auth';
import householdRoutes from './backend/routes/v1/households';
import deviceRoutes from './backend/routes/v1/devices';
import telemetryRoutes from './backend/routes/v1/telemetry';
import analyticsRoutes from './backend/routes/v1/analytics';
import recommendationRoutes from './backend/routes/v1/recommendations';
import reportRoutes from './backend/routes/v1/reports';
import adminRoutes from './backend/routes/v1/admin';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Global Middlewares
  app.use(express.json());
  app.use(requestLogger);
  app.use(authMiddleware);

  // Health check endpoint
  app.get('/api/v1/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'KilowattIQ Backend API',
      version: '1.0.0-v1',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  });

  // RESTful API v1 Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/households', householdRoutes);
  app.use('/api/v1/devices', deviceRoutes);
  app.use('/api/v1/telemetry', telemetryRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/recommendations', recommendationRoutes);
  app.use('/api/v1/reports', reportRoutes);
  app.use('/api/v1/admin', adminRoutes);

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
    console.log(`[KilowattIQ] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[KilowattIQ] Failed to start server:', err);
  process.exit(1);
});
