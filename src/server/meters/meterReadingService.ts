/**
 * Household Meter Reading & SMS Persistence Service (No-IoT Workflow)
 *
 * Validation & Computation Rules:
 * - Every household starts with zero simulated/fake manual readings ("My data" = real readings only).
 * - Adding a reading enforces monotonic kWh progression:
 *   - Cannot be lower than the most recent reading on or before `readingDate`.
 *   - Cannot be higher than the next reading after `readingDate` (if backfilling an earlier date).
 * - Daily usage (kWh/day) and month-to-date (kWh & estimated BDT) are computed strictly
 *   from chronological meter readings and BERC residential tariffs via TariffCalculator.
 */

import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import {
  ManualMeterReading,
  MeterReadingSource,
  MeterUsageMetrics,
  SavedSmsRecord,
  SmsRecordType,
} from './types';

export class MeterReadingValidationError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = 'INVALID_METER_READING',
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'MeterReadingValidationError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function daysBetweenDates(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24));
}

export function sortReadingsChronologically(readings: ManualMeterReading[]): ManualMeterReading[] {
  return [...readings].sort((a, b) => {
    if (a.readingDate !== b.readingDate) {
      return a.readingDate < b.readingDate ? -1 : 1;
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

/**
 * Pure computation of Daily Usage (kWh/day) and Month-to-Date usage & cost from real readings.
 */
export function computeMeterUsageMetrics(
  readings: ManualMeterReading[],
  sanctionedLoadKw: number = 3.0,
  referenceDateStr?: string
): MeterUsageMetrics {
  const refDate =
    referenceDateStr && isValidDateString(referenceDateStr)
      ? referenceDateStr
      : new Date().toISOString().slice(0, 10);
  const currentMonth = refDate.slice(0, 7); // YYYY-MM
  const monthStartDate = `${currentMonth}-01`;

  const sorted = sortReadingsChronologically(readings);
  const latestReading = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const previousReading = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  if (sorted.length < 2 || !latestReading || !previousReading) {
    const emptyCalc = TariffCalculator.calculateCost(0, sanctionedLoadKw, 'SLAB', undefined, {
      billingPeriod: monthStartDate,
    });
    return {
      readingCount: sorted.length,
      latestReading,
      previousReading: null,
      dailyUsageKwh: null,
      dailySpanDays: null,
      monthToDateKwh: null,
      monthToDateEstimatedCostBdt: null,
      monthLabel: currentMonth,
      tariffVersionId: emptyCalc.tariffVersionId || 'BERC-LTA',
      needsMoreReadings: true,
    };
  }

  // Daily usage: compare latest reading against prior distinct-date reading (or prior reading if same date)
  let anchorForDaily = previousReading;
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i].readingDate < latestReading.readingDate) {
      anchorForDaily = sorted[i];
      break;
    }
  }
  const rawSpanDays = daysBetweenDates(anchorForDaily.readingDate, latestReading.readingDate);
  const dailySpanDays = Math.max(1, rawSpanDays);
  const deltaKwh = Math.max(0, latestReading.readingKwh - anchorForDaily.readingKwh);
  const dailyUsageKwh = Number((deltaKwh / dailySpanDays).toFixed(2));

  // Month-to-date computation for `currentMonth` (YYYY-MM)
  const currentMonthReadings = sorted.filter((r) => r.readingDate.startsWith(currentMonth));
  const priorMonthReadings = sorted.filter((r) => r.readingDate < monthStartDate);

  let monthToDateKwh: number | null = null;
  if (currentMonthReadings.length > 0) {
    const latestInMonth = currentMonthReadings[currentMonthReadings.length - 1];
    const baseline =
      priorMonthReadings.length > 0
        ? priorMonthReadings[priorMonthReadings.length - 1]
        : currentMonthReadings[0];

    if (baseline.id !== latestInMonth.id) {
      monthToDateKwh = Number(Math.max(0, latestInMonth.readingKwh - baseline.readingKwh).toFixed(2));
    } else if (currentMonthReadings.length >= 2) {
      monthToDateKwh = Number(
        Math.max(0, latestInMonth.readingKwh - currentMonthReadings[0].readingKwh).toFixed(2)
      );
    }
  }

  const calc = TariffCalculator.calculateCost(monthToDateKwh ?? 0, sanctionedLoadKw, 'SLAB', undefined, {
    billingPeriod: monthStartDate,
  });

  return {
    readingCount: sorted.length,
    latestReading,
    previousReading: anchorForDaily,
    dailyUsageKwh,
    dailySpanDays,
    monthToDateKwh,
    monthToDateEstimatedCostBdt: monthToDateKwh !== null ? calc.grossTotalBDT : null,
    monthLabel: currentMonth,
    tariffVersionId: calc.tariffVersionId || 'BERC-LTA',
    needsMoreReadings: false,
  };
}

export class MeterReadingService {
  private static instance: MeterReadingService;
  private readingsByHousehold: Map<string, ManualMeterReading[]> = new Map();
  private smsByHousehold: Map<string, SavedSmsRecord[]> = new Map();

  public static getInstance(): MeterReadingService {
    if (!MeterReadingService.instance) {
      MeterReadingService.instance = new MeterReadingService();
    }
    return MeterReadingService.instance;
  }

  public getReadings(householdId: string): ManualMeterReading[] {
    const list = this.readingsByHousehold.get(householdId) || [];
    return sortReadingsChronologically(list);
  }

  public addReading(
    householdId: string,
    input: {
      readingKwh: number;
      readingDate: string;
      source?: MeterReadingSource;
      notes?: string;
      confidence?: number;
    }
  ): ManualMeterReading {
    const kwh = Number(input.readingKwh);
    if (!Number.isFinite(kwh) || kwh < 0) {
      throw new MeterReadingValidationError(
        'Meter reading must be a non-negative number in kWh.',
        'INVALID_KWH'
      );
    }

    const readingDate = (input.readingDate || '').trim();
    if (!isValidDateString(readingDate)) {
      throw new MeterReadingValidationError(
        'Please provide a valid reading date (YYYY-MM-DD).',
        'INVALID_DATE'
      );
    }

    const existing = this.getReadings(householdId);

    // Find latest reading on or before `readingDate`
    let prevReading: ManualMeterReading | null = null;
    let nextReading: ManualMeterReading | null = null;
    for (const r of existing) {
      if (r.readingDate <= readingDate) {
        prevReading = r;
      } else if (!nextReading) {
        nextReading = r;
      }
    }

    if (prevReading && kwh < prevReading.readingKwh) {
      throw new MeterReadingValidationError(
        `Reading (${kwh} kWh) cannot be lower than the previous reading (${prevReading.readingKwh} kWh on ${prevReading.readingDate}).`,
        'READING_LOWER_THAN_PREVIOUS',
        400,
        {
          enteredKwh: kwh,
          previousKwh: prevReading.readingKwh,
          previousDate: prevReading.readingDate,
        }
      );
    }

    if (nextReading && kwh > nextReading.readingKwh) {
      throw new MeterReadingValidationError(
        `Reading (${kwh} kWh on ${readingDate}) cannot exceed the later reading (${nextReading.readingKwh} kWh on ${nextReading.readingDate}).`,
        'READING_HIGHER_THAN_NEXT',
        400,
        {
          enteredKwh: kwh,
          nextKwh: nextReading.readingKwh,
          nextDate: nextReading.readingDate,
        }
      );
    }

    const record: ManualMeterReading = {
      id: `mrd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      householdId,
      readingKwh: Number(kwh.toFixed(2)),
      readingDate,
      source: input.source === 'METER_SCAN' ? 'METER_SCAN' : 'MANUAL',
      notes: input.notes?.trim() || undefined,
      confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
      createdAt: new Date().toISOString(),
    };

    const nextList = sortReadingsChronologically([...existing, record]);
    this.readingsByHousehold.set(householdId, nextList);
    return record;
  }

  public deleteReading(householdId: string, readingId: string): boolean {
    const existing = this.readingsByHousehold.get(householdId) || [];
    const filtered = existing.filter((r) => r.id !== readingId);
    if (filtered.length === existing.length) return false;
    this.readingsByHousehold.set(householdId, filtered);
    return true;
  }

  public clearReadings(householdId: string): void {
    this.readingsByHousehold.delete(householdId);
  }

  public getSmsRecords(householdId: string): SavedSmsRecord[] {
    const list = this.smsByHousehold.get(householdId) || [];
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  public addSmsRecord(
    householdId: string,
    input: {
      smsType: SmsRecordType;
      utility: string | null;
      amountBdt: number | null;
      date: string | null;
      balanceBdt: number | null;
      unitsKwh: number | null;
      token: string | null;
      rawText: string;
    }
  ): SavedSmsRecord {
    const hasSignal =
      input.amountBdt !== null ||
      input.balanceBdt !== null ||
      input.unitsKwh !== null;

    if (!hasSignal) {
      throw new MeterReadingValidationError(
        'Cannot save an SMS record without an amount, balance, or unit figure.',
        'EMPTY_SMS_RECORD'
      );
    }

    const record: SavedSmsRecord = {
      id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      householdId,
      smsType: input.smsType || 'UNKNOWN',
      utility: input.utility || null,
      amountBdt: input.amountBdt !== null && Number.isFinite(Number(input.amountBdt))
        ? Number(Number(input.amountBdt).toFixed(2))
        : null,
      date: input.date && isValidDateString(input.date) ? input.date : null,
      balanceBdt: input.balanceBdt !== null && Number.isFinite(Number(input.balanceBdt))
        ? Number(Number(input.balanceBdt).toFixed(2))
        : null,
      unitsKwh: input.unitsKwh !== null && Number.isFinite(Number(input.unitsKwh))
        ? Number(Number(input.unitsKwh).toFixed(2))
        : null,
      token: input.token?.trim() || null,
      rawText: input.rawText,
      createdAt: new Date().toISOString(),
    };

    const existing = this.smsByHousehold.get(householdId) || [];
    this.smsByHousehold.set(householdId, [record, ...existing]);
    return record;
  }

  public deleteSmsRecord(householdId: string, smsId: string): boolean {
    const existing = this.smsByHousehold.get(householdId) || [];
    const filtered = existing.filter((s) => s.id !== smsId);
    if (filtered.length === existing.length) return false;
    this.smsByHousehold.set(householdId, filtered);
    return true;
  }
}
