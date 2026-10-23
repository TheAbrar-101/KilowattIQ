/**
 * KilowattIQ Redis Caching & Pub/Sub Fan-Out Service
 * 
 * Features:
 * 1. Distributed Caching for:
 *    - Tariff slabs ('cache:tariffs:*')
 *    - Household configurations ('cache:household:<id>')
 *    - Dashboard live summaries ('cache:dashboard:<id>')
 * 2. Cache Invalidation:
 *    - Invalidation on tariff rate update or BERC slab restructure
 *    - Invalidation on household budget/sanctioned load/address update
 *    - Invalidation on appliance toggle or device state mutation
 * 3. SSE Fan-Out via Redis Pub/Sub:
 *    - Channel: 'kilowattiq:telemetry:fanout:<householdId>'
 *    - Enables multiple serverless / multi-container instances to receive live
 *      MQTT/hardware telemetry and fan-out SSE packets to active web clients.
 * 4. Resilient Hybrid Mode:
 *    - Uses real `ioredis` client when REDIS_URL is configured
 *    - Graceful in-memory cache and EventEmitter fallback for standalone test/dev environments
 */

import { EventEmitter } from 'events';
import Redis from 'ioredis';

export interface CacheOptions {
  ttlSeconds?: number;
}

export class RedisCacheService {
  private static instance: RedisCacheService;

  private redisClient: Redis | null = null;
  private redisSubClient: Redis | null = null;
  private isConnected: boolean = false;

  // In-memory fallback cache and event emitter
  private memoryCache: Map<string, { value: any; expiresAt: number | null }> = new Map();
  private memoryBus: EventEmitter = new EventEmitter();

  // Standard TTL defaults (seconds)
  public static readonly TTL_TARIFF_SLABS = 3600 * 24;      // 24 hours (Tariffs change infrequently)
  public static readonly TTL_HOUSEHOLD_CONFIG = 3600 * 6;   // 6 hours
  public static readonly TTL_DASHBOARD_SUMMARY = 15;        // 15 seconds (High-frequency live view)

  private constructor() {
    this.memoryBus.setMaxListeners(100);
    this.initRedis();
  }

  public static getInstance(): RedisCacheService {
    if (!RedisCacheService.instance) {
      RedisCacheService.instance = new RedisCacheService();
    }
    return RedisCacheService.instance;
  }

  private initRedis(): void {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;

    if (redisUrl && redisUrl.startsWith('redis')) {
      try {
        this.redisClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          retryStrategy: (times) => {
            if (times > 3) return null; // Fallback to memory
            return Math.min(times * 200, 1000);
          },
        });

        this.redisSubClient = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
        });

        this.redisClient.connect()
          .then(() => {
            this.isConnected = true;
            console.log('[RedisCacheService] Connected to distributed Redis server');
          })
          .catch((err) => {
            console.warn('[RedisCacheService] Redis connection skipped, operating in in-memory mode:', err.message);
            this.isConnected = false;
          });

        this.redisSubClient.connect().catch(() => {});
      } catch (err: any) {
        console.warn('[RedisCacheService] Failed to initialize Redis client, using fallback:', err.message);
        this.isConnected = false;
      }
    } else {
      // In-memory mode for development and test execution
      this.isConnected = false;
    }
  }

  public isRedisConnected(): boolean {
    return this.isConnected;
  }

  // ====================================================================
  // GENERIC KEY-VALUE CACHE OPERATIONS
  // ====================================================================

  public async get<T>(key: string): Promise<T | null> {
    if (this.isConnected && this.redisClient) {
      try {
        const data = await this.redisClient.get(key);
        return data ? (JSON.parse(data) as T) : null;
      } catch (err) {
        // Fallback to memory
      }
    }

    const item = this.memoryCache.get(key);
    if (!item) return null;

    if (item.expiresAt !== null && Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return item.value as T;
  }

  public async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const jsonStr = JSON.stringify(value);

    if (this.isConnected && this.redisClient) {
      try {
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redisClient.set(key, jsonStr, 'EX', ttlSeconds);
        } else {
          await this.redisClient.set(key, jsonStr);
        }
        return;
      } catch (err) {
        // Fallback to memory
      }
    }

    const expiresAt = ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
    this.memoryCache.set(key, { value, expiresAt });
  }

  public async del(keyOrPrefix: string): Promise<void> {
    if (this.isConnected && this.redisClient) {
      try {
        if (keyOrPrefix.endsWith('*')) {
          const keys = await this.redisClient.keys(keyOrPrefix);
          if (keys.length > 0) {
            await this.redisClient.del(...keys);
          }
        } else {
          await this.redisClient.del(keyOrPrefix);
        }
      } catch (err) {
        // Fallback to memory
      }
    }

    if (keyOrPrefix.endsWith('*')) {
      const prefix = keyOrPrefix.slice(0, -1);
      for (const k of this.memoryCache.keys()) {
        if (k.startsWith(prefix)) {
          this.memoryCache.delete(k);
        }
      }
    } else {
      this.memoryCache.delete(keyOrPrefix);
    }
  }

  // ====================================================================
  // DOMAIN-SPECIFIC CACHE: TARIFF SLABS
  // ====================================================================

  public async getTariffSlabs<T = any>(tariffType: string = 'SLAB'): Promise<T | null> {
    const key = `cache:tariffs:${tariffType.toUpperCase()}`;
    return this.get<T>(key);
  }

  public async setTariffSlabs(tariffType: string = 'SLAB', slabs: any, ttlSeconds: number = RedisCacheService.TTL_TARIFF_SLABS): Promise<void> {
    const key = `cache:tariffs:${tariffType.toUpperCase()}`;
    await this.set(key, slabs, ttlSeconds);
  }

  public async invalidateTariffCache(): Promise<void> {
    await this.del('cache:tariffs:*');
    console.log('[RedisCacheService] Invalidated tariff slab cache');
  }

  // ====================================================================
  // DOMAIN-SPECIFIC CACHE: HOUSEHOLD CONFIGURATION
  // ====================================================================

  public async getHouseholdConfig<T = any>(householdId: string): Promise<T | null> {
    const key = `cache:household:${householdId}`;
    return this.get<T>(key);
  }

  public async setHouseholdConfig(householdId: string, config: any, ttlSeconds: number = RedisCacheService.TTL_HOUSEHOLD_CONFIG): Promise<void> {
    const key = `cache:household:${householdId}`;
    await this.set(key, config, ttlSeconds);
  }

  public async invalidateHouseholdCache(householdId: string): Promise<void> {
    await this.del(`cache:household:${householdId}`);
    await this.invalidateDashboardSummary(householdId);
    console.log(`[RedisCacheService] Invalidated household config cache: ${householdId}`);
  }

  // ====================================================================
  // DOMAIN-SPECIFIC CACHE: DASHBOARD SUMMARIES
  // ====================================================================

  public async getDashboardSummary<T = any>(householdId: string): Promise<T | null> {
    const key = `cache:dashboard:${householdId}`;
    return this.get<T>(key);
  }

  public async setDashboardSummary(householdId: string, summary: any, ttlSeconds: number = RedisCacheService.TTL_DASHBOARD_SUMMARY): Promise<void> {
    const key = `cache:dashboard:${householdId}`;
    await this.set(key, summary, ttlSeconds);
  }

  public async invalidateDashboardSummary(householdId: string): Promise<void> {
    await this.del(`cache:dashboard:${householdId}`);
  }

  // ====================================================================
  // SSE FAN-OUT VIA REDIS PUB/SUB (MULTI-INSTANCE / SERVERLESS)
  // ====================================================================

  /**
   * Publishes telemetry packet to Redis pub/sub channel for multi-instance SSE fan-out
   */
  public async publishTelemetry(householdId: string, payload: any): Promise<number> {
    const channel = `kilowattiq:telemetry:fanout:${householdId}`;
    const payloadStr = JSON.stringify(payload);

    // In-memory bus notification for current process
    this.memoryBus.emit(channel, payload);
    this.memoryBus.emit('kilowattiq:telemetry:fanout:all', payload);

    if (this.isConnected && this.redisClient) {
      try {
        return await this.redisClient.publish(channel, payloadStr);
      } catch (err) {
        return 1;
      }
    }
    return 1;
  }

  /**
   * Subscribes to live telemetry SSE fan-out for a household.
   * Returns an unsubscribe function.
   */
  public async subscribeTelemetry(
    householdId: string,
    callback: (payload: any) => void
  ): Promise<() => void> {
    const channel = `kilowattiq:telemetry:fanout:${householdId}`;

    // Listener for memory bus
    const memoryListener = (data: any) => callback(data);
    this.memoryBus.on(channel, memoryListener);

    if (this.isConnected && this.redisSubClient) {
      try {
        await this.redisSubClient.subscribe(channel);
        const redisMessageHandler = (subChannel: string, message: string) => {
          if (subChannel === channel) {
            try {
              const parsed = JSON.parse(message);
              callback(parsed);
            } catch (e) {}
          }
        };

        this.redisSubClient.on('message', redisMessageHandler);

        return () => {
          this.memoryBus.off(channel, memoryListener);
          if (this.redisSubClient) {
            this.redisSubClient.unsubscribe(channel).catch(() => {});
            this.redisSubClient.off('message', redisMessageHandler);
          }
        };
      } catch (err) {}
    }

    return () => {
      this.memoryBus.off(channel, memoryListener);
    };
  }
}
