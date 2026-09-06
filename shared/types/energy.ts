export type TariffType = 'SLAB' | 'FLAT' | 'TOU' | 'SEASONAL';

export interface SlabTier {
  minKwh: number;
  maxKwh: number | null; // null for unlimited (top step)
  ratePerKwh: number; // in BDT
  stepName: string;
}

export interface TariffStructure {
  id: string;
  utilityName: string; // e.g. "DESCO", "DPDC", "BPDB", "WZPDCL"
  tariffType: TariffType;
  slabs: SlabTier[];
  flatRatePerKwh: number;
  touRates?: {
    offPeakRate: number; // 23:00 to 17:00
    peakRate: number;    // 17:00 to 23:00
  };
  seasonalMultipliers?: {
    summer: number; // Apr - Sep
    winter: number; // Oct - Mar
  };
  demandChargePerKw: number; // BDT / kW / month
  meterRent: number;          // BDT / month
  vatPercent: number;         // e.g., 5.0 for 5%
}

export interface PowerReading {
  timestamp: string;
  voltage: number;      // Volts (V)
  current: number;      // Amperes (A)
  activePowerW: number; // Watts (W)
  energyKwh: number;    // Cumulative kWh
  powerFactor: number;  // 0.0 to 1.0
  frequency: number;    // Hz (typically 50 Hz in BD)
  deviceId: string;
}

export interface CostCalculation {
  tariffType: TariffType;
  totalKwh: number;
  energyCostBDT: number;
  slabBreakdown?: Array<{
    stepName: string;
    kwhInSlab: number;
    rate: number;
    costBDT: number;
  }>;
  demandChargeBDT: number;
  meterRentBDT: number;
  vatBDT: number;
  grossTotalBDT: number;
  effectiveRatePerKwh: number;
}

export interface BudgetStatus {
  householdId: string;
  monthlyBudgetBDT: number;
  currentSpentBDT: number;
  currentKwh: number;
  daysPassed: number;
  daysInMonth: number;
  projectedKwh: number;
  projectedCostBDT: number;
  isOverageLikely: boolean;
  overagePercentage: number;
}

export interface VampirePowerReport {
  applianceId: string;
  applianceName: string;
  roomName: string;
  standbyWatts: number;
  dailyStandbyKwh: number;
  monthlyWastedBDT: number;
  annualWastedBDT: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ROIAnalysis {
  currentAppliance: string;
  proposedAppliance: string;
  currentWatts: number;
  proposedWatts: number;
  usageHoursPerDay: number;
  initialInvestmentBDT: number;
  monthlySavingsBDT: number;
  annualSavingsBDT: number;
  paybackPeriodMonths: number;
  fiveYearNetSavingsBDT: number;
}

export interface RecommendationItem {
  id: string;
  title: string;
  category: 'VAMPIRE_POWER' | 'BEHAVIORAL' | 'APPLIANCE_UPGRADE' | 'TARIFF_OPTIMIZATION' | 'PEAK_SHIFTING';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  estimatedMonthlySavingsBDT: number;
  actionableStep: string;
  status?: string;
}

export interface AiPriorityAction {
  title: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
}

export interface AiAdvisoryResponse {
  summary: string;
  priorityActions: AiPriorityAction[];
  explanation: string;
  language: 'en' | 'bn';
}

export interface AiAdvisorResult {
  available: boolean;
  aiAdvice?: AiAdvisoryResponse;
  fallbackReason?: string;
  sourceMetrics: {
    currentLoadW: number;
    projectedBillBDT: number;
    monthlyBudgetBDT: number;
    vampireWasteBDT: number;
    sanctionedLoadKw: number;
    tariffSlabName: string;
  };
  deterministicRecommendations: RecommendationItem[];
}


export interface FullReportData {
  household: {
    id: string;
    name: string;
    utilityProvider: string;
    accountNumber: string;
    sanctionedLoadKw: number;
    monthlyBudgetBDT: number;
  };
  reportingPeriod: string;
  generatedAt: string;
  energySummary: {
    totalMonthlyKwh: number;
    avgDailyKwh: number;
    avgActivePowerW: number;
    peakPowerW: number;
    peakTimestamp: string;
  };
  costAnalysis: CostCalculation;
  budgetAnalysis: {
    monthlyBudgetBDT: number;
    currentSpentBDT: number;
    projectedKwh: number;
    projectedCostBDT: number;
    remainingBudgetBDT: number;
    budgetUtilizationPct: number;
    isOverBudget: boolean;
  };
  applianceAnalysis: Array<{
    id: string;
    name: string;
    roomName: string;
    ratedPowerW: number;
    estimatedMonthlyKwh: number;
    estimatedMonthlyCostBDT: number;
    isOn: boolean;
  }>;
  vampirePowerAudit: {
    totalStandbyWatts: number;
    totalMonthlyWastedBDT: number;
    totalAnnualWastedBDT: number;
    reports: VampirePowerReport[];
  };
  recommendations: RecommendationItem[];
  roiAnalyses: ROIAnalysis[];
  aiAdvice?: AiAdvisoryResponse;
}


