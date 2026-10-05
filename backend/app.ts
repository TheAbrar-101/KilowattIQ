import express from 'express';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/authMiddleware';
import { setupApiRouter } from '../src/server/router';

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

// Canonical /api/v1 router and transparent rewrite layer
setupApiRouter(app);

// Error Handler Middleware
app.use(errorHandler);

export default app;
