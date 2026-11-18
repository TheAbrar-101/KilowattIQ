/**
 * Test Suite: Hardened Deterministic BERC Slab Prediction Hero,
 * Projection Confidence Range (>=5 reading days), Asia/Dhaka Timezone Cycles,
 * Lifeline 50->51 kWh Cliff Alerts, Per-Cycle Dismissed Alert Persistence,
 * Privacy-Sanitized Share Summary, Golden Bill >200 kWh Verification & WCAG AA Amber Safety.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import {
  MeterReadingService,
  computeMeterUsageMetrics,
  getBillingCycleWindow,
} from '../meters/meterReadingService';
import { ManualMeterReading } from '../meters/types';
import {
  getDhakaBillingCycleTiming,
  getDhakaDateString,
} from '../../../shared/utils/dhakaTime';
import { buildSafeShareSummary } from '../../../shared/utils/slabShareSummary';
import { GOLDEN_BILLS, verifyGoldenBills } from './goldenBills.test';

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

async function runGroup(name: string, fn: () => void | Promise<void>) {
  await fn();
  console.log(`  PASS  ${name}`);
}

async function main() {
  console.log('===============================================================');
  console.log('     KILOWATTIQ HARDENED SLAB PREDICTION TEST SUITE            ');
  console.log('===============================================================');

  await runGroup('1. Hero metrics, daily cap & avoidable extra cost across tariff versions', () => {
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

    const preJun26 = TariffCalculator.analyzeSlabThreshold(245, 18, 30, 3.0, undefined, '2026-05-15');
    assert(preJun26.tariffVersionId === 'BERC-LTA-2024-03', `Expected BERC-LTA-2024-03, got ${preJun26.tariffVersionId}`);
    assert(preJun26.currentRateBDT === 7.59, `Expected 7.59 old rate, got ${preJun26.currentRateBDT}`);
    assert(preJun26.projectedBillBDT < jun26.projectedBillBDT, 'Pre-June 2026 bill should be lower');
  });

  await runGroup('2. Projection confidence range (low/expected/high) & 5-day gate', () => {
    // Under 5 days of readings: hasEnoughData MUST be false ("Not enough data yet")
    const earlyReadings: ManualMeterReading[] = [
      makeReading('e1', 1000, '2026-07-01'),
      makeReading('e2', 1012, '2026-07-02'),
      makeReading('e3', 1026, '2026-07-03'),
      makeReading('e4', 1041, '2026-07-04'),
    ];
    const earlyMetrics = computeMeterUsageMetrics(earlyReadings, 3.0, '2026-07-04', 1);
    assert(earlyMetrics.readingDaysInCycle === 4, `Expected 4 readingDaysInCycle, got ${earlyMetrics.readingDaysInCycle}`);

    const under5 = TariffCalculator.analyzeSlabThreshold(
      earlyMetrics.monthToDateKwh ?? 0,
      earlyMetrics.cycleDaysElapsed,
      earlyMetrics.cycleTotalDays,
      3.0,
      undefined,
      earlyMetrics.cycleStartDate,
      {
        dailyUsageHistory: earlyMetrics.dailyUsageHistory,
        readingDaysInCycle: earlyMetrics.readingDaysInCycle,
      }
    );
    assert(under5.projectionConfidence?.hasEnoughData === false, 'Must require >= 5 reading days before projecting');
    assert(
      under5.projectionConfidence?.rangeLabelEn.includes('Not enough data yet'),
      `Expected Not enough data yet label, got ${under5.projectionConfidence?.rangeLabelEn}`
    );

    // At 5+ days of readings: hasEnoughData MUST be true and produce low < expected < high range
    const fullReadings: ManualMeterReading[] = [
      makeReading('f1', 1000, '2026-07-01'),
      makeReading('f2', 1010, '2026-07-02'), // +10
      makeReading('f3', 1022, '2026-07-03'), // +12
      makeReading('f4', 1038, '2026-07-04'), // +16
      makeReading('f5', 1058, '2026-07-05'), // +20
    ];
    const fullMetrics = computeMeterUsageMetrics(fullReadings, 3.0, '2026-07-05', 1);
    assert(fullMetrics.readingDaysInCycle === 5, `Expected 5 readingDaysInCycle, got ${fullMetrics.readingDaysInCycle}`);
    assert(fullMetrics.dailyUsageHistory.length === 4, 'Expected 4 daily interval rates');

    const at5 = TariffCalculator.analyzeSlabThreshold(
      fullMetrics.monthToDateKwh ?? 0,
      fullMetrics.cycleDaysElapsed,
      fullMetrics.cycleTotalDays,
      3.0,
      undefined,
      fullMetrics.cycleStartDate,
      {
        dailyUsageHistory: fullMetrics.dailyUsageHistory,
        readingDaysInCycle: fullMetrics.readingDaysInCycle,
      }
    );
    const conf = at5.projectionConfidence!;
    assert(conf.hasEnoughData === true, 'Expected hasEnoughData === true at 5 reading days');
    assert(conf.lowKwh < conf.expectedKwh && conf.expectedKwh < conf.highKwh, 'Expected low < expected < high kWh');
    assert(conf.lowBillBDT < conf.expectedBillBDT && conf.expectedBillBDT < conf.highBillBDT, 'Expected low < expected < high BDT');
    assert(
      /^Projected: ৳\d+ to ৳\d+, likely ৳\d+$/.test(conf.rangeLabelEn),
      `Unexpected range label format: ${conf.rangeLabelEn}`
    );
  });

  await runGroup('3. Asia/Dhaka timezone boundaries: 18:30 UTC rollover, first day & last day of cycle', () => {
    // At 2026-07-14T18:30:00Z, UTC date is July 14, but Asia/Dhaka (UTC+6) is ALREADY 2026-07-15 00:30!
    const at1830Utc = new Date('2026-07-14T18:30:00.000Z');
    const dhakaDateAt1830 = getDhakaDateString(at1830Utc);
    assert(dhakaDateAt1830 === '2026-07-15', `18:30 UTC on Jul 14 must be 2026-07-15 in Dhaka, got ${dhakaDateAt1830}`);

    // At 2026-07-14T17:59:59Z, Asia/Dhaka is 23:59:59 on 2026-07-14 (LAST day of billingDay=15 cycle)
    const at1759Utc = new Date('2026-07-14T17:59:59.000Z');
    const lastDayTiming = getDhakaBillingCycleTiming(at1759Utc, 15);
    assert(lastDayTiming.todayDhaka === '2026-07-14', `Expected 2026-07-14 Dhaka, got ${lastDayTiming.todayDhaka}`);
    assert(lastDayTiming.cycleStartDate === '2026-06-15', `Expected cycle start 2026-06-15, got ${lastDayTiming.cycleStartDate}`);
    assert(lastDayTiming.cycleEndDate === '2026-07-14', `Expected cycle end 2026-07-14, got ${lastDayTiming.cycleEndDate}`);
    assert(lastDayTiming.cycleDaysElapsed === 30, `Last day elapsed should be 30, got ${lastDayTiming.cycleDaysElapsed}`);
    assert(lastDayTiming.cycleDaysRemaining === 0, `Last day remaining should be 0, got ${lastDayTiming.cycleDaysRemaining}`);

    // 30 minutes later at 18:30 UTC -> FIRST day of next billingDay=15 cycle in Dhaka
    const firstDayTiming = getDhakaBillingCycleTiming(at1830Utc, 15);
    assert(firstDayTiming.cycleStartDate === '2026-07-15', `Expected new cycle start 2026-07-15, got ${firstDayTiming.cycleStartDate}`);
    assert(firstDayTiming.cycleEndDate === '2026-08-14', `Expected new cycle end 2026-08-14, got ${firstDayTiming.cycleEndDate}`);
    assert(firstDayTiming.cycleDaysElapsed === 1, `First day elapsed should be 1, got ${firstDayTiming.cycleDaysElapsed}`);
    assert(firstDayTiming.cycleDaysRemaining === 30, `First day remaining should be 30 (31-day cycle), got ${firstDayTiming.cycleDaysRemaining}`);

    const win = getBillingCycleWindow(at1830Utc, 15);
    assert(win.cycleStartDate === '2026-07-15' && win.cycleDaysElapsed === 1, 'getBillingCycleWindow must honor Asia/Dhaka instant');

    const metricsAt1830 = computeMeterUsageMetrics([], 3.0, at1830Utc, 15);
    assert(metricsAt1830.timezone === 'Asia/Dhaka', 'Expected timezone Asia/Dhaka');
    assert(metricsAt1830.cycleStartDate === '2026-07-15', 'Metrics must start new Dhaka cycle at 18:30 UTC');
    assert(metricsAt1830.cycleDaysElapsed === 1 && metricsAt1830.cycleDaysRemaining === 30, 'Expected Day 1 / 30 remaining');
  });

  await runGroup('4. Deterministic 80%/100% alerts & Lifeline 50->51 kWh cliff awareness', () => {
    const bill50 = TariffCalculator.calculateCost(50, 2.0, 'SLAB', undefined, { billingPeriod: '2026-06-15' }).grossTotalBDT;
    const bill51 = TariffCalculator.calculateCost(51, 2.0, 'SLAB', undefined, { billingPeriod: '2026-06-15' }).grossTotalBDT;
    const expectedJump = Number((bill51 - bill50).toFixed(2));
    assert(expectedJump > 30, `Expected dramatic 50->51 kWh cliff jump (>৳30), got ৳${expectedJump}`);

    // Near 50 kWh (42 kWh = 84% of Lifeline)
    const lifeline80 = TariffCalculator.analyzeSlabThreshold(42, 15, 30, 2.0, undefined, '2026-06-15');
    const alert80 = lifeline80.slabAlerts.find((a) => a.level === '80_PERCENT' && a.thresholdKwh === 50);
    assert(alert80 && alert80.isLifelineCliff === true, 'Expected Lifeline cliff flag at 42 kWh');
    assert(alert80.messageEn.includes('ALL units'), 'Alert must state ALL units move to normal slab rates');
    assert(
      alert80.lifeline50BillBDT === bill50 &&
      alert80.lifeline51BillBDT === bill51 &&
      alert80.lifelineCliffJumpBDT === expectedJump,
      'Alert must include exact 50 vs 51 kWh bills and difference'
    );

    // At 50 kWh (100% Lifeline)
    const lifeline100 = TariffCalculator.analyzeSlabThreshold(50, 15, 30, 2.0, undefined, '2026-06-15');
    const alert100 = lifeline100.slabAlerts.find((a) => a.level === '100_PERCENT' && a.thresholdKwh === 50);
    assert(alert100 && alert100.isLifelineCliff === true, 'Expected Lifeline cliff flag at 50 kWh');
    assert(alert100.messageEn.includes(bill50.toFixed(2)) && alert100.messageEn.includes(bill51.toFixed(2)), 'Expected 50 and 51 kWh amounts in message');

    // Crossed Lifeline (55 kWh) -> crossed 100% alert also explains cliff
    const crossedLifeline = TariffCalculator.analyzeSlabThreshold(55, 15, 30, 2.0, undefined, '2026-06-15');
    const crossedAlert = crossedLifeline.slabAlerts.find((a) => a.level === '100_PERCENT' && a.thresholdKwh === 50);
    assert(crossedAlert?.isLifelineCliff === true && crossedAlert.messageEn.includes('ALL'), 'Expected crossed Lifeline cliff explanation');

    // Step 2 (165 kWh -> 80% alert) & Step 2 ceiling (200 kWh -> 100% alert)
    const step2_80 = TariffCalculator.analyzeSlabThreshold(165, 18, 30, 3.0, undefined, '2026-06-15');
    assert(step2_80.slabAlerts.some((a) => a.level === '80_PERCENT' && a.thresholdKwh === 200), 'Expected 80% alert at 165 kWh');
    assert(step2_80.slabAlerts.some((a) => a.level === '100_PERCENT' && a.thresholdKwh === 75), 'Expected crossed 100% Step 1 alert at 165 kWh');
  });

  await runGroup('5. Monthly "what changed" deterministic summary', () => {
    const slabJump = TariffCalculator.compareBillingMonths({
      thisMonthKwh: 245,
      lastMonthKwh: 185,
      sanctionedLoadKw: 3.0,
      thisBillingPeriod: '2026-07-01',
      lastBillingPeriod: '2026-06-01',
    });
    assert(slabJump.hasComparison === true && slabJump.kwhDelta === 60, 'Expected +60 kWh delta');
    assert(slabJump.drivers.some((d) => d.key === 'SLAB_SHIFT'), 'Expected SLAB_SHIFT driver');

    const tariffShift = TariffCalculator.compareBillingMonths({
      thisMonthKwh: 285,
      lastMonthKwh: 285,
      sanctionedLoadKw: 4.5,
      thisBillingPeriod: '2026-06-15',
      lastBillingPeriod: '2026-05-15',
    });
    assert(tariffShift.tariffChanged === true && tariffShift.drivers.some((d) => d.key === 'TARIFF_VERSION'), 'Expected TARIFF_VERSION driver');
  });

  await runGroup('6. Persistent dismissed slab alerts per household per billing cycle (reappear next cycle)', async () => {
    const tmpStore = path.join(os.tmpdir(), `kiq-alerts-persist-${Date.now()}.json`);
    try {
      const svc1 = new MeterReadingService({ storePath: tmpStore, supabaseClient: null });
      const initial = await svc1.getDismissedSlabAlerts('hh-A', '2026-06-15');
      assert(initial.length === 0, 'Fresh household cycle should have 0 dismissed alerts');

      await svc1.dismissSlabAlert('hh-A', 'user-1', '2026-06-15', '80_PERCENT:300');

      // Re-instantiate service to confirm disk/DB persistence survives restart
      const svc2 = new MeterReadingService({ storePath: tmpStore, supabaseClient: null });
      const cycleJune = await svc2.getDismissedSlabAlerts('hh-A', '2026-06-15');
      assert(cycleJune.includes('80_PERCENT:300'), 'Dismissed alert must persist across service restart');

      // Different household in same cycle still sees the alert
      const otherHousehold = await svc2.getDismissedSlabAlerts('hh-B', '2026-06-15');
      assert(otherHousehold.length === 0, 'Alert dismissal must be isolated per household');

      // Next billing cycle (2026-07-15) -> alert REAPPEARS cleanly
      const nextCycle = await svc2.getDismissedSlabAlerts('hh-A', '2026-07-15');
      assert(nextCycle.length === 0, 'Dismissed alerts must reappear in the next billing cycle');
    } finally {
      if (fs.existsSync(tmpStore)) fs.unlinkSync(tmpStore);
    }
  });

  await runGroup('7. Share summary privacy audit: contains ONLY slab, units, projected range, daily cap (NO PII)', () => {
    const analysis = TariffCalculator.analyzeSlabThreshold(245, 18, 30, 3.0, undefined, '2026-07-01', {
      dailyUsageHistory: [12, 14, 15, 13, 14],
      readingDaysInCycle: 18,
    });

    // Simulate PII values present in app context that must NEVER leak into share summary
    const piiTokens = [
      'Tanvir Ahmed Residence',
      'DESCO-99887766',
      'House 42, Road 11, Banani',
      'MTR-55443322',
      '1234-5678-9012-3456-7890',
      '78901234567890123456',
    ];

    for (const lang of ['en', 'bn'] as const) {
      const text = buildSafeShareSummary({
        analysis,
        hasAnyUnits: true,
        language: lang,
      });

      for (const secret of piiTokens) {
        assert(!text.includes(secret), `Share summary (${lang}) leaked PII fragment: ${secret}`);
      }
      // Scan for 20-digit STS token / long numeric account number patterns (>= 6 consecutive digits)
      assert(!/\b\d{6,}\b/.test(text), `Share summary (${lang}) must not contain long account/meter/token digit runs`);
      assert(!/\d{4}-\d{4}-\d{4}/.test(text), `Share summary (${lang}) must not contain hyphenated STS tokens`);

      assert(text.includes(analysis.currentSlabName), `Share summary (${lang}) missing slab name`);
      assert(text.includes('kWh'), `Share summary (${lang}) missing units/daily cap in kWh`);
      assert(
        lang === 'en' ? text.includes('Projected:') : text.includes('সম্ভাব্য বিল:'),
        `Share summary (${lang}) missing projected range`
      );
    }
  });

  await runGroup('8. Golden bill > 200 kWh itemized breakdown & avoidable extra cost verification', () => {
    const over200 = GOLDEN_BILLS.find((b) => b.units > 200 && Boolean(b.itemizedBreakdown));
    assert(over200, 'Expected at least one golden bill > 200 kWh with itemizedBreakdown');
    assert(over200.isExample === true, 'Starter > 200 kWh itemized bill must remain marked isExample: true');

    const audit = verifyGoldenBills([over200], 1.0);
    assert(audit[0].passed === true, 'Itemized > 200 kWh golden bill should pass against TariffCalculator');

    // Cross-check avoidable extra cost: capping 245 kWh at Step 2 ceiling (200 kWh) saves calc(245) - calc(200)
    const bill245 = over200.expected_total;
    const bill200 = TariffCalculator.calculateCost(200, over200.sanctionedLoadKw ?? 3.0, 'SLAB', undefined, {
      billingPeriod: over200.month,
    }).grossTotalBDT;
    const expectedAvoidable = Number((bill245 - bill200).toFixed(2));
    const analysis245 = TariffCalculator.analyzeSlabThreshold(
      200,
      15,
      30,
      over200.sanctionedLoadKw ?? 3.0,
      undefined,
      over200.month,
      {
        // Current 200 kWh, remaining 15 days at 3 kWh/day -> projected 245 kWh
        dailyUsageHistory: [3, 3, 3, 3, 3],
        readingDaysInCycle: 15,
      }
    );
    assert(
      Math.abs(analysis245.avoidableMonthlySurchargeBDT - expectedAvoidable) < 0.05,
      `Avoidable extra cost (৳${analysis245.avoidableMonthlySurchargeBDT}) must match calc(245)-calc(200) (৳${expectedAvoidable})`
    );
  });

  await runGroup('9. WCAG AA amber contrast, icon+label warnings, calm amber & zero-LLM check', () => {
    const heroPath = path.resolve(process.cwd(), 'src/components/dashboard/SlabPredictionHero.tsx');
    const liveTabPath = path.resolve(process.cwd(), 'src/components/tabs/LiveDashboardTab.tsx');
    const heroSrc = fs.readFileSync(heroPath, 'utf8');
    const liveSrc = fs.readFileSync(liveTabPath, 'utf8');

    assert(!/\b(rose|red)-[0-9]{2,3}\b/.test(heroSrc), 'SlabPredictionHero.tsx must use calm amber, never red/rose');
    assert(!/(?<!dark:)text-amber-[3456]00\b/.test(heroSrc), 'SlabPredictionHero.tsx must not use low-contrast light-mode text-amber-300..600');
    assert(heroSrc.includes('WARNING:') && heroSrc.includes('<AlertTriangle'), 'Every warning must include both an icon and a text label');
    assert(!heroSrc.includes('@google/genai') && !heroSrc.includes('/api/ai'), 'SlabPredictionHero.tsx must never call any LLM');
    assert(heroSrc.includes('https://wa.me/?text=') && heroSrc.includes('sms:?body='), 'Must keep client-side share links');
    assert(liveSrc.includes('WARNING: High Load Advisory'), 'LiveDashboardTab warning banner must pair icon with WARNING text');
  });

  console.log('\nRESULT: All 9 hardened slab prediction test groups PASSED.\n');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
