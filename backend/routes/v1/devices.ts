import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { IoTService } from '../../services/IoTService';

const router = Router();
const db = SupabaseService.getInstance();
const iot = IoTService.getInstance();

// GET /api/v1/devices?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const devices = await db.getDevices(householdId);
  res.json({ status: 'success', data: devices });
});

// POST /api/v1/devices
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const newDevice = await db.createDevice({
    householdId: req.body.householdId,
    roomId: req.body.roomId,
    applianceId: req.body.applianceId,
    name: req.body.name,
    deviceType: req.body.deviceType || 'SMART_PLUG',
    adapterType: req.body.adapterType || 'MockAdapter',
    macOrSerial: req.body.macOrSerial || `MAC-${Date.now()}`,
    isOnline: true,
    config: req.body.config || { baseWatts: 500 },
  });
  res.status(201).json({ status: 'success', data: newDevice });
});

// GET /api/v1/devices/:id/health
router.get('/:id/health', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const devices = await db.getDevices(householdId);
  const device = devices.find(d => d.id === req.params.id);

  if (!device) {
    return res.status(404).json({ status: 'error', message: 'Device not found' });
  }

  const health = await iot.getDeviceHealth(device);
  res.json({ status: 'success', data: { deviceId: device.id, adapter: device.adapterType, health } });
});

// POST /api/v1/devices/:id/toggle
router.post('/:id/toggle', async (req: AuthenticatedRequest, res: Response) => {
  const deviceId = req.params.id;
  const { isOn } = req.body || {};

  const result = await db.toggleDevice(deviceId, isOn);
  res.json({
    status: 'success',
    data: {
      deviceId: result.deviceId,
      isOn: result.isOn,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
