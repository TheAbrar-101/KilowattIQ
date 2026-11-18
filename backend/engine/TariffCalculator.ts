import {
  TariffStructure,
  CostCalculation,
  TariffType,
  SlabThresholdAnalysis,
  SlabLimitAlert,
  ProjectionConfidence,
  MonthlyComparisonSummary,
  BillRoundingMode,
} from '../../shared/types/energy';
import { getActiveTariffStructure } from '../../shared/constants/bdTariffs';

/**
 * Configurable bill rounding rule:
 * - 'FINAL' (default): retains exact sub-paisa precision per slab and rounds at final line items.
 * - 'PER_SLAB': rounds each slab/component to 2 decimals before summing subtotal and VAT.
 */
export const DEFAULT_BILL_ROUNDING_MODE: BillRoundingMode = 'FINAL';

function roundCurrency(amount: number): number {
  return Number(amount.toFixed(2));
}

export class TariffCalculator {
  /**
   * Converts a tariff record returned by SupabaseService.getTariffs() (DB or fallback)
   * into a canonical TariffStructure so both code paths share the exact same
   * separate non-stacked Lifeline + progressive slab evaluation rules.
   */
  static fromTariffRecord(record: any): TariffStructure {
    const rawRules = Array.isArray(record?.rules) ? record.rules : [];
    const mappedSlabs = rawRules.map((r: any, idx: number) => ({
      step: typeof r.step_number === 'number' ? r.step_number : idx,
      minKwh: Number(r.slab_min_kwh ?? 0),
      maxKwh: r.slab_max_kwh === null || r.slab_max_kwh === undefined ? null : Number(r.slab_max_kwh),
      ratePerKwh: Number(r.rate_bdt_per_kwh),
      stepName: String(r.step_name || `Step ${idx + 1}`),
      isLifeline: Boolean(r.is_lifeline || String(r.step_name || '').toLowerCase().includes('lifeline')),
    }));

    return {
      id: String(record?.tariff_code || record?.id || 'DESCO-LTA'),
      version_id: record?.tariff_code || record?.version_id,
      effective_from: record?.effective_date || record?.effective_from,
      source_note: record?.source_note,
      last_verified_date: record?.last_verified_date ?? null,
      charges_verified: Boolean(record?.charges_verified),
      utilityName: String(record?.utility_provider || 'DESCO'),
      tariffType: 'SLAB',
      slabs: mappedSlabs,
      flatRatePerKwh: Number(record?.flat_rate_per_kwh ?? 9.85),
      demandChargePerKw: Number(record?.demand_charge_per_kw_bdt ?? 42.0),
      meterRent: Number(record?.meter_rent_bdt ?? 40.0),
      vatPercent: Number(record?.vat_percentage ?? 5.0),
    };
  }

  /**
   * Resolves the effective TariffStructure for a given billingPeriod when no explicit
   * tariffConfig override is supplied.
   */
  private static resolveTariffConfig(
    tariffConfig?: TariffStructure,
    billingPeriod?: string | Date
  ): TariffStructure {
    if (tariffConfig) {
      return tariffConfig;
    }
    return getActiveTariffStructure(billingPeriod);
  }

  /**
   * Calculates comprehensive electricity bill breakdown in BDT.
   *
   * LIFELINE RULE (Documented):
   * - Lifeline (0 - 50 kWh) is treated as a SEPARATE rule, NOT stacked on Step 1.
   * - If monthly usage <= 50 kWh: apply the Lifeline rate across all kWh consumed.
   * - Otherwise (> 50 kWh): skip the Lifeline tier and evaluate the entire usage
   *   through the progressive slab structure starting from Step 1 (0 - 75 kWh).
   */
  static calculateCost(
    kwhConsumption: number,
    sanctionedLoadKw: number = 3.0,
    tariffType: TariffType = 'SLAB',
    tariffConfig?: TariffStructure,
    options?: {
      isPeakHourRatio?: number;
      seasonMultiplier?: number;
      billingPeriod?: string | Date;
      roundingMode?: BillRoundingMode;
    }
  ): CostCalculation {
    const resolvedConfig = this.resolveTariffConfig(tariffConfig, options?.billingPeriod);
    const roundingMode: BillRoundingMode = options?.roundingMode ?? DEFAULT_BILL_ROUNDING_MODE;
    const totalKwh = Math.max(0, kwhConsumption);
    let energyCostBDT = 0;
    const slabBreakdown: Array<{ stepName: string; kwhInSlab: number; rate: number; costBDT: number }> = [];

    if (tariffType === 'SLAB') {
      const lifelineSlab = resolvedConfig.slabs.find(
        s => s.isLifeline || s.stepName.toLowerCase().includes('lifeline')
      );
      const regularSlabs = resolvedConfig.slabs.filter(
        s => !s.isLifeline && !s.stepName.toLowerCase().includes('lifeline')
      );

      // Separate Lifeline rule: applies ONLY when total monthly usage <= 50 kWh
      if (lifelineSlab && totalKwh <= (lifelineSlab.maxKwh ?? 50)) {
        const rawCostForLifeline = totalKwh * lifelineSlab.ratePerKwh;
        const roundedLifelineCost = roundCurrency(rawCostForLifeline);
        energyCostBDT = roundingMode === 'PER_SLAB' ? roundedLifelineCost : rawCostForLifeline;
        slabBreakdown.push({
          stepName: lifelineSlab.stepName,
          kwhInSlab: roundCurrency(totalKwh),
          rate: lifelineSlab.ratePerKwh,
          costBDT: roundedLifelineCost,
        });
      } else {
        // Above 50 kWh: use the progressive Step 1..6 slab structure (not stacked on Lifeline)
        let remainingKwh = totalKwh;

        for (const slab of regularSlabs) {
          if (remainingKwh <= 0) break;

          const maxInSlab = slab.maxKwh !== null ? (slab.maxKwh - slab.minKwh) : Infinity;
          const kwhInSlab = Math.min(remainingKwh, maxInSlab);
          const rawCostForSlab = kwhInSlab * slab.ratePerKwh;
          const roundedSlabCost = roundCurrency(rawCostForSlab);

          energyCostBDT += roundingMode === 'PER_SLAB' ? roundedSlabCost : rawCostForSlab;
          slabBreakdown.push({
            stepName: slab.stepName,
            kwhInSlab: roundCurrency(kwhInSlab),
            rate: slab.ratePerKwh,
            costBDT: roundedSlabCost,
          });

          remainingKwh -= kwhInSlab;
        }
      }
    } else if (tariffType === 'FLAT') {
      const rawFlat = totalKwh * resolvedConfig.flatRatePerKwh;
      energyCostBDT = roundingMode === 'PER_SLAB' ? roundCurrency(rawFlat) : rawFlat;
    } else if (tariffType === 'TOU') {
      const peakRatio = options?.isPeakHourRatio ?? 0.25; // Default ~25% consumption during peak 17:00-23:00
      const peakKwh = totalKwh * peakRatio;
      const offPeakKwh = totalKwh * (1 - peakRatio);

      const peakRate = resolvedConfig.touRates?.peakRate ?? 12.10;
      const offPeakRate = resolvedConfig.touRates?.offPeakRate ?? 7.05;

      const rawPeak = peakKwh * peakRate;
      const rawOffPeak = offPeakKwh * offPeakRate;
      energyCostBDT = roundingMode === 'PER_SLAB'
        ? roundCurrency(roundCurrency(rawPeak) + roundCurrency(rawOffPeak))
        : (rawPeak + rawOffPeak);
    } else if (tariffType === 'SEASONAL') {
      const multiplier = options?.seasonMultiplier ?? 1.0;
      // Calculate base slab and apply seasonal multiplier
      const baseCalc = this.calculateCost(totalKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, {
        ...options,
        roundingMode,
      });
      const rawSeasonal = baseCalc.energyCostBDT * multiplier;
      energyCostBDT = roundingMode === 'PER_SLAB' ? roundCurrency(rawSeasonal) : rawSeasonal;
    }

    const rawDemandCharge = sanctionedLoadKw * resolvedConfig.demandChargePerKw;
    const rawMeterRent = resolvedConfig.meterRent;
    const demandChargeBDT = roundingMode === 'PER_SLAB' ? roundCurrency(rawDemandCharge) : rawDemandCharge;
    const meterRentBDT = roundingMode === 'PER_SLAB' ? roundCurrency(rawMeterRent) : rawMeterRent;

    const rawSubtotal = energyCostBDT + demandChargeBDT + meterRentBDT;
    const subtotal = roundingMode === 'PER_SLAB' ? roundCurrency(rawSubtotal) : rawSubtotal;
    const rawVat = subtotal * (resolvedConfig.vatPercent / 100);
    const vatBDT = roundingMode === 'PER_SLAB' ? roundCurrency(rawVat) : rawVat;
    const grossTotalBDT = roundingMode === 'PER_SLAB'
      ? roundCurrency(subtotal + vatBDT)
      : (subtotal + vatBDT);
    const effectiveRate = totalKwh > 0 ? grossTotalBDT / totalKwh : 0;

    return {
      tariffType,
      tariffVersionId: resolvedConfig.version_id || resolvedConfig.id,
      effectiveFrom: resolvedConfig.effective_from,
      lastVerifiedDate: resolvedConfig.last_verified_date,
      roundingMode,
      totalKwh: roundCurrency(totalKwh),
      energyCostBDT: roundCurrency(energyCostBDT),
      slabBreakdown,
      demandChargeBDT: roundCurrency(demandChargeBDT),
      meterRentBDT: roundCurrency(meterRentBDT),
      subtotalBDT: roundCurrency(subtotal),
      vatBDT: roundCurrency(vatBDT),
      grossTotalBDT: roundCurrency(grossTotalBDT),
      effectiveRatePerKwh: roundCurrency(effectiveRate),
    };
  }

  /**
   * Predictive analysis for BERC slab step-jump risks, daily cap, avoidable cost,
   * projection confidence range (low/expected/high from cycle history, requiring >= 5 reading days),
   * and 80%/100% in-app alerts with Lifeline 50 -> 51 kWh cliff awareness.
   */
  static analyzeSlabThreshold(
    currentKwh: number,
    daysPassed: number = 18,
    totalDaysInMonth: number = 30,
    sanctionedLoadKw: number = 3.0,
    tariffConfig?: TariffStructure,
    billingPeriod?: string | Date,
    confidenceContext?: {
      dailyUsageHistory?: number[];
      readingDaysInCycle?: number;
    }
  ): SlabThresholdAnalysis {
    const resolvedConfig = this.resolveTariffConfig(tariffConfig, billingPeriod);
    const safeUnits = Math.max(0, Number(currentKwh || 0));
    const safeDaysPassed = Math.max(1, Math.round(daysPassed));
    const safeTotalDays = Math.max(safeDaysPassed, Math.round(totalDaysInMonth));
    const remainingDays = Math.max(0, safeTotalDays - safeDaysPassed);

    const burnRateKwhPerDay = safeUnits / safeDaysPassed;
    const projectedMonthEndKwh = burnRateKwhPerDay * safeTotalDays;

    const lifelineSlab = resolvedConfig.slabs.find(
      s => s.isLifeline || s.stepName.toLowerCase().includes('lifeline')
    );
    const regularSlabs = resolvedConfig.slabs.filter(
      s => !s.isLifeline && !s.stepName.toLowerCase().includes('lifeline')
    );

    // Determine current active slab (respecting separate Lifeline <= 50 kWh rule)
    let currentSlab = regularSlabs[0] || resolvedConfig.slabs[0];
    let nextSlab = regularSlabs[1] || null;
    let currentRegularIdx = 0;
    let isInLifeline = false;

    if (lifelineSlab && safeUnits <= (lifelineSlab.maxKwh ?? 50)) {
      currentSlab = lifelineSlab;
      nextSlab = regularSlabs[0] || null;
      isInLifeline = true;
    } else {
      for (let i = 0; i < regularSlabs.length; i++) {
        const slab = regularSlabs[i];
        if (safeUnits >= slab.minKwh && (slab.maxKwh === null || safeUnits <= slab.maxKwh)) {
          currentSlab = slab;
          nextSlab = regularSlabs[i + 1] || null;
          currentRegularIdx = i;
          break;
        }
      }
    }

    const thresholdKwh = currentSlab.maxKwh;
    const kwhRemainingToBreach = thresholdKwh !== null ? Math.max(0, thresholdKwh - safeUnits) : 0;
    const slabUtilizationPercent =
      thresholdKwh !== null && thresholdKwh > 0
        ? Number(((safeUnits / thresholdKwh) * 100).toFixed(1))
        : 100;

    let daysUntilBreach: number | null = null;
    if (thresholdKwh !== null && burnRateKwhPerDay > 0) {
      daysUntilBreach = Number((kwhRemainingToBreach / burnRateKwhPerDay).toFixed(1));
    }

    const projectedBreachOccurs = thresholdKwh !== null && projectedMonthEndKwh > thresholdKwh;

    const currentRateBDT = currentSlab.ratePerKwh;
    const nextRateBDT = nextSlab ? nextSlab.ratePerKwh : null;
    const rateJumpPercentage = nextRateBDT
      ? Number((((nextRateBDT - currentRateBDT) / currentRateBDT) * 100).toFixed(1))
      : 0;

    const maxDailyKwhToStayInSlab =
      remainingDays > 0 && thresholdKwh !== null
        ? Number((kwhRemainingToBreach / remainingDays).toFixed(1))
        : thresholdKwh !== null && remainingDays === 0
          ? Number(kwhRemainingToStayAtZero(kwhRemainingToBreach))
          : 0;

    const MIN_PROJECTION_READING_DAYS = 5;
    const validDailyHistory = Array.isArray(confidenceContext?.dailyUsageHistory)
      ? confidenceContext.dailyUsageHistory.filter((n) => Number.isFinite(n) && n >= 0)
      : [];
    const readingDaysInCycle =
      confidenceContext?.readingDaysInCycle !== undefined
        ? Math.max(0, Math.floor(confidenceContext.readingDaysInCycle))
        : safeDaysPassed;
    const hasEnoughData = readingDaysInCycle >= MIN_PROJECTION_READING_DAYS && safeDaysPassed >= 1;

    let lowDailyRate: number;
    let expectedDailyRate: number;
    let highDailyRate: number;

    if (validDailyHistory.length >= 2) {
      const meanDaily = validDailyHistory.reduce((acc, v) => acc + v, 0) / validDailyHistory.length;
      const variance =
        validDailyHistory.reduce((acc, v) => acc + Math.pow(v - meanDaily, 2), 0) /
        validDailyHistory.length;
      const stdDev = Math.sqrt(variance);
      expectedDailyRate = meanDaily;
      lowDailyRate = Math.max(0, meanDaily - stdDev);
      highDailyRate = meanDaily + stdDev;
    } else if (validDailyHistory.length === 1) {
      expectedDailyRate = validDailyHistory[0];
      lowDailyRate = validDailyHistory[0] * 0.85;
      highDailyRate = validDailyHistory[0] * 1.15;
    } else {
      expectedDailyRate = burnRateKwhPerDay;
      lowDailyRate = burnRateKwhPerDay * 0.85;
      highDailyRate = burnRateKwhPerDay * 1.15;
    }

    const lowKwh = Number((safeUnits + lowDailyRate * remainingDays).toFixed(1));
    const expectedKwh =
      validDailyHistory.length > 0
        ? Number((safeUnits + expectedDailyRate * remainingDays).toFixed(1))
        : Number(projectedMonthEndKwh.toFixed(1));
    const highKwh = Number((safeUnits + highDailyRate * remainingDays).toFixed(1));

    const currentCalc = this.calculateCost(safeUnits, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod });
    const lowCalc = this.calculateCost(lowKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod });
    const expectedCalc = this.calculateCost(expectedKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod });
    const highCalc = this.calculateCost(highKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod });

    const projectionConfidence: ProjectionConfidence = {
      hasEnoughData,
      readingDaysInCycle,
      minimumReadingDaysRequired: MIN_PROJECTION_READING_DAYS,
      lowKwh,
      expectedKwh,
      highKwh,
      lowBillBDT: lowCalc.grossTotalBDT,
      expectedBillBDT: expectedCalc.grossTotalBDT,
      highBillBDT: highCalc.grossTotalBDT,
      rangeLabelEn: hasEnoughData
        ? `Projected: ৳${Math.round(lowCalc.grossTotalBDT)} to ৳${Math.round(highCalc.grossTotalBDT)}, likely ৳${Math.round(expectedCalc.grossTotalBDT)}`
        : `Not enough data yet (${readingDaysInCycle}/${MIN_PROJECTION_READING_DAYS} days of readings in this cycle)`,
      rangeLabelBn: hasEnoughData
        ? `সম্ভাব্য: ৳${Math.round(lowCalc.grossTotalBDT)} থেকে ৳${Math.round(highCalc.grossTotalBDT)}, মূলত ৳${Math.round(expectedCalc.grossTotalBDT)}`
        : `এখনো পর্যাপ্ত ডেটা নেই (${readingDaysInCycle}/${MIN_PROJECTION_READING_DAYS} দিনের রিডিং হয়েছে)`,
    };

    const effectiveProjectedKwh = expectedKwh;
    const effectiveProjectedBreach =
      thresholdKwh !== null && effectiveProjectedKwh > thresholdKwh;

    const costAtCap = thresholdKwh !== null
      ? this.calculateCost(thresholdKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod }).grossTotalBDT
      : 0;
    const avoidableMonthlySurchargeBDT =
      thresholdKwh !== null
        ? Math.max(0, Number((expectedCalc.grossTotalBDT - costAtCap).toFixed(2)))
        : 0;

    // Precompute Lifeline 50 -> 51 kWh cliff impact deterministically
    const lifelineCutoff = lifelineSlab?.maxKwh ?? 50;
    const billAt50 = this.calculateCost(lifelineCutoff, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod }).grossTotalBDT;
    const billAt51 = this.calculateCost(lifelineCutoff + 1, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod }).grossTotalBDT;
    const lifelineCliffJumpBDT = Number((billAt51 - billAt50).toFixed(2));
    const step1Rate = regularSlabs[0]?.ratePerKwh ?? nextRateBDT ?? currentRateBDT;

    // Build deterministic 80% and 100% slab limit alerts (calm amber protocol + Lifeline cliff details)
    const slabAlerts: SlabLimitAlert[] = [];

    if (thresholdKwh !== null && safeUnits >= thresholdKwh) {
      slabAlerts.push({
        level: '100_PERCENT',
        thresholdKwh,
        utilizationPercent: slabUtilizationPercent,
        crossedSlabName: currentSlab.stepName,
        isLifelineCliff: isInLifeline,
        ...(isInLifeline
          ? {
              lifeline50BillBDT: billAt50,
              lifeline51BillBDT: billAt51,
              lifelineCliffJumpBDT,
            }
          : {}),
        titleEn: isInLifeline
          ? `Lifeline Cliff: 100% of ${lifelineCutoff} kWh Limit Reached`
          : `100% of ${currentSlab.stepName} Limit Reached (${safeUnits.toFixed(1)} / ${thresholdKwh} kWh)`,
        titleBn: isInLifeline
          ? `লাইফলাইন সীমা: ${lifelineCutoff} kWh-এর ১০০% পূর্ণ হয়েছে`
          : `${currentSlab.stepName} সীমার ১০০% পূর্ণ হয়েছে (${safeUnits.toFixed(1)} / ${thresholdKwh} kWh)`,
        messageEn: isInLifeline
          ? `Crossing ${lifelineCutoff} kWh moves ALL units (from unit 1) to normal Step 1 slab rates (৳${step1Rate.toFixed(2)}/kWh). Bill jumps from ৳${billAt50.toFixed(2)} (${lifelineCutoff} kWh) to ৳${billAt51.toFixed(2)} (${lifelineCutoff + 1} kWh) — +৳${lifelineCliffJumpBDT.toFixed(2)} for 1 kWh.`
          : `You are right at the ${thresholdKwh} kWh ceiling. Next units enter ${nextSlab?.stepName || 'the next tier'} at ৳${(nextRateBDT ?? currentRateBDT).toFixed(2)}/kWh.`,
        messageBn: isInLifeline
          ? `${lifelineCutoff} kWh অতিক্রম করলে ১ম ইউনিট থেকেই সব ইউনিট সাধারণ ধাপ ১ হারে (৳${step1Rate.toFixed(2)}/ইউনিট) হিসাব হবে। বিল ${lifelineCutoff} kWh-এ ৳${billAt50.toFixed(2)} থেকে ${lifelineCutoff + 1} kWh-এ ৳${billAt51.toFixed(2)} হবে (+৳${lifelineCliffJumpBDT.toFixed(2)} বৃদ্ধি)।`
          : `আপনি ${thresholdKwh} kWh সীমায় পৌঁছেছেন। এর পরের ইউনিটগুলোতে ৳${(nextRateBDT ?? currentRateBDT).toFixed(2)}/kWh হার প্রযোজ্য হবে।`,
      });
    } else if (thresholdKwh !== null && safeUnits >= thresholdKwh * 0.8) {
      slabAlerts.push({
        level: '80_PERCENT',
        thresholdKwh,
        utilizationPercent: slabUtilizationPercent,
        isLifelineCliff: isInLifeline,
        ...(isInLifeline
          ? {
              lifeline50BillBDT: billAt50,
              lifeline51BillBDT: billAt51,
              lifelineCliffJumpBDT,
            }
          : {}),
        titleEn: isInLifeline
          ? `Lifeline Cliff Warning: ${slabUtilizationPercent}% of ${lifelineCutoff} kWh Used`
          : `80%+ of ${currentSlab.stepName} Limit Used (${slabUtilizationPercent}%)`,
        titleBn: isInLifeline
          ? `লাইফলাইন সীমা সতর্কতা: ${lifelineCutoff} kWh-এর ${slabUtilizationPercent}% ব্যবহৃত`
          : `${currentSlab.stepName} সীমার ৮০%+ ব্যবহৃত হয়েছে (${slabUtilizationPercent}%)`,
        messageEn: isInLifeline
          ? `${kwhRemainingToBreach.toFixed(1)} kWh left before ${lifelineCutoff} kWh. Crossing ${lifelineCutoff} kWh moves ALL units to normal slab rates (৳${billAt50.toFixed(2)} at 50 kWh vs ৳${billAt51.toFixed(2)} at 51 kWh, +৳${lifelineCliffJumpBDT.toFixed(2)} jump). Cap daily use at ${maxDailyKwhToStayInSlab.toFixed(1)} kWh/day.`
          : `${kwhRemainingToBreach.toFixed(1)} kWh remaining before ${nextSlab?.stepName || 'next slab'}${nextRateBDT ? ` (৳${nextRateBDT.toFixed(2)}/kWh)` : ''}. Keep daily use at or below ${maxDailyKwhToStayInSlab.toFixed(1)} kWh/day.`,
        messageBn: isInLifeline
          ? `${lifelineCutoff} kWh সীমার আগে আর ${kwhRemainingToBreach.toFixed(1)} kWh বাকি। ${lifelineCutoff} kWh পেরোলে সব ইউনিট সাধারণ স্ল্যাবে যাবে (${lifelineCutoff} kWh-এ ৳${billAt50.toFixed(2)} বনাম ${lifelineCutoff + 1} kWh-এ ৳${billAt51.toFixed(2)}, +৳${lifelineCliffJumpBDT.toFixed(2)})। দৈনিক ${maxDailyKwhToStayInSlab.toFixed(1)} kWh-এর নিচে রাখুন।`
          : `পরবর্তী স্ল্যাবে যাওয়ার আগে আর ${kwhRemainingToBreach.toFixed(1)} kWh বাকি আছে। বর্তমান ধাপে থাকতে দৈনিক সর্বোচ্চ ${maxDailyKwhToStayInSlab.toFixed(1)} kWh ব্যবহার করুন।`,
      });
    }

    // If usage has already crossed 100% of a previous slab ceiling (e.g. >50, >75, >200, >300, >400, >600 kWh)
    if (!isInLifeline) {
      const crossedSlab =
        currentRegularIdx > 0
          ? regularSlabs[currentRegularIdx - 1]
          : lifelineSlab && safeUnits > lifelineCutoff
            ? lifelineSlab
            : null;

      if (crossedSlab && crossedSlab.maxKwh !== null && safeUnits > crossedSlab.maxKwh) {
        const crossedLifeline = Boolean(
          crossedSlab.isLifeline || crossedSlab.stepName.toLowerCase().includes('lifeline')
        );
        slabAlerts.push({
          level: '100_PERCENT',
          thresholdKwh: crossedSlab.maxKwh,
          utilizationPercent: Number(((safeUnits / crossedSlab.maxKwh) * 100).toFixed(1)),
          crossedSlabName: crossedSlab.stepName,
          isLifelineCliff: crossedLifeline,
          ...(crossedLifeline
            ? {
                lifeline50BillBDT: billAt50,
                lifeline51BillBDT: billAt51,
                lifelineCliffJumpBDT,
              }
            : {}),
          titleEn: crossedLifeline
            ? `Crossed Lifeline Cliff (${crossedSlab.maxKwh} kWh Limit)`
            : `Crossed 100% of ${crossedSlab.stepName} (${crossedSlab.maxKwh} kWh Limit)`,
          titleBn: crossedLifeline
            ? `লাইফলাইন সীমা (${crossedSlab.maxKwh} kWh) অতিক্রান্ত হয়েছে`
            : `${crossedSlab.stepName} (${crossedSlab.maxKwh} kWh) সীমার ১০০% অতিক্রান্ত হয়েছে`,
          messageEn: crossedLifeline
            ? `Crossing ${crossedSlab.maxKwh} kWh moved ALL ${safeUnits.toFixed(1)} units out of Lifeline to normal Step 1+ slab rates (৳${billAt50.toFixed(2)} at 50 kWh vs ৳${billAt51.toFixed(2)} at 51 kWh, +৳${lifelineCliffJumpBDT.toFixed(2)} cliff jump).`
            : `Usage this cycle passed ${crossedSlab.maxKwh} kWh and is now billed under ${currentSlab.stepName} at ৳${currentRateBDT.toFixed(2)}/kWh.`,
          messageBn: crossedLifeline
            ? `${crossedSlab.maxKwh} kWh ছাড়ানোয় সবগুলো ${safeUnits.toFixed(1)} ইউনিট লাইফলাইন থেকে সাধারণ ধাপ ১+ হারে চলে গেছে (${lifelineCutoff} kWh-এ ৳${billAt50.toFixed(2)} বনাম ${lifelineCutoff + 1} kWh-এ ৳${billAt51.toFixed(2)}, +৳${lifelineCliffJumpBDT.toFixed(2)} পার্থক্য)।`
            : `এই চক্রে ব্যবহার ${crossedSlab.maxKwh} kWh ছাড়িয়েছে; এখন ${currentSlab.stepName} (৳${currentRateBDT.toFixed(2)}/kWh) ধাপ সক্রিয় রয়েছে।`,
        });
      }
    }

    return {
      tariffVersionId: resolvedConfig.version_id || resolvedConfig.id,
      effectiveFrom: resolvedConfig.effective_from,
      lastVerifiedDate: resolvedConfig.last_verified_date,
      currentSlabName: currentSlab.stepName,
      currentRateBDT,
      nextSlabName: nextSlab ? nextSlab.stepName : null,
      nextRateBDT,
      rateJumpPercentage,
      thresholdKwh,
      unitsUsedThisMonth: Number(safeUnits.toFixed(2)),
      kwhRemainingToBreach: Number(kwhRemainingToBreach.toFixed(1)),
      slabUtilizationPercent,
      burnRateKwhPerDay: Number(burnRateKwhPerDay.toFixed(2)),
      projectedMonthEndKwh: effectiveProjectedKwh,
      currentBillBDT: currentCalc.grossTotalBDT,
      projectedBillBDT: expectedCalc.grossTotalBDT,
      projectionConfidence,
      daysPassed: safeDaysPassed,
      totalDaysInCycle: safeTotalDays,
      daysLeftInCycle: remainingDays,
      daysUntilBreach,
      projectedBreachOccurs: effectiveProjectedBreach,
      maxDailyKwhToStayInSlab,
      avoidableMonthlySurchargeBDT,
      slabAlerts,
    };
  }

  /**
   * Deterministic plain-language comparison between this billing cycle/month and last month.
   * Never uses LLM text generation — all numbers and causes come strictly from TariffCalculator.
   */
  static compareBillingMonths(params: {
    thisMonthKwh: number;
    lastMonthKwh: number | null;
    sanctionedLoadKw?: number;
    thisBillingPeriod?: string | Date;
    lastBillingPeriod?: string | Date;
    tariffConfig?: TariffStructure;
  }): MonthlyComparisonSummary {
    const loadKw = params.sanctionedLoadKw ?? 3.0;
    const thisKwh = Math.max(0, Number(params.thisMonthKwh || 0));
    const thisCalc = this.calculateCost(thisKwh, loadKw, 'SLAB', params.tariffConfig, {
      billingPeriod: params.thisBillingPeriod,
    });
    const thisSlab = this.analyzeSlabThreshold(
      thisKwh,
      30,
      30,
      loadKw,
      params.tariffConfig,
      params.thisBillingPeriod
    );
    const thisVer = thisCalc.tariffVersionId || 'BERC-LTA';

    if (params.lastMonthKwh === null || params.lastMonthKwh === undefined || !Number.isFinite(params.lastMonthKwh)) {
      return {
        hasComparison: false,
        thisMonthKwh: Number(thisKwh.toFixed(1)),
        lastMonthKwh: null,
        kwhDelta: null,
        kwhDeltaPercent: null,
        thisMonthBillBDT: thisCalc.grossTotalBDT,
        lastMonthBillBDT: null,
        billDeltaBDT: null,
        tariffChanged: false,
        thisTariffVersionId: thisVer,
        lastTariffVersionId: null,
        thisSlabName: thisSlab.currentSlabName,
        lastSlabName: null,
        drivers: [],
        summaryEn: 'Not enough readings from the previous billing cycle yet to compare month-over-month changes.',
        summaryBn: 'গত বিলিং চক্রের সাথে তুলনা করার জন্য এখনো পর্যাপ্ত আগের রিডিং সংরক্ষিত নেই।',
      };
    }

    const lastKwh = Math.max(0, Number(params.lastMonthKwh));
    const lastCalc = this.calculateCost(lastKwh, loadKw, 'SLAB', params.tariffConfig, {
      billingPeriod: params.lastBillingPeriod,
    });
    const lastSlab = this.analyzeSlabThreshold(
      lastKwh,
      30,
      30,
      loadKw,
      params.tariffConfig,
      params.lastBillingPeriod
    );
    const lastVer = lastCalc.tariffVersionId || 'BERC-LTA';

    const kwhDelta = Number((thisKwh - lastKwh).toFixed(1));
    const kwhDeltaPercent =
      lastKwh > 0 ? Number(((kwhDelta / lastKwh) * 100).toFixed(1)) : null;
    const billDeltaBDT = Number((thisCalc.grossTotalBDT - lastCalc.grossTotalBDT).toFixed(2));
    const tariffChanged = thisVer !== lastVer;
    const slabChanged = thisSlab.currentSlabName !== lastSlab.currentSlabName;

    // Decompose bill change deterministically: usage impact at old tariff vs rate impact
    const thisKwhAtLastTariff = this.calculateCost(thisKwh, loadKw, 'SLAB', params.tariffConfig, {
      billingPeriod: params.lastBillingPeriod,
    }).grossTotalBDT;
    const usageImpactBDT = Number((thisKwhAtLastTariff - lastCalc.grossTotalBDT).toFixed(2));
    const tariffImpactBDT = Number((thisCalc.grossTotalBDT - thisKwhAtLastTariff).toFixed(2));

    const drivers: MonthlyComparisonSummary['drivers'] = [];
    if (Math.abs(kwhDelta) >= 0.5) {
      const dirEn = kwhDelta > 0 ? 'up' : 'down';
      const dirBn = kwhDelta > 0 ? 'বেড়েছে' : 'কমেছে';
      drivers.push({
        key: 'USAGE_CHANGE',
        labelEn: `Usage ${dirEn} by ${Math.abs(kwhDelta).toFixed(1)} kWh${kwhDeltaPercent !== null ? ` (${kwhDelta > 0 ? '+' : ''}${kwhDeltaPercent}%)` : ''}`,
        labelBn: `বিদ্যুৎ ব্যবহার ${Math.abs(kwhDelta).toFixed(1)} kWh ${dirBn}`,
        impactBDT: usageImpactBDT,
      });
    } else {
      drivers.push({
        key: 'USAGE_STEADY',
        labelEn: 'Usage stayed nearly unchanged vs last cycle',
        labelBn: 'ব্যবহার প্রায় গত মাসের মতোই ছিল',
        impactBDT: 0,
      });
    }

    if (slabChanged) {
      drivers.push({
        key: 'SLAB_SHIFT',
        labelEn: `Moved from ${lastSlab.currentSlabName} to ${thisSlab.currentSlabName}`,
        labelBn: `${lastSlab.currentSlabName} থেকে ${thisSlab.currentSlabName} ধাপে পরিবর্তন হয়েছে`,
      });
    }

    if (tariffChanged && Math.abs(tariffImpactBDT) >= 1) {
      drivers.push({
        key: 'TARIFF_VERSION',
        labelEn: `Tariff update (${lastVer} → ${thisVer}) added ৳${Math.abs(tariffImpactBDT).toFixed(0)}`,
        labelBn: `ট্যারিফ হালনাগাদ (${lastVer} → ${thisVer}) বাবদ ৳${Math.abs(tariffImpactBDT).toFixed(0)} পরিবর্তন`,
        impactBDT: tariffImpactBDT,
      });
    }

    const billDirEn =
      billDeltaBDT > 1
        ? `up ৳${Math.abs(billDeltaBDT).toFixed(0)}`
        : billDeltaBDT < -1
          ? `down ৳${Math.abs(billDeltaBDT).toFixed(0)}`
          : 'nearly unchanged';
    const billDirBn =
      billDeltaBDT > 1
        ? `৳${Math.abs(billDeltaBDT).toFixed(0)} বেড়েছে`
        : billDeltaBDT < -1
          ? `৳${Math.abs(billDeltaBDT).toFixed(0)} কমেছে`
          : 'প্রায় অপরিবর্তিত রয়েছে';

    const usagePhraseEn =
      kwhDelta > 0.5
        ? `you used ${kwhDelta.toFixed(1)} kWh more (${thisKwh.toFixed(1)} vs ${lastKwh.toFixed(1)} kWh)`
        : kwhDelta < -0.5
          ? `you used ${Math.abs(kwhDelta).toFixed(1)} kWh less (${thisKwh.toFixed(1)} vs ${lastKwh.toFixed(1)} kWh)`
          : `your usage held steady around ${thisKwh.toFixed(1)} kWh`;
    const usagePhraseBn =
      kwhDelta > 0.5
        ? `ব্যবহার ${kwhDelta.toFixed(1)} kWh বেড়েছে (${lastKwh.toFixed(1)} থেকে ${thisKwh.toFixed(1)} kWh)`
        : kwhDelta < -0.5
          ? `ব্যবহার ${Math.abs(kwhDelta).toFixed(1)} kWh কমেছে (${lastKwh.toFixed(1)} থেকে ${thisKwh.toFixed(1)} kWh)`
          : `ব্যবহার প্রায় একই (${thisKwh.toFixed(1)} kWh) রয়েছে`;

    const slabPhraseEn = slabChanged
      ? `, shifting from ${lastSlab.currentSlabName} to ${thisSlab.currentSlabName}`
      : `, remaining in ${thisSlab.currentSlabName}`;
    const slabPhraseBn = slabChanged
      ? ` এবং স্ল্যাব ${lastSlab.currentSlabName} থেকে ${thisSlab.currentSlabName}-এ গেছে`
      : ` এবং আপনি ${thisSlab.currentSlabName} ধাপেই আছেন`;

    const tariffPhraseEn = tariffChanged ? ` Tariff schedule changed from ${lastVer} to ${thisVer}.` : '';
    const tariffPhraseBn = tariffChanged ? ` ট্যারিফ ${lastVer} থেকে ${thisVer}-এ পরিবর্তিত হয়েছে।` : '';

    return {
      hasComparison: true,
      thisMonthKwh: Number(thisKwh.toFixed(1)),
      lastMonthKwh: Number(lastKwh.toFixed(1)),
      kwhDelta,
      kwhDeltaPercent,
      thisMonthBillBDT: thisCalc.grossTotalBDT,
      lastMonthBillBDT: lastCalc.grossTotalBDT,
      billDeltaBDT,
      tariffChanged,
      thisTariffVersionId: thisVer,
      lastTariffVersionId: lastVer,
      thisSlabName: thisSlab.currentSlabName,
      lastSlabName: lastSlab.currentSlabName,
      drivers,
      summaryEn: `Estimated bill is ${billDirEn} (৳${thisCalc.grossTotalBDT.toFixed(0)} vs ৳${lastCalc.grossTotalBDT.toFixed(0)} last month): ${usagePhraseEn}${slabPhraseEn}.${tariffPhraseEn}`,
      summaryBn: `গত মাসের তুলনায় আনুমানিক বিল ${billDirBn} (৳${thisCalc.grossTotalBDT.toFixed(0)} বনাম ৳${lastCalc.grossTotalBDT.toFixed(0)}): ${usagePhraseBn}${slabPhraseBn}।${tariffPhraseBn}`,
    };
  }
}

function kwhRemainingToStayAtZero(remaining: number): number {
  return Number(Math.max(0, remaining).toFixed(1));
}


