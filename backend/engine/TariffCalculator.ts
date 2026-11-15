import { TariffStructure, CostCalculation, TariffType, SlabThresholdAnalysis } from '../../shared/types/energy';
import { getActiveTariffStructure } from '../../shared/constants/bdTariffs';

export class TariffCalculator {
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
    options?: { isPeakHourRatio?: number; seasonMultiplier?: number; billingPeriod?: string | Date }
  ): CostCalculation {
    const resolvedConfig = this.resolveTariffConfig(tariffConfig, options?.billingPeriod);
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
        const costForLifeline = totalKwh * lifelineSlab.ratePerKwh;
        energyCostBDT = costForLifeline;
        slabBreakdown.push({
          stepName: lifelineSlab.stepName,
          kwhInSlab: Number(totalKwh.toFixed(2)),
          rate: lifelineSlab.ratePerKwh,
          costBDT: Number(costForLifeline.toFixed(2)),
        });
      } else {
        // Above 50 kWh: use the progressive Step 1..6 slab structure (not stacked on Lifeline)
        let remainingKwh = totalKwh;

        for (const slab of regularSlabs) {
          if (remainingKwh <= 0) break;

          const maxInSlab = slab.maxKwh !== null ? (slab.maxKwh - slab.minKwh) : Infinity;
          const kwhInSlab = Math.min(remainingKwh, maxInSlab);
          const costForSlab = kwhInSlab * slab.ratePerKwh;

          energyCostBDT += costForSlab;
          slabBreakdown.push({
            stepName: slab.stepName,
            kwhInSlab: Number(kwhInSlab.toFixed(2)),
            rate: slab.ratePerKwh,
            costBDT: Number(costForSlab.toFixed(2)),
          });

          remainingKwh -= kwhInSlab;
        }
      }
    } else if (tariffType === 'FLAT') {
      energyCostBDT = totalKwh * resolvedConfig.flatRatePerKwh;
    } else if (tariffType === 'TOU') {
      const peakRatio = options?.isPeakHourRatio ?? 0.25; // Default ~25% consumption during peak 17:00-23:00
      const peakKwh = totalKwh * peakRatio;
      const offPeakKwh = totalKwh * (1 - peakRatio);

      const peakRate = resolvedConfig.touRates?.peakRate ?? 12.10;
      const offPeakRate = resolvedConfig.touRates?.offPeakRate ?? 7.05;

      energyCostBDT = (peakKwh * peakRate) + (offPeakKwh * offPeakRate);
    } else if (tariffType === 'SEASONAL') {
      const multiplier = options?.seasonMultiplier ?? 1.0;
      // Calculate base slab and apply seasonal multiplier
      const baseCalc = this.calculateCost(totalKwh, sanctionedLoadKw, 'SLAB', resolvedConfig, options);
      energyCostBDT = baseCalc.energyCostBDT * multiplier;
    }

    const demandChargeBDT = sanctionedLoadKw * resolvedConfig.demandChargePerKw;
    const meterRentBDT = resolvedConfig.meterRent;
    const subtotal = energyCostBDT + demandChargeBDT + meterRentBDT;
    const vatBDT = subtotal * (resolvedConfig.vatPercent / 100);
    const grossTotalBDT = subtotal + vatBDT;
    const effectiveRate = totalKwh > 0 ? grossTotalBDT / totalKwh : 0;

    return {
      tariffType,
      tariffVersionId: resolvedConfig.version_id || resolvedConfig.id,
      effectiveFrom: resolvedConfig.effective_from,
      lastVerifiedDate: resolvedConfig.last_verified_date,
      totalKwh: Number(totalKwh.toFixed(2)),
      energyCostBDT: Number(energyCostBDT.toFixed(2)),
      slabBreakdown,
      demandChargeBDT: Number(demandChargeBDT.toFixed(2)),
      meterRentBDT: Number(meterRentBDT.toFixed(2)),
      vatBDT: Number(vatBDT.toFixed(2)),
      grossTotalBDT: Number(grossTotalBDT.toFixed(2)),
      effectiveRatePerKwh: Number(effectiveRate.toFixed(2)),
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

