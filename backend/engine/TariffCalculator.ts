import { TariffStructure, CostCalculation, TariffType } from '../../shared/types/energy';
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
}
