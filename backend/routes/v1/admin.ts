import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/admin/overview
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: Admin access required.' });
  }

  const households = await db.getHouseholds(req.user.id);
  const devices = await db.getDevices('11111111-1111-4111-a111-111111111111');

  res.json({
    status: 'success',
    data: {
      systemHealth: 'OPERATIONAL',
      activeAdapters: ['MockAdapter', 'TuyaAdapter', 'MQTTAdapter', 'DESCOAdapter', 'CompositeAdapter'],
      totalMonitoredHouseholds: households.length,
      totalConnectedIoTDevices: devices.length,
      nationalGridFrequencyHz: 50.0,
      supabaseStatus: db.isUsingMock() ? 'MOCK_FALLBACK_MODE' : 'LIVE_SUPABASE_CONNECTED',
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
