import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { IoTService } from '../../services/IoTService';
import { AuditService } from '../../services/AuditService';
import { canToggleLoads, canManageMembers, normalizeRole } from '../../../src/server/auth/roles';

const router = Router();
const db = SupabaseService.getInstance();
const iot = IoTService.getInstance();
const auditService = AuditService.getInstance();

// GET /api/v1/devices?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const devices = await db.getDevices(householdId);
  res.json({ status: 'success', data: devices });
});

// POST /api/v1/devices
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const role = normalizeRole(req.user?.householdRole || req.user?.role);
  if (!canManageMembers(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins can register new IoT devices.',
    });
  }

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

  await auditService.log({
    householdId: req.body.householdId,
    userId: req.user?.id || 'usr_dhaka_01',
    userName: req.user?.fullName || 'Owner',
    userEmail: req.user?.email || 'demo@kilowattiq.bd',
    userRole: role,
    action: 'DEVICE_REGISTERED',
    entityType: 'device',
    entityId: newDevice.id,
    entityName: newDevice.name,
    details: { adapterType: newDevice.adapterType },
    status: 'SUCCESS',
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
  const role = normalizeRole(req.user?.householdRole || req.user?.role);

  // Check load toggle authorization (Auditors FORBIDDEN)
  if (!canToggleLoads(role)) {
    await auditService.log({
      householdId: '11111111-1111-4111-a111-111111111111',
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Utility Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'UNAUTHORIZED_DEVICE_TOGGLE_ATTEMPT',
      entityType: 'device',
      entityId: deviceId,
      status: 'FORBIDDEN',
      reason: 'Utility auditors have read-only access and cannot toggle IoT devices.',
    });

    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Utility auditors have read-only access and cannot toggle IoT devices or relays.',
    });
  }

  const result = await db.toggleDevice(deviceId, isOn);

  await auditService.log({
    householdId: '11111111-1111-4111-a111-111111111111',
    userId: req.user?.id || 'usr_dhaka_01',
    userName: req.user?.fullName || 'User',
    userEmail: req.user?.email || 'demo@kilowattiq.bd',
    userRole: role,
    action: 'DEVICE_TOGGLED',
    entityType: 'device',
    entityId: deviceId,
    details: { newState: result.isOn ? 'ON' : 'OFF' },
    status: 'SUCCESS',
  });

  res.json({
    status: 'success',
    data: {
      deviceId: result.deviceId,
      isOn: result.isOn,
      timestamp: new Date().toISOString(),
      performedBy: {
        userId: req.user?.id,
        role,
      },
    },
  });
});

export default router;
