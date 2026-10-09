import { Appliance, Household } from '../../../shared/types/household';

export interface ScheduledSlot {
  id: string;
  applianceId: string;
  applianceName: string;
  category: Appliance['category'];
  roomId?: string;
  roomName?: string;
  startHour: number; // 0 to 23
  durationHours: number; // 0.5 to 8
  ratedPowerW: number;
  isOffPeak: boolean; // true if within 23:00 to 17:00
  deviceId?: string;
  hasRelay: boolean;
  autoApplied?: boolean;
  notes?: string;
}

export type ConflictSeverity = 'warning' | 'error' | 'info';

export interface ScheduleConflict {
  id: string;
  type: 'OVERLAP' | 'PEAK_ZONE' | 'LOAD_EXCEEDED';
  severity: ConflictSeverity;
  applianceId: string;
  applianceName: string;
  slotIds: string[];
  message: string;
  messageBn: string;
  recommendedAction: string;
}

export interface ProjectedBillImpact {
  baselineMonthlyKwh: number;
  baselineMonthlyCostBDT: number;
  optimizedMonthlyCostBDT: number;
  monthlySavingsBDT: number;
  annualSavingsBDT: number;
  peakShiftedKwh: number;
  currentSlabName: string;
  currentRateBDT: number;
  nextSlabName: string | null;
  nextRateBDT: number | null;
  kwhRemainingToBreach: number;
  slabJumpAvoided: boolean;
  co2SavedKgMonthly: number;
  peakHoursWindow: string; // "17:00 - 23:00"
  offPeakHoursWindow: string; // "23:00 - 17:00"
  aiSummary: string;
  tips: string[];
}

export interface OptimizationPreferences {
  preferNightTime?: boolean; // 23:00 - 06:00
  avoidSleepDisruption?: boolean; // Avoid noisy appliances (washing machine/pump) at night 00:00-06:00
  maxConcurrentWatts?: number; // Caps simultaneous peak power
  allowDaytimeOffPeak?: boolean; // Allow daytime off-peak 07:00 - 17:00
}

export interface OptimizationResult {
  schedule: ScheduledSlot[];
  conflicts: ScheduleConflict[];
  projectedImpact: ProjectedBillImpact;
  generatedByAi: boolean;
  timestamp: string;
}
