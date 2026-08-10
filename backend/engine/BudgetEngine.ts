import { BudgetStatus, TariffType } from '../../shared/types/energy';
import { TariffCalculator } from './TariffCalculator';

export class BudgetEngine {
  /**
   * Projects month-end electricity expenditure and checks against household budget
   */
  static evaluateBudget(
    householdId: string,
    monthlyBudgetBDT: number,
    currentKwh: number,
    daysPassed: number,
    daysInMonth: number = 30,
    sanctionedLoadKw: number = 3.0,
    tariffType: TariffType = 'SLAB'
  ): BudgetStatus {
    const validDaysPassed = Math.max(1, daysPassed);
    const dailyKwhAverage = currentKwh / validDaysPassed;
    const projectedKwh = dailyKwhAverage * daysInMonth;

    const currentCost = TariffCalculator.calculateCost(currentKwh, sanctionedLoadKw, tariffType);
    const projectedCost = TariffCalculator.calculateCost(projectedKwh, sanctionedLoadKw, tariffType);

    const projectedCostBDT = projectedCost.grossTotalBDT;
    const isOverageLikely = projectedCostBDT > monthlyBudgetBDT;
    const overagePercentage = monthlyBudgetBDT > 0
      ? Number((((projectedCostBDT - monthlyBudgetBDT) / monthlyBudgetBDT) * 100).toFixed(1))
      : 0;

    return {
      householdId,
      monthlyBudgetBDT,
      currentSpentBDT: currentCost.grossTotalBDT,
      currentKwh: Number(currentKwh.toFixed(1)),
      daysPassed,
      daysInMonth,
      projectedKwh: Number(projectedKwh.toFixed(1)),
      projectedCostBDT: Number(projectedCostBDT.toFixed(2)),
      isOverageLikely,
      overagePercentage,
    };
  }
}
