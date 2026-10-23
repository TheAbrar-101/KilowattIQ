import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { RedisCacheService } from '../../../src/server/cache/redis';

const router = Router();
const db = SupabaseService.getInstance();
const redis = RedisCacheService.getInstance();

// GET /api/v1/tariffs?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const tariffType = (req.query.tariffType as string) || 'SLAB';

  // Check Redis cache first
  const cached = await redis.getTariffSlabs(tariffType);
  if (cached && !req.query.no_cache) {
    return res.json({ status: 'success', source: 'REDIS_CACHE', data: cached });
  }

  const tariffData = await db.getTariffs(householdId);

  // Cache tariff slabs in Redis (24-hour TTL)
  await redis.setTariffSlabs(tariffType, tariffData);

  res.json({ status: 'success', source: 'DATABASE', data: tariffData });
});

// POST /api/v1/tariffs/update (or tariff change event)
router.post('/update', async (req: AuthenticatedRequest, res: Response) => {
  const { tariffType = 'SLAB' } = req.body || {};

  // Invalidate Redis tariff cache on tariff rate/slab changes
  await redis.invalidateTariffCache();

  res.json({
    status: 'success',
    message: `Tariff configuration updated and Redis cache invalidated for ${tariffType}`,
  });
});

export default router;
