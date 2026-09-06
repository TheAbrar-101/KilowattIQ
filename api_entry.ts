import app from './backend/app';

export default function handler(req: any, res: any) {
  try {
    const matchedPath = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
    if (matchedPath && typeof matchedPath === 'string' && (req.url === '/api' || req.url === '/api/')) {
      req.url = matchedPath;
    }
    return app(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Invocation Error]:', err);
    return res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: err?.message || 'Serverless function invocation error',
    });
  }
}
