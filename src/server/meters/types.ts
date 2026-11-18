/**
 * Types for No-IoT Household Meter Readings, Gemini Vision Meter Scan,
 * Utility Recharge/Bill SMS Parsing, Meter Replacement Segments & Billing Cycles.
 */

export type MeterReadingSource = 'MANUAL' | 'METER_SCAN';

export interface ManualMeterReading {
  id: string;
  householdId: string;
  userId: string;
  readingKwh: number;
  readingDate: string; // YYYY-MM-DD
  meterSegment: number; // Increments when user logs "I replaced my meter"
  isMeterReplacement?: boolean;
  source: MeterReadingSource;
  notes?: string;
  confidence?: number;
  createdAt: string;
}

export interface MeterCycleSummary {
  cycleStartDate: string; // YYYY-MM-DD
  cycleEndDate: string; // YYYY-MM-DD
  kwhUsed: number | null;
  estimatedCostBdt: number | null;
  tariffVersionId: string;
}

export interface MeterUsageMetrics {
  readingCount: number;
  latestReading: ManualMeterReading | null;
  previousReading: ManualMeterReading | null;
  dailyUsageKwh: number | null;
  dailySpanDays: number | null;
  monthToDateKwh: number | null;
  monthToDateEstimatedCostBdt: number | null;
  monthLabel: string; // Billing cycle period label (e.g. YYYY-MM-DD..YYYY-MM-DD)
  billingDay: number;
  cycleStartDate: string; // YYYY-MM-DD
  cycleEndDate: string; // YYYY-MM-DD
  cycleDaysElapsed: number;
  cycleTotalDays: number;
  previousCycle?: MeterCycleSummary;
  activeSegment: number;
  tariffVersionId: string;
  needsMoreReadings: boolean;
}

export interface MeterScanResult {
  readingKwh: number | null;
  confidence: number;
  meterType: 'PREPAID_DIGITAL' | 'POSTPAID_DIGITAL' | 'ANALOG_DIAL' | 'UNKNOWN';
  unitDetected: string;
  rawText: string;
  notes: string;
  modelUsed?: string;
}

export type SmsRecordType = 'RECHARGE' | 'BILL' | 'BALANCE' | 'UNKNOWN';

export interface ParsedUtilitySms {
  parsed: boolean;
  smsType: SmsRecordType;
  utility: string | null;
  amountBdt: number | null;
  date: string | null; // YYYY-MM-DD
  balanceBdt: number | null;
  unitsKwh: number | null;
  /** Only the last 4 digits of any STS token are ever retained */
  tokenLast4: string | null;
  /** Masked representation (e.g. ****-****-****-****-7890) */
  tokenMasked: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawText: string;
  failureReason?: string;
}

export interface SavedSmsRecord {
  id: string;
  householdId: string;
  userId: string;
  smsType: SmsRecordType;
  utility: string | null;
  amountBdt: number | null;
  date: string | null;
  balanceBdt: number | null;
  unitsKwh: number | null;
  /** Only the last 4 digits of STS tokens are stored */
  tokenLast4: string | null;
  tokenMasked: string | null;
  rawText: string;
  createdAt: string;
}
