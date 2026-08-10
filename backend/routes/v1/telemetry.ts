import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { IoTService } from '../../services/IoTService';
import { MqttTelemetryService } from '../../services/MqttTelemetryService';

const router = Router();
const db = SupabaseService.getInstance();
const iot = IoTService.getInstance();
const mqttService = MqttTelemetryService.getInstance();

// GET /api/v1/telemetry/live?householdId=...
router.get('/live', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const devices = await db.getDevices(householdId);
  const mqttStatus = mqttService.getStatus();

  const readings = await Promise.all(
    devices.map(device => iot.pollDeviceTelemetry(device))
  );

  const totalWatts = readings.reduce((acc, r) => acc + (r.activePowerW || 0), 0);
  const avgVoltage = readings.length > 0 ? readings.reduce((acc, r) => acc + (r.voltage || 220), 0) / readings.length : 220;

  res.json({
    status: 'success',
    data: {
      householdId,
      timestamp: new Date().toISOString(),
      mqttStatus: mqttStatus.mqttStatus,
      lastTelemetryReceived: mqttStatus.lastTelemetryReceived,
      packetStats: mqttStatus.packetStats,
      summary: {
        totalActivePowerW: Number(totalWatts.toFixed(1)),
        gridVoltageV: Number(avgVoltage.toFixed(1)),
        activeDeviceCount: devices.filter(d => d.isOnline).length,
      },
      readings,
    },
  });
});

// GET /api/v1/telemetry/history?householdId=...
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const rawReadings = await db.getReadings(householdId);

  res.json({
    status: 'success',
    data: {
      householdId,
      count: rawReadings.length,
      readings: rawReadings,
    },
  });
});

// POST /api/v1/telemetry/simulate (Development / Test Simulator Endpoint)
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = req.body || {};
    const topic = payload.topic || 'simulated/kilowattiq/esp32-pzem-001';

    const result = await mqttService.processTelemetryPacket(payload, topic, 'SIMULATOR');

    if (!result.success) {
      return res.status(400).json({
        status: 'error',
        message: `Telemetry validation failed: ${result.reason}`,
      });
    }

    return res.json({
      status: 'success',
      message: 'Simulated telemetry packet validated and processed successfully',
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to simulate telemetry packet',
    });
  }
});


export default router;

