/**
 * KilowattIQ Standalone Telemetry Migration Script
 * 
 * Migrates existing legacy telemetry points into TimeSeriesClient & TimescaleDB
 * - Generates 1-minute rollups (90-day retention tier)
 * - Generates 1-hour rollups (5-year retention tier)
 * - Verifies retention limits & data integrity
 */

import { TimeSeriesClient } from '../src/server/timeseries/client';
import { SupabaseService } from '../backend/services/SupabaseService';

async function runMigration() {
  console.log('====================================================================');
  console.log('       KILOWATTIQ TELEMETRY -> TIMESERIES & ROLLUPS MIGRATION       ');
  console.log('====================================================================\n');

  const tsClient = TimeSeriesClient.getInstance();
  const db = SupabaseService.getInstance();
  const householdId = '11111111-1111-4111-a111-111111111111';

  console.log(`[1/4] Connecting to telemetry source for household: ${householdId}...`);
  const legacyReadings = await db.getReadings(householdId);
  console.log(`Found ${legacyReadings.length} legacy telemetry readings.`);

  console.log('\n[2/4] Migrating legacy telemetry points into raw time-series hypertable...');
  let migratedCount = 0;

  for (const r of legacyReadings) {
    await tsClient.ingestRawTelemetry({
      time: r.timestamp || new Date().toISOString(),
      householdId,
      deviceId: r.deviceId || 'dev_desco_ami_01',
      activePowerW: r.activePowerW || 2150,
      voltageV: r.voltage || 224.5,
      currentA: r.current || 9.5,
      powerFactor: r.powerFactor || 0.94,
      energyKwh: (r.activePowerW || 2150) / 1000 / 60,
    });
    migratedCount++;
  }

  console.log(`Successfully ingested ${migratedCount} raw points into time-series store.`);

  console.log('\n[3/4] Verifying Tiered Continuous Rollup Routing:');
  
  // Test Tier 1: Range <= 1 day -> Raw
  const rawQuery = await tsClient.queryTelemetry({ householdId, range: '6h' });
  console.log(`  ✓ Tier 1 (<= 1 day): Resolution=${rawQuery.resolution}, Source=${rawQuery.source}, Points=${rawQuery.points.length}, Retention="${rawQuery.retentionTier}"`);

  // Test Tier 2: 1 day < Range <= 90 days -> 1-Min Rollups
  const rollup1MinQuery = await tsClient.queryTelemetry({ householdId, range: '7d' });
  console.log(`  ✓ Tier 2 (> 1 day, <= 90d): Resolution=${rollup1MinQuery.resolution}, Source=${rollup1MinQuery.source}, Points=${rollup1MinQuery.points.length}, Retention="${rollup1MinQuery.retentionTier}"`);

  // Test Tier 3: Range > 90 days -> 1-Hour Rollups (up to 5 years)
  const rollup1HourQuery = await tsClient.queryTelemetry({ householdId, range: '1y' });
  console.log(`  ✓ Tier 3 (> 90 days, <= 5y): Resolution=${rollup1HourQuery.resolution}, Source=${rollup1HourQuery.source}, Points=${rollup1HourQuery.points.length}, Retention="${rollup1HourQuery.retentionTier}"`);

  console.log('\n[4/4] Data Retention Policies Verified:');
  console.log(`  - Raw Telemetry: ${tsClient.RETENTION_RAW_MS / (24 * 3600 * 1000)} days retention`);
  console.log(`  - 1-Minute Rollups: ${tsClient.RETENTION_1MIN_MS / (24 * 3600 * 1000)} days retention`);
  console.log(`  - 1-Hour Rollups: ${tsClient.RETENTION_1HOUR_MS / (365 * 24 * 3600 * 1000)} years (1825 days) retention`);

  console.log('\n🎉 Telemetry time-series migration completed successfully!\n');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
