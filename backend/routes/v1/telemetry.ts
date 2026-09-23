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

// GET /api/v1/telemetry/stream?householdId=... (Server-Sent Events Real-Time Telemetry Stream)
router.get('/stream', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';

  // Configure SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let isClosed = false;

  const pushTelemetry = async () => {
    if (isClosed) return;
    try {
      const devices = await db.getDevices(householdId);
      const mqttStatus = mqttService.getStatus();

      const readings = await Promise.all(
        devices.map(device => iot.pollDeviceTelemetry(device))
      );

      const totalWatts = readings.reduce((acc, r) => acc + (r.activePowerW || 0), 0);
      const avgVoltage = readings.length > 0
        ? readings.reduce((acc, r) => acc + (r.voltage || 220), 0) / readings.length
        : 220;

      const payload = {
        householdId,
        timestamp: new Date().toISOString(),
        transport: 'SSE',
        mqttStatus: mqttStatus.mqttStatus,
        lastTelemetryReceived: mqttStatus.lastTelemetryReceived,
        packetStats: mqttStatus.packetStats,
        summary: {
          totalActivePowerW: Number(totalWatts.toFixed(1)),
          gridVoltageV: Number(avgVoltage.toFixed(1)),
          activeDeviceCount: devices.filter(d => d.isOnline).length,
        },
        readings,
      };

      res.write(`event: telemetry\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      // Client disconnected or socket write error
    }
  };

  // Push immediate initial reading
  await pushTelemetry();

  // Schedule sub-second / 1.5s interval updates
  const timer = setInterval(pushTelemetry, 1500);

  req.on('close', () => {
    isClosed = true;
    clearInterval(timer);
    res.end();
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

