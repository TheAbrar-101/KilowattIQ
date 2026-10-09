import { Appliance } from '../../../shared/types/household';

export type HealthSignalType = 'RISING_STANDBY' | 'INRUSH_SURGE' | 'PF_DRIFT' | 'RUNTIME_CREEP';

export interface ApplianceHealthSignal {
  standbyPowerW: number;
  standbyBaselineW: number;
  inrushCurrentA: number;
  inrushBaselineA: number;
  powerFactor: number;
  powerFactorBaseline: number;
  runtimeMinutesPerCycle: number;
  runtimeBaselineMinutes: number;
}

export interface DegradationFinding {
  type: HealthSignalType;
  severity: 'critical' | 'warning' | 'info';
  label: string;
  currentValue: string;
  baselineValue: string;
  driftPercent: number;
  diagnosis: string;
  action: string;
}

export type HealthStatus = 'HEALTHY' | 'NEEDS_SERVICE' | 'REPLACE_RECOMMENDED';

export interface ApplianceHealthReport {
  applianceId: string;
  applianceName: string;
  category: Appliance['category'];
  healthScore: number; // 0 to 100
  status: HealthStatus;
  recommendation: string; // e.g. < 70: "This fridge may need servicing soon", < 40: "Consider replacing — here's the ROI"
  recommendationBn: string;
  linkToRoi: boolean;
  signals: ApplianceHealthSignal;
  findings: DegradationFinding[];
  suggestedReplacement?: {
    name: string;
    proposedWatts: number;
    estimatedCostBDT: number;
  };
  estimatedMonthlyWasteBDT: number;
  updatedAt: string;
}
