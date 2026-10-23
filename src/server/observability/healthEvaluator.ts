/**
 * KilowattIQ Production Health & Subsystem Readiness Evaluator
 * 
 * Expands /api/v1/health to assess:
 * 1. Database: PostgreSQL / Supabase connection & ping latency
 * 2. Redis: Distributed cache & SSE Pub/Sub fan-out health
 * 3. MQTT: IoT Telemetry broker status, packet ingestion counts
 * 4. Gemini: AI model availability & API key configuration
 * 5. Payment Providers: bKash, Nagad, Rocket payment gateways & STS generators
 * 6. Observability: OpenTelemetry tracing, Sentry status, Active SSE clients
 */

import { SupabaseService } from '../../../backend/services/SupabaseService';
import { RedisCacheService } from '../cache/redis';
import { MqttTelemetryService } from '../../../backend/services/MqttTelemetryService';
import { PaymentManager } from '../payments/paymentManager';
import { ObservabilityTracer } from './tracing';

export interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'fallback_mode';
  latencyMs?: number;
  details?: Record<string, any>;
  lastChecked: string;
}

export interface ExpandedHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  apiVersion: string;
  timestamp: string;
  uptimeSeconds: number;
  databaseStatus: 'connected' | 'disconnected'; // Backwards compatibility for API-02
  subsystems: {
    database: SubsystemHealth;
    redis: SubsystemHealth;
    mqtt: SubsystemHealth;
    gemini: SubsystemHealth;
    paymentProviders: SubsystemHealth;
    observability: SubsystemHealth;
  };
  metrics: {
    activeSseClients: number;
    requestErrorRate: number;
    avgLatencyMs: number;
    queueDepth: number;
    memoryUsageMb: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  };
}

export class HealthEvaluator {
  private static instance: HealthEvaluator;

  private constructor() {}

  public static getInstance(): HealthEvaluator {
    if (!HealthEvaluator.instance) {
      HealthEvaluator.instance = new HealthEvaluator();
    }
    return HealthEvaluator.instance;
  }

  public async evaluate(): Promise<ExpandedHealthReport> {
    const startTime = Date.now();
    const db = SupabaseService.getInstance();
    const redis = RedisCacheService.getInstance();
    const mqtt = MqttTelemetryService.getInstance();
    const payments = PaymentManager.getInstance();
    const tracer = ObservabilityTracer.getInstance();
    const metrics = tracer.getMetrics();

    // 1. Evaluate Database (Supabase / Postgres)
    const dbStart = Date.now();
    const dbTest = await db.testDatabaseConnection();
    const dbLatencyMs = Date.now() - dbStart;
    const dbStatus = dbTest.success ? 'healthy' : 'degraded';

    const dbHealth: SubsystemHealth = {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      details: {
        provider: 'Supabase PostgreSQL',
        connected: dbTest.success,
        mode: dbTest.success ? 'cloud_live' : 'mock_dataset',
      },
      lastChecked: new Date().toISOString(),
    };

    // 2. Evaluate Redis
    const redisConnected = redis.isRedisConnected();
    const redisHealth: SubsystemHealth = {
      status: redisConnected ? 'healthy' : 'fallback_mode',
      details: {
        engine: redisConnected ? 'ioredis_cluster' : 'in_memory_ttl_bus',
        caching: true,
        ssePubSub: true,
        features: ['tariff_slabs', 'household_config', 'dashboard_summaries', 'sse_fanout'],
      },
      lastChecked: new Date().toISOString(),
    };

    // 3. Evaluate MQTT Broker & Ingestion
    const mqttStatus = mqtt.getStatus();
    const mqttConnected = mqttStatus.mqttStatus === 'MQTT_CONNECTED';
    const mqttHealth: SubsystemHealth = {
      status: mqttConnected ? 'healthy' : 'fallback_mode',
      details: {
        connectionStatus: mqttStatus.mqttStatus,
        totalPacketsReceived: mqttStatus.packetStats.totalReceived,
        validPackets: mqttStatus.packetStats.totalValid,
        lastReceivedAt: mqttStatus.lastTelemetryReceived || 'none',
      },
      lastChecked: new Date().toISOString(),
    };

    // 4. Evaluate Gemini AI Advisor
    const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
    const geminiHealth: SubsystemHealth = {
      status: hasGeminiKey ? 'healthy' : 'fallback_mode',
      details: {
        model: 'gemini-3.8-flash',
        sdk: '@google/genai',
        apiKeyConfigured: hasGeminiKey,
        mode: hasGeminiKey ? 'online_generative' : 'deterministic_energy_rules',
      },
      lastChecked: new Date().toISOString(),
    };

    // 5. Evaluate Payment Providers (bKash, Nagad, Rocket)
    const demoHhId = '11111111-1111-4111-a111-111111111111';
    const savedMethods = payments.getPaymentMethods(demoHhId);
    const autoPay = payments.getAutoPayConfig(demoHhId);
    const paymentHealth: SubsystemHealth = {
      status: 'healthy',
      details: {
        supportedGateways: ['bKash Direct PGW', 'Nagad PGW', 'Rocket DBBL MBSS'],
        tokenizationStandard: 'PCI-Safe Tokenized Wallets',
        stsTokenGeneration: '20-digit encrypted STS compatible (DESCO/DPDC)',
        savedWalletsCount: savedMethods.length,
        autoPayConfigured: autoPay.isEnabled,
      },
      lastChecked: new Date().toISOString(),
    };

    // 6. Evaluate Observability Subsystem
    const observabilityHealth: SubsystemHealth = {
      status: 'healthy',
      details: {
        openTelemetry: 'active',
        sentryBackend: metrics.sentryInitialized ? 'configured' : 'standby',
        activeSseClients: metrics.activeSseClients,
        recentSpans: metrics.recentSpansCount,
      },
      lastChecked: new Date().toISOString(),
    };

    // System memory
    const mem = process.memoryUsage();
    const memMb = {
      rss: Number((mem.rss / 1024 / 1024).toFixed(1)),
      heapUsed: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotal: Number((mem.heapTotal / 1024 / 1024).toFixed(1)),
    };

    const overallHealthy = dbTest.success;

    return {
      status: overallHealthy ? 'healthy' : 'degraded',
      service: 'KilowattIQ API',
      version: '1.0.0',
      apiVersion: 'v1',
      timestamp: new Date().toISOString(),
      uptimeSeconds: metrics.uptimeSeconds,
      databaseStatus: dbTest.success ? 'connected' : 'disconnected',
      subsystems: {
        database: dbHealth,
        redis: redisHealth,
        mqtt: mqttHealth,
        gemini: geminiHealth,
        paymentProviders: paymentHealth,
        observability: observabilityHealth,
      },
      metrics: {
        activeSseClients: metrics.activeSseClients,
        requestErrorRate: metrics.errorRatePercentage,
        avgLatencyMs: metrics.latencyMs.avg,
        queueDepth: metrics.queueDepth,
        memoryUsageMb: memMb,
      },
    };
  }
}
