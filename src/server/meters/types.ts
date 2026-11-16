/**
 * Types for No-IoT Household Meter Readings, Gemini Vision Meter Scan,
 * Utility Recharge/Bill SMS Parsing, and Real Usage Computation.
 */

export type MeterReadingSource = 'MANUAL' | 'METER_SCAN';

export interface ManualMeterReading {
  id: string;
  householdId: string;
  readingKwh: number;
  readingDate: string; // YYYY-MM-DD
  source: MeterReadingSource;
  notes?: string;
  confidence?: number;
  createdAt: string;
}

export interface MeterUsageMetrics {
  readingCount: number;
  latestReading: ManualMeterReading | null;
  previousReading: ManualMeterReading | null;
  dailyUsageKwh: number | null;
  dailySpanDays: number | null;
  monthToDateKwh: number | null;
  monthToDateEstimatedCostBdt: number | null;
  monthLabel: string; // YYYY-MM
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
  token: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawText: string;
  failureReason?: string;
}

export interface SavedSmsRecord {
  id: string;
  householdId: string;
  smsType: SmsRecordType;
  utility: string | null;
  amountBdt: number | null;
  date: string | null;
  balanceBdt: number | null;
  unitsKwh: number | null;
  token: string | null;
  rawText: string;
  createdAt: string;
}
