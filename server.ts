import 'dotenv/config';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';

import app from './backend/app';
import { MqttTelemetryService } from './backend/services/MqttTelemetryService';

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize MQTT Telemetry Adapter Service
  MqttTelemetryService.getInstance().init();

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
