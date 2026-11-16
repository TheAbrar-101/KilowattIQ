import {
  TariffStructure,
  CostCalculation,
  TariffType,
  SlabThresholdAnalysis,
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
   * Predictive analysis for BERC slab step-jump risks and countdown
   */
  static analyzeSlabThreshold(
    currentKwh: number,
    daysPassed: number = 18,
    totalDaysInMonth: number = 30,
    sanctionedLoadKw: number = 3.0,
    tariffConfig?: TariffStructure,
    billingPeriod?: string | Date
  ): SlabThresholdAnalysis {
    const resolvedConfig = this.resolveTariffConfig(tariffConfig, billingPeriod);
    const safeDaysPassed = Math.max(1, daysPassed);
    const safeTotalDays = Math.max(safeDaysPassed, totalDaysInMonth);
    const remainingDays = safeTotalDays - safeDaysPassed;

    const burnRateKwhPerDay = currentKwh / safeDaysPassed;
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

    if (lifelineSlab && currentKwh <= (lifelineSlab.maxKwh ?? 50)) {
      currentSlab = lifelineSlab;
      nextSlab = regularSlabs[0] || null;
    } else {
      for (let i = 0; i < regularSlabs.length; i++) {
        const slab = regularSlabs[i];
        if (currentKwh >= slab.minKwh && (slab.maxKwh === null || currentKwh <= slab.maxKwh)) {
          currentSlab = slab;
          nextSlab = regularSlabs[i + 1] || null;
          break;
        }
      }
    }

    const thresholdKwh = currentSlab.maxKwh;
    const kwhRemainingToBreach = thresholdKwh !== null ? Math.max(0, thresholdKwh - currentKwh) : 0;

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

    const maxDailyKwhToStayInSlab = remainingDays > 0 && thresholdKwh !== null
      ? Number((kwhRemainingToBreach / remainingDays).toFixed(1))
      : 0;

    // Calculate financial impact: difference between staying at current slab cap vs projected month-end bill
    const costAtCap = thresholdKwh !== null
      ? this.calculateCost(thresholdKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod }).grossTotalBDT
      : 0;
    const costAtProjected = this.calculateCost(projectedMonthEndKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, { billingPeriod }).grossTotalBDT;
    const avoidableMonthlySurchargeBDT = Math.max(0, Number((costAtProjected - costAtCap).toFixed(2)));

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
      kwhRemainingToBreach: Number(kwhRemainingToBreach.toFixed(1)),
      burnRateKwhPerDay: Number(burnRateKwhPerDay.toFixed(2)),
      projectedMonthEndKwh: Number(projectedMonthEndKwh.toFixed(1)),
      daysUntilBreach,
      projectedBreachOccurs,
      maxDailyKwhToStayInSlab,
      avoidableMonthlySurchargeBDT,
    };
  }
}

