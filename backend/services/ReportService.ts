import { CostCalculation, VampirePowerReport, ROIAnalysis } from '../../shared/types/energy';
import { Household } from '../../shared/types/household';

export class ReportService {
  /**
   * Generates formatted CSV energy audit report string for export
   */
  static generateCSVReport(
    household: Household,
    costCalculation: CostCalculation,
    vampireReports: VampirePowerReport[],
    roiAnalyses: ROIAnalysis[]
  ): string {
    const lines: string[] = [];

    lines.push('=== KILOWATTIQ SMART ENERGY AUDIT REPORT ===');
    lines.push(`Household Name,${household.name}`);
    lines.push(`Utility Provider,${household.utilityProvider}`);
    lines.push(`Account Serial,${household.accountNumber}`);
    lines.push(`Sanctioned Load,${household.sanctionedLoadKw} kW`);
    lines.push(`Report Generated Date,${new Date().toLocaleDateString('en-US')}`);
    lines.push('');

    lines.push('--- MONTHLY BILL BREAKDOWN (BDT) ---');
    lines.push(`Tariff Type,${costCalculation.tariffType}`);
    lines.push(`Total Energy Consumption,${costCalculation.totalKwh} kWh`);
    lines.push(`Energy Charge,BDT ${costCalculation.energyCostBDT}`);
    lines.push(`Demand Charge,BDT ${costCalculation.demandChargeBDT}`);
    lines.push(`Meter Rent,BDT ${costCalculation.meterRentBDT}`);
    lines.push(`Govt VAT (5%),BDT ${costCalculation.vatBDT}`);
    lines.push(`Gross Total Bill,BDT ${costCalculation.grossTotalBDT}`);
    lines.push(`Effective Rate per kWh,BDT ${costCalculation.effectiveRatePerKwh}`);
    lines.push('');

    if (costCalculation.slabBreakdown && costCalculation.slabBreakdown.length > 0) {
      lines.push('--- DESCO/DPDC SLAB STEP BREAKDOWN ---');
      lines.push('Slab Step,kWh in Slab,Rate per kWh (BDT),Cost in Slab (BDT)');
      for (const step of costCalculation.slabBreakdown) {
        lines.push(`"${step.stepName}",${step.kwhInSlab},${step.rate},${step.costBDT}`);
      }
      lines.push('');
    }

    lines.push('--- VAMPIRE / STANDBY POWER AUDIT ---');
    lines.push('Appliance Name,Room Area,Standby Power (W),Monthly Wasted (BDT),Annual Wasted (BDT),Severity');
    for (const v of vampireReports) {
      lines.push(`"${v.applianceName}","${v.roomName}",${v.standbyWatts},${v.monthlyWastedBDT},${v.annualWastedBDT},${v.severity}`);
    }
    lines.push('');

    lines.push('--- APPLIANCE UPGRADE ROI & PAYBACK PERIOD ---');
    lines.push('Current Appliance,Proposed Efficiency Upgrade,Investment (BDT),Monthly Savings (BDT),Payback Period (Months),5-Year Net Savings (BDT)');
    for (const roi of roiAnalyses) {
      lines.push(`"${roi.currentAppliance}","${roi.proposedAppliance}",${roi.initialInvestmentBDT},${roi.monthlySavingsBDT},${roi.paybackPeriodMonths},${roi.fiveYearNetSavingsBDT}`);
    }

    return lines.join('\n');
  }
}
