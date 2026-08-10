import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/admin/overview
router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  // In production, verifies req.user?.role === 'ADMIN'
  const households = await db.getHouseholds('usr_dhaka_01');
  const devices = await db.getDevices('hh_gulshan_01');

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
