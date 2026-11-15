export type TariffType = 'SLAB' | 'FLAT' | 'TOU' | 'SEASONAL';

export interface SlabTier {
  step?: number;
  minKwh: number;
  maxKwh: number | null; // null for unlimited (top step)
  ratePerKwh: number; // in BDT
  stepName: string;
  isLifeline?: boolean; // Separate rule: applies only when monthly usage <= 50 kWh
}

export interface TariffVersion {
  version_id: string;
  effective_from: string; // ISO date YYYY-MM-DD
  source_note: string;
  last_verified_date: string | null; // ISO date YYYY-MM-DD or null when unverified
  slabs: SlabTier[];
  demandChargePerKw?: number; // TODO(verify): BDT / kW / month
  meterRent?: number;         // TODO(verify): BDT / month
  vatPercent?: number;        // TODO(verify): Govt VAT %
  charges_verified?: boolean; // Remains false ('unverified') until explicitly verified by Admin
  updated_at?: string;
  updated_by?: string | null;
  flatRatePerKwh?: number;
  touRates?: {
    offPeakRate: number;
    peakRate: number;
  };
  seasonalMultipliers?: {
    summer: number;
    winter: number;
  };
}

export interface TariffStructure {
  id: string;
  version_id?: string;
  effective_from?: string;
  source_note?: string;
  last_verified_date?: string | null;
  charges_verified?: boolean;
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
  demandChargePerKw: number; // TODO(verify): BDT / kW / month
  meterRent: number;          // TODO(verify): BDT / month
  vatPercent: number;         // TODO(verify): e.g., 5.0 for 5%
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
  tariffVersionId?: string;
  effectiveFrom?: string;
  lastVerifiedDate?: string | null;
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

export interface SlabThresholdAnalysis {
  tariffVersionId?: string;
  effectiveFrom?: string;
  lastVerifiedDate?: string | null;
  currentSlabName: string;
  currentRateBDT: number;
  nextSlabName: string | null;
  nextRateBDT: number | null;
  rateJumpPercentage: number;
  thresholdKwh: number | null;
  kwhRemainingToBreach: number;
  burnRateKwhPerDay: number;
  projectedMonthEndKwh: number;
  daysUntilBreach: number | null;
  projectedBreachOccurs: boolean;
  maxDailyKwhToStayInSlab: number;
  avoidableMonthlySurchargeBDT: number;
}



