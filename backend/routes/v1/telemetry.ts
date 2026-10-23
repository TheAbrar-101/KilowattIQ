import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { IoTService } from '../../services/IoTService';
import { MqttTelemetryService } from '../../services/MqttTelemetryService';
import { TimeSeriesClient } from '../../../src/server/timeseries/client';
import { RedisCacheService } from '../../../src/server/cache/redis';

const router = Router();
const db = SupabaseService.getInstance();
const iot = IoTService.getInstance();
const mqttService = MqttTelemetryService.getInstance();
const tsClient = TimeSeriesClient.getInstance();
const redisCache = RedisCacheService.getInstance();

// GET /api/v1/telemetry/live?householdId=...&range=...
// Tiered Routing:
// - If range > 1 day (e.g., range=2d, range=7d, range=30d, range=1y, range=5y):
//   Reads from Timescale continuous rollups (1-min rollups for <= 90d, 1-hour rollups for <= 5y)
// - If range <= 1 day or default live snapshot:
//   Reads raw high-resolution telemetry, backed by Redis dashboard summary cache
router.get('/live', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const range = (req.query.range as string) || undefined;
  const startDate = (req.query.startDate as string) || undefined;
  const endDate = (req.query.endDate as string) || undefined;

  const rangeDurationMs = tsClient.parseRangeToMs(range, startDate, endDate);
  const ONE_DAY_MS = 24 * 3600 * 1000;

  // Tier 1: Historical Rollups when range > 1 day
  if (range && rangeDurationMs > ONE_DAY_MS) {
    const rollupsResult = await tsClient.queryTelemetry({
      householdId,
      range,
      startDate,
      endDate,
    });

    return res.json({
      status: 'success',
      data: {
        householdId,
        timestamp: new Date().toISOString(),
        mode: 'TIME_SERIES_ROLLUP',
        resolution: rollupsResult.resolution,
        rangeDurationHours: rollupsResult.rangeDurationHours,
        retentionTier: rollupsResult.retentionTier,
        source: rollupsResult.source,
        summary: {
          totalActivePowerW: rollupsResult.summary.avgPowerW,
          peakActivePowerW: rollupsResult.summary.peakPowerW,
          gridVoltageV: rollupsResult.summary.avgVoltageV,
          totalEnergyKwh: rollupsResult.summary.totalKwh,
          samplePointCount: rollupsResult.summary.pointCount,
        },
        rollups: rollupsResult.points,
      },
    });
  }

  // Tier 2: Real-Time Live Snapshot (Range <= 1 Day)
  // Check Redis dashboard summary cache first
  const cacheKey = `cache:dashboard:${householdId}`;
  const cachedSummary = await redisCache.getDashboardSummary(householdId);
  if (cachedSummary && !req.query.no_cache) {
    return res.json({
      status: 'success',
      data: {
        ...cachedSummary,
        source: 'REDIS_CACHE',
      },
    });
  }

  const devices = await db.getDevices(householdId);
  const mqttStatus = mqttService.getStatus();

  const readings = await Promise.all(
    devices.map(device => iot.pollDeviceTelemetry(device))
  );

  const totalWatts = readings.reduce((acc, r) => acc + (r.activePowerW || 0), 0);
  const avgVoltage = readings.length > 0
    ? readings.reduce((acc, r) => acc + (r.voltage || 220), 0) / readings.length
    : 220;

  // Ingest current point into time-series store
  await tsClient.ingestRawTelemetry({
    time: new Date().toISOString(),
    householdId,
    deviceId: devices[0]?.id || 'dev_desco_ami_01',
    activePowerW: Number(totalWatts.toFixed(1)),
    voltageV: Number(avgVoltage.toFixed(1)),
    currentA: Number((totalWatts / (avgVoltage || 220)).toFixed(2)),
    powerFactor: 0.94,
    energyKwh: Number((totalWatts / 1000 / 60).toFixed(4)),
  });

  const responsePayload = {
    householdId,
    timestamp: new Date().toISOString(),
    mode: 'RAW_TELEMETRY',
    resolution: 'RAW',
    source: 'LIVE_IOT_AND_TIMESCALE_RAW',
    retentionTier: 'Raw telemetry (Retained 7 days)',
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

  // Cache in Redis for fast polling deduplication (15 seconds TTL)
  await redisCache.setDashboardSummary(householdId, responsePayload);

  // Publish to Redis Pub/Sub for cross-instance SSE fan-out
  await redisCache.publishTelemetry(householdId, responsePayload);

  return res.json({
    status: 'success',
    data: responsePayload,
  });
});

// GET /api/v1/telemetry/stream?householdId=...
// Server-Sent Events (SSE) Real-Time Telemetry Stream with Redis Pub/Sub Fan-Out
router.get('/stream', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';

  // Configure SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  let isClosed = false;

  // 1. Subscribe to Redis Pub/Sub fan-out channel
  // Allows multiple serverless/container instances to receive live telemetry from any worker node
  const unsubscribeRedis = await redisCache.subscribeTelemetry(householdId, (fanoutPayload) => {
    if (isClosed) return;
    try {
      res.write(`event: telemetry\ndata: ${JSON.stringify({ ...fanoutPayload, transport: 'SSE_REDIS_FANOUT' })}\n\n`);
    } catch (e) {}
  });

  const pushLocalTelemetry = async () => {
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

      // Broadcast to Redis pub/sub
      await redisCache.publishTelemetry(householdId, payload);
    } catch (err) {}
  };

  // Push immediate initial reading
  await pushLocalTelemetry();

  // Schedule sub-second / 1.5s interval updates
  const timer = setInterval(pushLocalTelemetry, 1500);

  // Serverless safety timer
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  let serverlessSafetyTimer: any = null;

  if (isServerless) {
    res.write('retry: 500\n\n');
    serverlessSafetyTimer = setTimeout(() => {
      isClosed = true;
      clearInterval(timer);
      unsubscribeRedis();
      res.end();
    }, 8500);
  }

  req.on('close', () => {
    isClosed = true;
    clearInterval(timer);
    unsubscribeRedis();
    if (serverlessSafetyTimer) clearTimeout(serverlessSafetyTimer);
    res.end();
  });
});

// GET /api/v1/telemetry/history?householdId=...&range=...
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const range = (req.query.range as string) || '24h';

  const result = await tsClient.queryTelemetry({
    householdId,
    range,
  });

  return res.json({
    status: 'success',
    data: {
      householdId,
      resolution: result.resolution,
      source: result.source,
      retentionTier: result.retentionTier,
      count: result.points.length,
      summary: result.summary,
      readings: result.points,
    },
  });
});

// POST /api/v1/telemetry/simulate (Development / Test Simulator Endpoint)
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = req.body || {};
    const householdId = payload.householdId || '11111111-1111-4111-a111-111111111111';

    // Ingest into time-series hypertable
    await tsClient.ingestRawTelemetry({
      time: payload.timestamp || new Date().toISOString(),
      householdId,
      deviceId: payload.deviceId || 'dev_desco_ami_01',
      activePowerW: Number(payload.activePowerW || 2400),
      voltageV: Number(payload.voltage || 220),
      currentA: Number(payload.current || 10.9),
      powerFactor: Number(payload.powerFactor || 0.95),
      energyKwh: Number(payload.energyKwh || 0.04),
    });

    // Invalidate Redis dashboard cache
    await redisCache.invalidateDashboardSummary(householdId);

    // Publish to Redis pub/sub fan-out
    await redisCache.publishTelemetry(householdId, {
      householdId,
      timestamp: new Date().toISOString(),
      transport: 'SIMULATION_FANOUT',
      summary: {
        totalActivePowerW: payload.activePowerW || 2400,
        gridVoltageV: payload.voltage || 220,
        activeDeviceCount: 4,
      },
      readings: [payload],
    });

    res.json({
      status: 'success',
      message: 'Simulated telemetry packet ingested into Timescale store and fanned out via Redis Pub/Sub',
      data: payload,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err?.message || 'Failed to simulate telemetry packet',
    });
  }
});

export default router;
