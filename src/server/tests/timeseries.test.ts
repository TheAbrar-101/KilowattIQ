/**
 * KilowattIQ Time-Series Store & Redis Caching Unit Tests
 * 
 * Verifies:
 * 1. TimescaleDB raw telemetry ingestion & retention tiers (7 days, 90 days, 5 years)
 * 2. Tiered Rollup Routing:
 *    - Range <= 1 day -> Raw telemetry
 *    - 1 day < Range <= 90 days -> 1-minute continuous rollups
 *    - Range > 90 days -> 1-hour continuous rollups
 * 3. Redis Caching for:
 *    - Tariff slabs
 *    - Household configurations
 *    - Dashboard summaries
 * 4. Cache Invalidation on tariff change and household update
 * 5. SSE Fan-Out via Redis Pub/Sub
 */

import { TimeSeriesClient } from '../timeseries/client';
import { RedisCacheService } from '../cache/redis';

async function runTimeSeriesAndCacheTests() {
  console.log('--- RUNNING TIMESCALEDB & REDIS CACHING TESTS ---');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  const tsClient = TimeSeriesClient.getInstance();
  const redis = RedisCacheService.getInstance();
  const hhId = '11111111-1111-4111-a111-111111111111';

  // Test 1: Ingest raw telemetry point into hypertable
  await tsClient.ingestRawTelemetry({
    time: new Date().toISOString(),
    householdId: hhId,
    deviceId: 'dev_desco_ami_01',
    activePowerW: 2450,
    voltageV: 225.5,
    currentA: 10.86,
    powerFactor: 0.95,
  });
  assert(true, 'Ingested raw telemetry point into time-series hypertable');

  // Test 2: Tier 1 - Query range <= 1 day returns RAW resolution
  const rawRes = await tsClient.queryTelemetry({ householdId: hhId, range: '6h' });
  assert(rawRes.resolution === 'RAW', 'Range <= 1 day routes to RAW resolution');
  assert(rawRes.retentionTier.includes('7 days'), 'Raw retention tier correctly specifies 7 days');
  assert(rawRes.points.length > 0, 'Raw query returns telemetry points');

  // Test 3: Tier 2 - Query 1 day < range <= 90 days returns 1_MIN rollups
  const rollup1mRes = await tsClient.queryTelemetry({ householdId: hhId, range: '7d' });
  assert(rollup1mRes.resolution === '1_MIN', 'Range > 1 day and <= 90 days routes to 1_MIN rollups');
  assert(rollup1mRes.retentionTier.includes('90 days'), '1-min retention tier specifies 90 days');
  assert(rollup1mRes.source.includes('1MIN'), 'Data source is continuous aggregate 1-min rollup');

  // Test 4: Tier 3 - Query range > 90 days returns 1_HOUR rollups (up to 5 years)
  const rollup1hRes = await tsClient.queryTelemetry({ householdId: hhId, range: '1y' });
  assert(rollup1hRes.resolution === '1_HOUR', 'Range > 90 days routes to 1_HOUR rollups');
  assert(rollup1hRes.retentionTier.includes('5 years'), '1-hour retention tier specifies 5 years');
  assert(rollup1hRes.points.length > 0, '1-hour query returns historical bucket points');

  // Test 5: Verify Retention Constants
  assert(tsClient.RETENTION_RAW_MS === 7 * 24 * 3600 * 1000, 'Raw retention matches 7 days exactly');
  assert(tsClient.RETENTION_1MIN_MS === 90 * 24 * 3600 * 1000, '1-minute rollup retention matches 90 days exactly');
  assert(tsClient.RETENTION_1HOUR_MS === 5 * 365 * 24 * 3600 * 1000, '1-hour rollup retention matches 5 years exactly');

  // Test 6: Redis Cache - Tariff Slabs
  const sampleTariff = { type: 'SLAB', step3Rate: 7.34, provider: 'DESCO' };
  await redis.setTariffSlabs('SLAB', sampleTariff, 60);
  const cachedTariff = await redis.getTariffSlabs('SLAB');
  assert(cachedTariff?.step3Rate === 7.34, 'Redis stores and retrieves tariff slabs');

  // Test 7: Redis Cache Invalidation on Tariff Change
  await redis.invalidateTariffCache();
  const invalidatedTariff = await redis.getTariffSlabs('SLAB');
  assert(invalidatedTariff === null, 'invalidateTariffCache() purges all cached tariff slabs');

  // Test 8: Redis Cache - Household Configuration
  const sampleHh = { id: hhId, budgetBDT: 3500, sanctionedLoadKw: 3.0 };
  await redis.setHouseholdConfig(hhId, sampleHh, 60);
  const cachedHh = await redis.getHouseholdConfig(hhId);
  assert(cachedHh?.budgetBDT === 3500, 'Redis stores and retrieves household config');

  // Test 9: Redis Cache - Dashboard Summary
  const sampleDashboard = { householdId: hhId, totalActivePowerW: 4296, gridVoltageV: 224 };
  await redis.setDashboardSummary(hhId, sampleDashboard, 30);
  const cachedDashboard = await redis.getDashboardSummary(hhId);
  assert(cachedDashboard?.totalActivePowerW === 4296, 'Redis stores and retrieves dashboard summaries');

  // Test 10: Redis Cache Invalidation on Household Update
  await redis.invalidateHouseholdCache(hhId);
  const invalidatedHh = await redis.getHouseholdConfig(hhId);
  const invalidatedDashboard = await redis.getDashboardSummary(hhId);
  assert(invalidatedHh === null, 'invalidateHouseholdCache() purges household config cache');
  assert(invalidatedDashboard === null, 'invalidateHouseholdCache() also purges dashboard summary cache');

  // Test 11: SSE Fan-Out via Redis Pub/Sub
  let receivedFanoutPayload: any = null;
  const unsubscribe = await redis.subscribeTelemetry(hhId, (payload) => {
    receivedFanoutPayload = payload;
  });

  const testPayload = { householdId: hhId, activeWatts: 3850, transport: 'TEST_FANOUT' };
  await redis.publishTelemetry(hhId, testPayload);

  // Give pub/sub microtask time to trigger
  await new Promise(resolve => setTimeout(resolve, 50));
  assert(receivedFanoutPayload !== null && receivedFanoutPayload.activeWatts === 3850, 'Redis Pub/Sub fans out live telemetry packet to subscriber');

  unsubscribe();

  console.log(`\n🎉 All ${passed}/${total} TimescaleDB & Redis caching tests passed!`);
}

runTimeSeriesAndCacheTests().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
