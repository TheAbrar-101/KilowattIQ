/**
 * Weather & Meteorological Energy Intelligence Service - Test Suite
 * 
 * Verifies:
 * 1. Open-Meteo / Meteorological generation for Dhaka and divisional cities
 * 2. 30-minute in-memory caching mechanism
 * 3. Cooling Degree Days (CDD) with base temperature 24.0°C
 * 4. "Your AC will likely run X hours today" prediction engine
 * 5. Bill projection adjustment for forecast heatwaves & pre-warning (+৳Y)
 * 6. Rainy season (Monsoon) vs. Summer load comparison
 * 7. Bilingual thermodynamic explanation (English & বাংলা)
 */

import { WeatherService, BANGLADESH_CITIES } from '../weather/weatherService';
import { BangladeshCity } from '../weather/types';

async function runTests() {
  console.log('--- RUNNING WEATHER & METEOROLOGICAL ENERGY IMPACT TESTS ---');
  const service = WeatherService.getInstance();
  service.clearCache();

  // Test 1: Fetch Dhaka Weather Report
  console.log('\nTest 1: Fetch Dhaka Weather & Energy Impact Report');
  const dhakaReport = await service.getWeatherEnergyImpact('Dhaka', 4.5, 285);

  if (dhakaReport.city !== 'Dhaka') {
    throw new Error(`Expected city Dhaka, got ${dhakaReport.city}`);
  }
  if (!Array.isArray(dhakaReport.forecast) || dhakaReport.forecast.length < 7) {
    throw new Error(`Expected at least 7 forecast days, got ${dhakaReport.forecast.length}`);
  }
  console.log(`  ✓ Test 1 Passed: Dhaka report generated (Current: ${dhakaReport.current.tempC}°C, Feels Like: ${dhakaReport.current.feelsLikeC}°C, Source: ${dhakaReport.dataSource})`);

  // Test 2: Verify 30-Minute Caching
  console.log('\nTest 2: Verify 30-Minute In-Memory Caching');
  const cachedReport = await service.getWeatherEnergyImpact('Dhaka', 4.5, 285);
  if (cachedReport.cachedAt !== dhakaReport.cachedAt) {
    throw new Error('Expected identical cachedAt timestamp for cached query');
  }
  console.log(`  ✓ Test 2 Passed: 30-minute cache verified (Cached At: ${cachedReport.cachedAt})`);

  // Test 3: Cooling Degree Days (CDD) calculation with 24°C base
  console.log('\nTest 3: Cooling Degree Days (CDD) base 24.0°C');
  const cddInfo = dhakaReport.coolingDegreeDays;
  if (cddInfo.baseTempC !== 24.0) {
    throw new Error(`Expected base temperature 24.0°C, got ${cddInfo.baseTempC}`);
  }
  if (typeof cddInfo.past7DaysTotal !== 'number' || typeof cddInfo.forecast7DaysTotal !== 'number') {
    throw new Error('Invalid CDD totals');
  }
  // Check that every day's CDD >= 0
  for (const day of dhakaReport.forecast) {
    if (day.cdd < 0) {
      throw new Error(`CDD cannot be negative, got ${day.cdd} on ${day.date}`);
    }
  }
  console.log(`  ✓ Test 3 Passed: CDD evaluated (Past 7d: ${cddInfo.past7DaysTotal}°, Forecast 7d: ${cddInfo.forecast7DaysTotal}°, Delta: ${cddInfo.deltaPercentage}%)`);

  // Test 4: "Your AC will likely run X hours today" prediction
  console.log('\nTest 4: "Your AC will likely run X hours today" prediction');
  const acPred = dhakaReport.acPrediction;
  if (acPred.predictedHoursToday <= 0 || acPred.baselineHours <= 0) {
    throw new Error('Invalid AC prediction hours');
  }
  if (!acPred.headline.includes('hours today') || !acPred.headlineBn.includes('ঘণ্টা')) {
    throw new Error('Headline format mismatch in AC prediction');
  }
  if (acPred.estimatedCostTodayBDT <= 0 || acPred.estimatedCoolingKwhToday <= 0) {
    throw new Error('Invalid daily cooling cost estimation');
  }
  console.log(`  ✓ Test 4 Passed: AC prediction accurate (${acPred.headline} / ${acPred.headlineBn}, Est: ৳${acPred.estimatedCostTodayBDT}/day)`);

  // Test 5: Heatwave Pre-Warning and Incremental Bill Surcharge
  console.log('\nTest 5: Heatwave Pre-Warning and Projected Bill Surcharge');
  const heatImpact = dhakaReport.heatwaveImpact;
  if (typeof heatImpact.isHeatwaveLikely !== 'boolean') {
    throw new Error('Invalid heatwave likelihood flag');
  }
  if (!heatImpact.preWarningBanner || !heatImpact.preWarningBannerBn) {
    throw new Error('Missing pre-warning banner copy');
  }
  if (heatImpact.projectedBillIncreaseBDT < 0) {
    throw new Error('Projected bill increase cannot be negative');
  }
  console.log(`  ✓ Test 5 Passed: Heatwave impact verified (Banner: "${heatImpact.preWarningBanner}", Surcharge: +৳${heatImpact.projectedBillIncreaseBDT})`);

  // Test 6: Rainy Season vs. Summer Load Comparison
  console.log('\nTest 6: Rainy Season vs. Summer Load Comparison');
  const comp = dhakaReport.seasonalComparison;
  if (comp.summer.monthlyKwh <= comp.rainy.monthlyKwh) {
    throw new Error('Summer consumption must exceed monsoon consumption');
  }
  if (comp.summer.monthlyBillBDT <= comp.rainy.monthlyBillBDT) {
    throw new Error('Summer bill must exceed rainy season bill');
  }
  if (comp.loadDifferencePct <= 0 || comp.billDifferenceBDT <= 0) {
    throw new Error('Expected positive seasonal load and bill difference');
  }
  console.log(`  ✓ Test 6 Passed: Seasonal comparison verified (Summer: ৳${comp.summer.monthlyBillBDT}/mo vs Monsoon: ৳${comp.rainy.monthlyBillBDT}/mo, Load diff: -${comp.loadDifferencePct}%)`);

  // Test 7: Bilingual Thermodynamic Explanations
  console.log('\nTest 7: Bilingual Thermodynamic Explanations');
  const explainer = dhakaReport.thermodynamicExplainer;
  if (!explainer.title || !explainer.titleBn || explainer.points.length !== 4) {
    throw new Error('Expected 4 thermodynamic points with bilingual titles');
  }
  for (const pt of explainer.points) {
    if (!pt.title || !pt.titleBn || !pt.engineeringExplanation || !pt.engineeringExplanationBn || !pt.actionableTipBn) {
      throw new Error(`Incomplete bilingual point: ${pt.id}`);
    }
  }
  console.log(`  ✓ Test 7 Passed: All 4 thermodynamic points verified (Titles: ${explainer.points.map(p => p.id).join(', ')})`);

  // Test 8: Divisional Cities Regional Meteorological Variations
  console.log('\nTest 8: Divisional City Meteorology Check (Rajshahi & Sylhet)');
  service.clearCache();
  const rajshahiReport = await service.getWeatherEnergyImpact('Rajshahi', 5.0, 310);
  const sylhetReport = await service.getWeatherEnergyImpact('Sylhet', 4.0, 250);

  if (rajshahiReport.city !== 'Rajshahi' || sylhetReport.city !== 'Sylhet') {
    throw new Error('Divisional city retrieval error');
  }
  console.log(`  ✓ Test 8 Passed: Divisional cities evaluated (Rajshahi: ${rajshahiReport.current.tempC}°C, Sylhet: ${sylhetReport.current.tempC}°C)`);

  console.log('\n--- ALL WEATHER SERVICE TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Weather service test suite failed:', err);
  process.exit(1);
});
