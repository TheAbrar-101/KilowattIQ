/**
 * Test Suite: Deterministic BERC Slab Prediction Hero, Daily Cap,
 * 80%/100% Slab Limit Alerts, Monthly "What Changed" Comparison,
 * Client-Side Share Links & Calm Amber UI Safety.
 */

import fs from 'node:fs';
import path from 'node:path';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import { computeMeterUsageMetrics } from '../meters/meterReadingService';
import { ManualMeterReading } from '../meters/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeReading(id: string, kwh: number, date: string, seg: number = 1): ManualMeterReading {
  return {
    id,
    householdId: 'hh-slab-test',
    userId: 'user-slab-test',
    readingKwh: kwh,
    readingDate: date,
    meterSegment: seg,
    source: 'MANUAL',
    createdAt: `${date}T09:00:00.000Z`,
  };
}

function runGroup(name: string, fn: () => void) {
  fn();
  console.log(`  PASS  ${name}`);
}

function main() {
  console.log('===============================================================');
  console.log('     KILOWATTIQ DETERMINISTIC SLAB PREDICTION TEST SUITE       ');
  console.log('===============================================================');

  runGroup('1. Hero metrics, daily cap & avoidable extra cost across tariff versions', () => {
    const jun26 = TariffCalculator.analyzeSlabThreshold(245, 18, 30, 3.0, undefined, '2026-06-15');
    assert(jun26.tariffVersionId === 'BERC-LTA-2026-06', `Expected BERC-LTA-2026-06, got ${jun26.tariffVersionId}`);
    assert(jun26.currentSlabName.includes('Step 3'), `Expected Step 3, got ${jun26.currentSlabName}`);
    assert(jun26.currentRateBDT === 9.10, `Expected 9.10 rate, got ${jun26.currentRateBDT}`);
    assert(jun26.unitsUsedThisMonth === 245, `Expected 245 unitsUsedThisMonth, got ${jun26.unitsUsedThisMonth}`);
    assert(jun26.thresholdKwh === 300, `Expected threshold 300, got ${jun26.thresholdKwh}`);
    assert(jun26.kwhRemainingToBreach === 55, `Expected 55 kWh remaining, got ${jun26.kwhRemainingToBreach}`);
    assert(jun26.daysLeftInCycle === 12, `Expected 12 daysLeftInCycle, got ${jun26.daysLeftInCycle}`);
    assert(jun26.projectedBreachOccurs === true, 'Expected projected breach at 245 kWh in 18 days');
    assert(Math.abs(jun26.maxDailyKwhToStayInSlab - 4.6) < 0.05, `Expected 4.6 daily cap, got ${jun26.maxDailyKwhToStayInSlab}`);
    assert(jun26.avoidableMonthlySurchargeBDT > 1000, `Expected significant avoidable surcharge, got ${jun26.avoidableMonthlySurchargeBDT}`);

    const expectedProjBill = TariffCalculator.calculateCost(
      (245 / 18) * 30,
      3.0,
      'SLAB',
      undefined,
      { billingPeriod: '2026-06-15' }
    ).grossTotalBDT;
    assert(
      Math.abs(jun26.projectedBillBDT - expectedProjBill) < 0.05,
      `projectedBillBDT (${jun26.projectedBillBDT}) must match TariffCalculator (${expectedProjBill})`
    );

    const preJun26 = TariffCalculator.analyzeSlabThreshold(245, 18, 30, 3.0, undefined, '2026-05-15');
    assert(preJun26.tariffVersionId === 'BERC-LTA-2024-03', `Expected BERC-LTA-2024-03, got ${preJun26.tariffVersionId}`);
    assert(preJun26.currentRateBDT === 7.59, `Expected 7.59 old rate, got ${preJun26.currentRateBDT}`);
    assert(
      preJun26.projectedBillBDT < jun26.projectedBillBDT,
      'Pre-June 2026 projected bill should differ from June 2026+ rates'
    );
  });

  runGroup('2. Deterministic 80% and 100% slab limit alerts', () => {
    // 42 / 50 kWh = 84% Lifeline -> 80_PERCENT alert
    const lifeline80 = TariffCalculator.analyzeSlabThreshold(42, 15, 30, 2.0, undefined, '2026-06-15');
    assert(
      lifeline80.slabAlerts.some((a) => a.level === '80_PERCENT' && a.thresholdKwh === 50),
      'Expected 80_PERCENT alert at 42 kWh of Lifeline (50 kWh)'
    );

    // 50 / 50 kWh = 100% Lifeline -> 100_PERCENT alert
    const lifeline100 = TariffCalculator.analyzeSlabThreshold(50, 15, 30, 2.0, undefined, '2026-06-15');
    assert(
      lifeline100.slabAlerts.some((a) => a.level === '100_PERCENT' && a.thresholdKwh === 50),
      'Expected 100_PERCENT alert at 50 kWh of Lifeline'
    );

    // 60 / 75 kWh = 80% Step 1 + crossed 100% Lifeline (50 kWh)
    const step1AndCrossed = TariffCalculator.analyzeSlabThreshold(60, 15, 30, 2.0, undefined, '2026-06-15');
    assert(
      step1AndCrossed.slabAlerts.some((a) => a.level === '80_PERCENT' && a.thresholdKwh === 75),
      'Expected 80_PERCENT alert at 60 kWh of Step 1 (75 kWh)'
    );
    assert(
      step1AndCrossed.slabAlerts.some((a) => a.level === '100_PERCENT' && a.thresholdKwh === 50),
      'Expected 100_PERCENT crossed-Lifeline alert at 60 kWh'
    );

    // 165 / 200 kWh = 82.5% Step 2 + crossed 100% Step 1 (75 kWh)
    const step2_80 = TariffCalculator.analyzeSlabThreshold(165, 18, 30, 3.0, undefined, '2026-06-15');
    assert(
      step2_80.slabAlerts.some((a) => a.level === '80_PERCENT' && a.thresholdKwh === 200),
      'Expected 80_PERCENT alert at 165 kWh (Step 2 200 kWh cap)'
    );
    assert(
      step2_80.slabAlerts.some((a) => a.level === '100_PERCENT' && a.thresholdKwh === 75),
      'Expected 100_PERCENT crossed Step 1 alert at 165 kWh'
    );

    // 200 / 200 kWh = 100% Step 2
    const step2_100 = TariffCalculator.analyzeSlabThreshold(200, 18, 30, 3.0, undefined, '2026-06-15');
    assert(
      step2_100.slabAlerts.some((a) => a.level === '100_PERCENT' && a.thresholdKwh === 200),
      'Expected 100_PERCENT alert at 200 kWh ceiling'
    );
  });

  runGroup('3. Monthly "what changed" deterministic summary', () => {
    const noPrev = TariffCalculator.compareBillingMonths({
      thisMonthKwh: 120,
      lastMonthKwh: null,
      sanctionedLoadKw: 3.0,
      thisBillingPeriod: '2026-07-01',
    });
    assert(noPrev.hasComparison === false, 'Expected hasComparison false when lastMonthKwh is null');
    assert(noPrev.summaryEn.length > 15 && noPrev.summaryBn.length > 15, 'Expected plain-language EN/BN fallback');

    const slabJump = TariffCalculator.compareBillingMonths({
      thisMonthKwh: 245,
      lastMonthKwh: 185,
      sanctionedLoadKw: 3.0,
      thisBillingPeriod: '2026-07-01',
      lastBillingPeriod: '2026-06-01',
    });
    assert(slabJump.hasComparison === true, 'Expected comparison true');
    assert(slabJump.kwhDelta === 60, `Expected +60 kWh delta, got ${slabJump.kwhDelta}`);
    assert((slabJump.billDeltaBDT ?? 0) > 0, 'Expected positive bill delta');
    assert(slabJump.tariffChanged === false, 'Expected same June 2026 tariff version');
    assert(slabJump.drivers.some((d) => d.key === 'SLAB_SHIFT'), 'Expected SLAB_SHIFT driver (Step 2 -> Step 3)');
    assert(slabJump.summaryEn.includes('Step 3') && slabJump.summaryBn.includes('Step 3'), 'Expected EN/BN slab mentions');

    const tariffShift = TariffCalculator.compareBillingMonths({
      thisMonthKwh: 285,
      lastMonthKwh: 285,
      sanctionedLoadKw: 4.5,
      thisBillingPeriod: '2026-06-15',
      lastBillingPeriod: '2026-05-15',
    });
    assert(tariffShift.tariffChanged === true, 'Expected tariffChanged true between May and June 2026');
    assert(tariffShift.thisTariffVersionId === 'BERC-LTA-2026-06', 'Expected new tariff version ID');
    assert(tariffShift.lastTariffVersionId === 'BERC-LTA-2024-03', 'Expected old tariff version ID');
    assert(tariffShift.drivers.some((d) => d.key === 'TARIFF_VERSION'), 'Expected TARIFF_VERSION driver');
  });

  runGroup('4. Previous billing cycle aggregation in computeMeterUsageMetrics', () => {
    const readings: ManualMeterReading[] = [
      makeReading('r1', 1000, '2026-06-15'),
      makeReading('r2', 1180, '2026-07-14'), // 180 kWh in cycle 2026-06-15..2026-07-14
      makeReading('r3', 1310, '2026-07-30'), // +130 kWh in cycle 2026-07-15..2026-08-14
    ];

    const metrics = computeMeterUsageMetrics(readings, 3.0, '2026-07-30', 15);
    assert(metrics.monthToDateKwh === 130, `Expected 130 MTD kWh, got ${metrics.monthToDateKwh}`);
    assert(metrics.cycleDaysElapsed === 16, `Expected 16 cycleDaysElapsed, got ${metrics.cycleDaysElapsed}`);
    assert(metrics.cycleTotalDays === 31, `Expected 31 cycleTotalDays, got ${metrics.cycleTotalDays}`);
    assert(metrics.previousCycle?.kwhUsed === 180, `Expected 180 kWh in previous cycle, got ${metrics.previousCycle?.kwhUsed}`);

    const expectedPrevCost = TariffCalculator.calculateCost(180, 3.0, 'SLAB', undefined, {
      billingPeriod: '2026-06-15',
    }).grossTotalBDT;
    assert(
      metrics.previousCycle?.estimatedCostBdt === expectedPrevCost,
      `Expected previous cycle cost ৳${expectedPrevCost}, got ৳${metrics.previousCycle?.estimatedCostBdt}`
    );
  });

  runGroup('5. Calm amber UI, client-side share links & zero-LLM safety check', () => {
    const heroPath = path.resolve(process.cwd(), 'src/components/dashboard/SlabPredictionHero.tsx');
    const liveTabPath = path.resolve(process.cwd(), 'src/components/tabs/LiveDashboardTab.tsx');
    const heroSrc = fs.readFileSync(heroPath, 'utf8');
    const liveSrc = fs.readFileSync(liveTabPath, 'utf8');

    assert(!/\b(rose|red)-[0-9]{2,3}\b/.test(heroSrc), 'SlabPredictionHero.tsx must use calm amber, never red/rose classes');
    assert(!heroSrc.includes('@google/genai') && !heroSrc.includes('/api/ai'), 'SlabPredictionHero.tsx must never call any LLM');
    assert(heroSrc.includes('https://wa.me/?text='), 'SlabPredictionHero.tsx must provide client-side WhatsApp link');
    assert(heroSrc.includes('sms:?body='), 'SlabPredictionHero.tsx must provide client-side SMS link');
    assert(liveSrc.includes('<SlabPredictionHero'), 'LiveDashboardTab.tsx must render SlabPredictionHero');
    assert(!liveSrc.includes('High Load Warning'), 'High Load Advisory banner should use calm amber instead of rose warning');
  });

  console.log('\nRESULT: All 5 deterministic slab prediction test groups PASSED.\n');
}

main();
