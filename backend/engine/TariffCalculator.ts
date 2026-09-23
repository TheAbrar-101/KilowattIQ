import { TariffStructure, CostCalculation, TariffType, SlabThresholdAnalysis } from '../../shared/types/energy';
import { BD_DEFAULT_SLAB_TARIFF } from '../../shared/constants/bdTariffs';

export class TariffCalculator {
  /**
   * Calculates comprehensive electricity bill breakdown in BDT
   */
  static calculateCost(
    kwhConsumption: number,
    sanctionedLoadKw: number = 3.0,
    tariffType: TariffType = 'SLAB',
    tariffConfig: TariffStructure = BD_DEFAULT_SLAB_TARIFF,
    options?: { isPeakHourRatio?: number; seasonMultiplier?: number }
  ): CostCalculation {
    const totalKwh = Math.max(0, kwhConsumption);
    let energyCostBDT = 0;
    const slabBreakdown: Array<{ stepName: string; kwhInSlab: number; rate: number; costBDT: number }> = [];

    if (tariffType === 'SLAB') {
      let remainingKwh = totalKwh;

      for (const slab of tariffConfig.slabs) {
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
    } else if (tariffType === 'FLAT') {
      energyCostBDT = totalKwh * tariffConfig.flatRatePerKwh;
    } else if (tariffType === 'TOU') {
      const peakRatio = options?.isPeakHourRatio ?? 0.25; // Default ~25% consumption during peak 17:00-23:00
      const peakKwh = totalKwh * peakRatio;
      const offPeakKwh = totalKwh * (1 - peakRatio);

      const peakRate = tariffConfig.touRates?.peakRate ?? 12.10;
      const offPeakRate = tariffConfig.touRates?.offPeakRate ?? 7.05;

      energyCostBDT = (peakKwh * peakRate) + (offPeakKwh * offPeakRate);
    } else if (tariffType === 'SEASONAL') {
      const multiplier = options?.seasonMultiplier ?? 1.0;
      // Calculate base slab and apply seasonal multiplier
      const baseCalc = this.calculateCost(totalKwh, sanctionedLoadKw, 'SLAB', tariffConfig);
      energyCostBDT = baseCalc.energyCostBDT * multiplier;
    }

    const demandChargeBDT = sanctionedLoadKw * tariffConfig.demandChargePerKw;
    const meterRentBDT = tariffConfig.meterRent;
    const subtotal = energyCostBDT + demandChargeBDT + meterRentBDT;
    const vatBDT = subtotal * (tariffConfig.vatPercent / 100);
    const grossTotalBDT = subtotal + vatBDT;
    const effectiveRate = totalKwh > 0 ? grossTotalBDT / totalKwh : 0;

    return {
      tariffType,
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
    tariffConfig: TariffStructure = BD_DEFAULT_SLAB_TARIFF
  ): SlabThresholdAnalysis {
    const safeDaysPassed = Math.max(1, daysPassed);
    const safeTotalDays = Math.max(safeDaysPassed, totalDaysInMonth);
    const remainingDays = safeTotalDays - safeDaysPassed;

    const burnRateKwhPerDay = currentKwh / safeDaysPassed;
    const projectedMonthEndKwh = burnRateKwhPerDay * safeTotalDays;

    // Determine current active slab
    let currentSlab = tariffConfig.slabs[0];
    let nextSlab = tariffConfig.slabs[1] || null;

    for (let i = 0; i < tariffConfig.slabs.length; i++) {
      const slab = tariffConfig.slabs[i];
      if (currentKwh >= slab.minKwh && (slab.maxKwh === null || currentKwh <= slab.maxKwh)) {
        currentSlab = slab;
        nextSlab = tariffConfig.slabs[i + 1] || null;
        break;
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
      ? this.calculateCost(thresholdKwh, sanctionedLoadKw, 'SLAB', tariffConfig).grossTotalBDT
      : 0;
    const costAtProjected = this.calculateCost(projectedMonthEndKwh, sanctionedLoadKw, 'SLAB', tariffConfig).grossTotalBDT;
    const avoidableMonthlySurchargeBDT = Math.max(0, Number((costAtProjected - costAtCap).toFixed(2)));

    return {
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

