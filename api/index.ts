import app from '../backend/app';

export default function handler(req: any, res: any) {
  // If Vercel rewrote /api/... to /api, restore the original incoming path from headers
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
  if (matchedPath && typeof matchedPath === 'string' && (req.url === '/api' || req.url === '/api/')) {
    req.url = matchedPath;
  }
  return app(req, res);
}
