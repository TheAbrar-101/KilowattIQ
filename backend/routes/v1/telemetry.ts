import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { IoTService } from '../../services/IoTService';

const router = Router();
const db = SupabaseService.getInstance();
const iot = IoTService.getInstance();

// GET /api/v1/telemetry/live?householdId=...
router.get('/live', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const devices = await db.getDevices(householdId);

  const readings = await Promise.all(
    devices.map(device => iot.pollDeviceTelemetry(device))
  );

  const totalWatts = readings.reduce((acc, r) => acc + r.activePowerW, 0);
  const avgVoltage = readings.length > 0 ? readings.reduce((acc, r) => acc + r.voltage, 0) / readings.length : 220;

  res.json({
    status: 'success',
    data: {
      householdId,
      timestamp: new Date().toISOString(),
      summary: {
        totalActivePowerW: Number(totalWatts.toFixed(1)),
        gridVoltageV: Number(avgVoltage.toFixed(1)),
        activeDeviceCount: devices.filter(d => d.isOnline).length,
      },
      readings,
    },
  });
});

export default router;
