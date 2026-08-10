import { ROIAnalysis } from '../../shared/types/energy';

export class ROICalculator {
  /**
   * Computes payback period and financial savings for appliance upgrades
   */
  static calculateUpgradeROI(
    currentApplianceName: string,
    proposedApplianceName: string,
    currentWatts: number,
    proposedWatts: number,
    usageHoursPerDay: number,
    initialInvestmentBDT: number,
    electricityRateBDT: number = 8.02 // BDT per kWh
  ): ROIAnalysis {
    const dailyWattsSaved = Math.max(0, currentWatts - proposedWatts) * usageHoursPerDay;
    const dailyKwhSaved = dailyWattsSaved / 1000;
    const monthlyKwhSaved = dailyKwhSaved * 30;

    const monthlySavingsBDT = monthlyKwhSaved * electricityRateBDT;
    const annualSavingsBDT = monthlySavingsBDT * 12;

    const paybackPeriodMonths = monthlySavingsBDT > 0
      ? Number((initialInvestmentBDT / monthlySavingsBDT).toFixed(1))
      : 0;

    const fiveYearNetSavingsBDT = (annualSavingsBDT * 5) - initialInvestmentBDT;

    return {
      currentAppliance: currentApplianceName,
      proposedAppliance: proposedApplianceName,
      currentWatts,
      proposedWatts,
      usageHoursPerDay,
      initialInvestmentBDT,
      monthlySavingsBDT: Number(monthlySavingsBDT.toFixed(2)),
      annualSavingsBDT: Number(annualSavingsBDT.toFixed(2)),
      paybackPeriodMonths,
      fiveYearNetSavingsBDT: Number(fiveYearNetSavingsBDT.toFixed(2)),
    };
  }
}
