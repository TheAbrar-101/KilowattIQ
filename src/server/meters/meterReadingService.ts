/**
 * Household Meter Reading & SMS Persistence Service (No-IoT Workflow)
 *
 * Persistence & Security Guarantees:
 * - Zero in-memory storage (no Maps or arrays cached in RAM).
 * - Uses Supabase/Postgres (`meter_readings`, `sms_records`, `households.billing_day`)
 *   with strict user_id + household_id scoping and Supabase JWT RLS when configured.
 * - When Supabase credentials are absent (local test/preview mode), persists atomically
 *   to an explicit disk store (`storePath`) so data survives service restarts while new
 *   (user, household) pairs still start completely empty.
 * - Meter replacement (`isMeterReplacement`) starts a new meter segment, preserving old
 *   readings, isolating monotonic validation per segment, and summing segment usage
 *   across swaps without ever producing negative consumption.
 * - Billing cycles use household `billingDay` (1..31, default 1) rather than calendar month.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import { SupabaseService } from '../../../backend/services/SupabaseService';
import { maskStsTokensInText, formatMaskedToken } from './smsParser';
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

export function isValidDateString(dateStr: string): boolean {
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

function daysInUtcMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function formatUtcDate(year: number, month1to12: number, day: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysUtc(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function normalizeBillingDay(day?: number | null): number {
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(31, Math.floor(n));
}

/**
 * Computes the active billing cycle window [cycleStartDate, cycleEndDate]
 * for a given reference date and household billingDay (1..31, default 1).
 */
export function getBillingCycleWindow(
  referenceDateStr?: string,
  billingDay: number = 1
): {
  billingDay: number;
  cycleStartDate: string;
  cycleEndDate: string;
  cycleLabel: string;
} {
  const refDate =
    referenceDateStr && isValidDateString(referenceDateStr)
      ? referenceDateStr
      : new Date().toISOString().slice(0, 10);
  const bDay = normalizeBillingDay(billingDay);
  const [refYear, refMonth, refDay] = refDate.split('-').map(Number);

  const clampedThisMonth = Math.min(bDay, daysInUtcMonth(refYear, refMonth));
  let startYear: number;
  let startMonth: number;
  let endYear: number;
  let endMonth: number;

  if (refDay >= clampedThisMonth) {
    startYear = refYear;
    startMonth = refMonth;
    endYear = refMonth === 12 ? refYear + 1 : refYear;
    endMonth = refMonth === 12 ? 1 : refMonth + 1;
  } else {
    startYear = refMonth === 1 ? refYear - 1 : refYear;
    startMonth = refMonth === 1 ? 12 : refMonth - 1;
    endYear = refYear;
    endMonth = refMonth;
  }

  const startDay = Math.min(bDay, daysInUtcMonth(startYear, startMonth));
  const nextCycleStartDay = Math.min(bDay, daysInUtcMonth(endYear, endMonth));
  const cycleStartDate = formatUtcDate(startYear, startMonth, startDay);
  const nextCycleStartDate = formatUtcDate(endYear, endMonth, nextCycleStartDay);
  const cycleEndDate = addDaysUtc(nextCycleStartDate, -1);

  return {
    billingDay: bDay,
    cycleStartDate,
    cycleEndDate,
    cycleLabel: `${cycleStartDate} → ${cycleEndDate}`,
  };
}

export function sortReadingsChronologically(readings: ManualMeterReading[]): ManualMeterReading[] {
  return [...readings].sort((a, b) => {
    if (a.readingDate !== b.readingDate) {
      return a.readingDate < b.readingDate ? -1 : 1;
    }
    const segA = a.meterSegment || 1;
    const segB = b.meterSegment || 1;
    if (segA !== segB) {
      return segA - segB;
    }
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

function sumSegmentUsageInWindow(
  bySegment: Map<number, ManualMeterReading[]>,
  startDate: string,
  endDate: string
): number | null {
  let totalKwh = 0;
  let hasInterval = false;

  for (const segReadings of bySegment.values()) {
    const inWindow = segReadings.filter(
      (r) => r.readingDate >= startDate && r.readingDate <= endDate
    );
    if (inWindow.length === 0) continue;

    const priorBeforeWindow = segReadings.filter((r) => r.readingDate < startDate);
    const baseline =
      priorBeforeWindow.length > 0 ? priorBeforeWindow[priorBeforeWindow.length - 1] : inWindow[0];
    const latestInSeg = inWindow[inWindow.length - 1];

    if (baseline.id !== latestInSeg.id) {
      hasInterval = true;
      totalKwh += Math.max(0, latestInSeg.readingKwh - baseline.readingKwh);
    } else if (inWindow.length >= 2) {
      hasInterval = true;
      totalKwh += Math.max(0, latestInSeg.readingKwh - inWindow[0].readingKwh);
    }
  }

  return hasInterval ? Number(totalKwh.toFixed(2)) : null;
}

/**
 * Pure computation of Daily Usage (kWh/day), Month-to-Date usage & cost, and previous billing cycle
 * summary from real readings, honoring meter replacement segments and household billingDay.
 */
export function computeMeterUsageMetrics(
  readings: ManualMeterReading[],
  sanctionedLoadKw: number = 3.0,
  referenceDateStr?: string,
  billingDay: number = 1
): MeterUsageMetrics {
  const refDate =
    referenceDateStr && isValidDateString(referenceDateStr)
      ? referenceDateStr
      : new Date().toISOString().slice(0, 10);

  const cycle = getBillingCycleWindow(refDate, billingDay);
  const prevCycleWindow = getBillingCycleWindow(addDaysUtc(cycle.cycleStartDate, -1), billingDay);
  const cycleDaysElapsed = Math.max(1, daysBetweenDates(cycle.cycleStartDate, refDate) + 1);
  const cycleTotalDays = Math.max(cycleDaysElapsed, daysBetweenDates(cycle.cycleStartDate, cycle.cycleEndDate) + 1);

  const sorted = sortReadingsChronologically(readings);
  const latestReading = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const activeSegment = latestReading?.meterSegment || 1;

  if (sorted.length < 2 || !latestReading) {
    const emptyCalc = TariffCalculator.calculateCost(0, sanctionedLoadKw, 'SLAB', undefined, {
      billingPeriod: cycle.cycleStartDate,
    });
    const prevEmptyCalc = TariffCalculator.calculateCost(0, sanctionedLoadKw, 'SLAB', undefined, {
      billingPeriod: prevCycleWindow.cycleStartDate,
    });
    return {
      readingCount: sorted.length,
      latestReading,
      previousReading: null,
      dailyUsageKwh: null,
      dailySpanDays: null,
      monthToDateKwh: null,
      monthToDateEstimatedCostBdt: null,
      monthLabel: cycle.cycleLabel,
      billingDay: cycle.billingDay,
      cycleStartDate: cycle.cycleStartDate,
      cycleEndDate: cycle.cycleEndDate,
      cycleDaysElapsed,
      cycleTotalDays,
      previousCycle: {
        cycleStartDate: prevCycleWindow.cycleStartDate,
        cycleEndDate: prevCycleWindow.cycleEndDate,
        kwhUsed: null,
        estimatedCostBdt: null,
        tariffVersionId: prevEmptyCalc.tariffVersionId || 'BERC-LTA',
      },
      activeSegment,
      tariffVersionId: emptyCalc.tariffVersionId || 'BERC-LTA',
      needsMoreReadings: true,
    };
  }

  // Group readings by meterSegment so replacements never subtract old meter totals from new meter totals
  const bySegment = new Map<number, ManualMeterReading[]>();
  for (const r of sorted) {
    const seg = r.meterSegment || 1;
    const list = bySegment.get(seg) || [];
    list.push(r);
    bySegment.set(seg, list);
  }

  // Month-to-Date (Billing-Cycle-to-Date): sum usage per segment inside [cycleStartDate, refDate]
  const monthToDateKwh = sumSegmentUsageInWindow(bySegment, cycle.cycleStartDate, refDate);

  // Previous Billing Cycle: sum usage per segment inside [prevCycleStartDate, prevCycleEndDate]
  const prevCycleKwh = sumSegmentUsageInWindow(
    bySegment,
    prevCycleWindow.cycleStartDate,
    prevCycleWindow.cycleEndDate
  );
  const prevCycleCalc = TariffCalculator.calculateCost(
    prevCycleKwh ?? 0,
    sanctionedLoadKw,
    'SLAB',
    undefined,
    { billingPeriod: prevCycleWindow.cycleStartDate }
  );

  // Daily usage: computed strictly within the active segment, anchored to current billing cycle
  let dailyUsageKwh: number | null = null;
  let dailySpanDays: number | null = null;
  let anchorForDaily: ManualMeterReading | null = null;

  const cycleReadingsAllSegments = sorted.filter(
    (r) => r.readingDate >= cycle.cycleStartDate && r.readingDate <= refDate
  );

  if (cycleReadingsAllSegments.length > 0) {
    const targetLatest = cycleReadingsAllSegments[cycleReadingsAllSegments.length - 1];
    const sameSegReadings = bySegment.get(targetLatest.meterSegment || 1) || [];
    const latestIdxInSeg = sameSegReadings.findIndex((r) => r.id === targetLatest.id);

    if (latestIdxInSeg > 0) {
      let candidateAnchor = sameSegReadings[latestIdxInSeg - 1];
      for (let i = latestIdxInSeg - 1; i >= 0; i--) {
        if (sameSegReadings[i].readingDate < targetLatest.readingDate) {
          candidateAnchor = sameSegReadings[i];
          break;
        }
      }
      anchorForDaily = candidateAnchor;
      const span = Math.max(1, daysBetweenDates(candidateAnchor.readingDate, targetLatest.readingDate));
      const delta = Math.max(0, targetLatest.readingKwh - candidateAnchor.readingKwh);
      dailySpanDays = span;
      dailyUsageKwh = Number((delta / span).toFixed(2));
    }
  }

  const calc = TariffCalculator.calculateCost(monthToDateKwh ?? 0, sanctionedLoadKw, 'SLAB', undefined, {
    billingPeriod: cycle.cycleStartDate,
  });

  return {
    readingCount: sorted.length,
    latestReading,
    previousReading: anchorForDaily,
    dailyUsageKwh,
    dailySpanDays,
    monthToDateKwh,
    monthToDateEstimatedCostBdt: monthToDateKwh !== null ? calc.grossTotalBDT : null,
    monthLabel: cycle.cycleLabel,
    billingDay: cycle.billingDay,
    cycleStartDate: cycle.cycleStartDate,
    cycleEndDate: cycle.cycleEndDate,
    cycleDaysElapsed,
    cycleTotalDays,
    previousCycle: {
      cycleStartDate: prevCycleWindow.cycleStartDate,
      cycleEndDate: prevCycleWindow.cycleEndDate,
      kwhUsed: prevCycleKwh,
      estimatedCostBdt: prevCycleKwh !== null ? prevCycleCalc.grossTotalBDT : null,
      tariffVersionId: prevCycleCalc.tariffVersionId || 'BERC-LTA',
    },
    activeSegment,
    tariffVersionId: calc.tariffVersionId || 'BERC-LTA',
    needsMoreReadings: monthToDateKwh === null,
  };
}

interface DiskStoreSchema {
  meterReadings: ManualMeterReading[];
  smsRecords: SavedSmsRecord[];
  billingDays: Record<string, number>;
}

export interface MeterReadingServiceOptions {
  storePath?: string;
  supabaseClient?: SupabaseClient | null;
}

const MOCK_AUTH_TOKENS = new Set([
  'demo-jwt-token',
  'owner-jwt-token',
  'admin-jwt-token',
  'auditor-jwt-token',
  'family-jwt-token',
  'supabase-session-token',
]);

export class MeterReadingService {
  private static instance: MeterReadingService | null = null;
  private readonly storePath: string;
  private readonly injectedSupabaseClient?: SupabaseClient | null;

  public constructor(options?: MeterReadingServiceOptions) {
    this.storePath =
      options?.storePath ||
      process.env.METER_STORE_PATH ||
      path.join(os.tmpdir(), 'kilowattiq-meters-store.json');
    this.injectedSupabaseClient = options?.supabaseClient;
  }

  public static getInstance(): MeterReadingService {
    if (!MeterReadingService.instance) {
      MeterReadingService.instance = new MeterReadingService();
    }
    return MeterReadingService.instance;
  }

  public static resetInstanceForTests(): void {
    MeterReadingService.instance = null;
  }

  /**
   * Resolves a Postgres/Supabase client when connected. Returns null when running in
   * local mock/offline mode so callers cleanly route to the atomic disk store.
   */
  private resolvePostgresClient(authToken?: string): SupabaseClient | null {
    if (this.injectedSupabaseClient !== undefined) {
      return this.injectedSupabaseClient;
    }

    const db = SupabaseService.getInstance();
    if (db.isUsingMock()) {
      return null;
    }

    if (authToken && !MOCK_AUTH_TOKENS.has(authToken)) {
      const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
      const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
      if (url && anonKey) {
        return createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        });
      }
    }

    return db.getClient();
  }

  private readDiskStore(): DiskStoreSchema {
    try {
      if (!fs.existsSync(this.storePath)) {
        return { meterReadings: [], smsRecords: [], billingDays: {} };
      }
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        meterReadings: Array.isArray(parsed?.meterReadings) ? parsed.meterReadings : [],
        smsRecords: Array.isArray(parsed?.smsRecords) ? parsed.smsRecords : [],
        billingDays:
          parsed?.billingDays && typeof parsed.billingDays === 'object' ? parsed.billingDays : {},
      };
    } catch {
      return { meterReadings: [], smsRecords: [], billingDays: {} };
    }
  }

  private writeDiskStore(data: DiskStoreSchema): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.storePath}.${process.pid}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.storePath);
  }

  private mapDbReadingRow(row: any): ManualMeterReading {
    return {
      id: String(row.id),
      householdId: String(row.household_id),
      userId: String(row.user_id),
      readingKwh: Number(row.reading_kwh),
      readingDate: String(row.reading_date).slice(0, 10),
      meterSegment: Number(row.meter_segment || 1),
      isMeterReplacement: Boolean(row.is_meter_replacement),
      source: row.source === 'METER_SCAN' ? 'METER_SCAN' : 'MANUAL',
      notes: row.notes ?? undefined,
      confidence: row.confidence !== null && row.confidence !== undefined ? Number(row.confidence) : undefined,
      createdAt: String(row.created_at),
    };
  }

  private mapDbSmsRow(row: any): SavedSmsRecord {
    const last4 = row.token_last4 ? String(row.token_last4).slice(-4) : null;
    return {
      id: String(row.id),
      householdId: String(row.household_id),
      userId: String(row.user_id),
      smsType: (row.sms_type || 'UNKNOWN') as SmsRecordType,
      utility: row.utility ?? null,
      amountBdt: row.amount_bdt !== null && row.amount_bdt !== undefined ? Number(row.amount_bdt) : null,
      date: row.sms_date ? String(row.sms_date).slice(0, 10) : null,
      balanceBdt: row.balance_bdt !== null && row.balance_bdt !== undefined ? Number(row.balance_bdt) : null,
      unitsKwh: row.units_kwh !== null && row.units_kwh !== undefined ? Number(row.units_kwh) : null,
      tokenLast4: last4,
      tokenMasked: row.token_masked || (last4 ? formatMaskedToken(last4) : null),
      rawText: maskStsTokensInText(String(row.raw_text || '')),
      createdAt: String(row.created_at),
    };
  }

  public async getHouseholdBillingDay(
    householdId: string,
    userId: string,
    authToken?: string
  ): Promise<number> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('households')
        .select('billing_day')
        .eq('id', householdId)
        .maybeSingle();
      if (!error && data && data.billing_day !== undefined && data.billing_day !== null) {
        return normalizeBillingDay(data.billing_day);
      }
      return 1;
    }

    const disk = this.readDiskStore();
    const key = `${userId}::${householdId}`;
    if (disk.billingDays[key] !== undefined) {
      return normalizeBillingDay(disk.billingDays[key]);
    }
    if (disk.billingDays[householdId] !== undefined) {
      return normalizeBillingDay(disk.billingDays[householdId]);
    }
    return 1;
  }

  public async setHouseholdBillingDay(
    householdId: string,
    userId: string,
    billingDay: number,
    authToken?: string
  ): Promise<number> {
    const normalized = normalizeBillingDay(billingDay);
    if (billingDay < 1 || billingDay > 31 || !Number.isFinite(Number(billingDay))) {
      throw new MeterReadingValidationError(
        'Billing day must be a whole day of the month between 1 and 31.',
        'INVALID_BILLING_DAY'
      );
    }

    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { error } = await pg
        .from('households')
        .update({ billing_day: normalized, updated_at: new Date().toISOString() })
        .eq('id', householdId);
      if (error) {
        throw new Error(`Failed to persist billing day: ${error.message}`);
      }
      return normalized;
    }

    const disk = this.readDiskStore();
    disk.billingDays[`${userId}::${householdId}`] = normalized;
    disk.billingDays[householdId] = normalized;
    this.writeDiskStore(disk);
    return normalized;
  }

  public async getReadings(
    householdId: string,
    userId: string,
    authToken?: string
  ): Promise<ManualMeterReading[]> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('meter_readings')
        .select('*')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .order('reading_date', { ascending: true })
        .order('meter_segment', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to query meter_readings: ${error.message}`);
      }
      return sortReadingsChronologically((data || []).map((row) => this.mapDbReadingRow(row)));
    }

    const disk = this.readDiskStore();
    const list = disk.meterReadings.filter(
      (r) => r.householdId === householdId && r.userId === userId
    );
    return sortReadingsChronologically(list);
  }

  public async addReading(
    householdId: string,
    userId: string,
    input: {
      readingKwh: number;
      readingDate: string;
      source?: MeterReadingSource;
      notes?: string;
      confidence?: number;
      isMeterReplacement?: boolean;
    },
    authToken?: string
  ): Promise<ManualMeterReading> {
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

    const existing = await this.getReadings(householdId, userId, authToken);
    const isReplacement = Boolean(input.isMeterReplacement);

    // Determine which meter segment this reading belongs to
    let targetSegment = 1;
    if (isReplacement) {
      const maxSeg = existing.reduce((max, r) => Math.max(max, r.meterSegment || 1), 0);
      targetSegment = existing.length > 0 ? maxSeg + 1 : 1;
    } else if (existing.length > 0) {
      let anchorBeforeOrOn: ManualMeterReading | null = null;
      for (const r of existing) {
        if (r.readingDate <= readingDate) {
          anchorBeforeOrOn = r;
        }
      }
      targetSegment = anchorBeforeOrOn
        ? anchorBeforeOrOn.meterSegment || 1
        : existing[0].meterSegment || 1;
    }

    // Apply monotonic validation strictly within targetSegment
    const segmentReadings = existing.filter((r) => (r.meterSegment || 1) === targetSegment);
    let prevReading: ManualMeterReading | null = null;
    let nextReading: ManualMeterReading | null = null;

    for (const r of segmentReadings) {
      if (r.readingDate <= readingDate) {
        prevReading = r;
      } else if (!nextReading) {
        nextReading = r;
      }
    }

    if (prevReading && kwh < prevReading.readingKwh) {
      throw new MeterReadingValidationError(
        `Reading (${kwh} kWh) cannot be lower than the previous reading (${prevReading.readingKwh} kWh on ${prevReading.readingDate}) on meter segment #${targetSegment}. Check "I replaced my meter" if you installed a new meter.`,
        'READING_LOWER_THAN_PREVIOUS',
        400,
        {
          enteredKwh: kwh,
          previousKwh: prevReading.readingKwh,
          previousDate: prevReading.readingDate,
          meterSegment: targetSegment,
        }
      );
    }

    if (nextReading && kwh > nextReading.readingKwh) {
      throw new MeterReadingValidationError(
        `Reading (${kwh} kWh on ${readingDate}) cannot exceed the later reading (${nextReading.readingKwh} kWh on ${nextReading.readingDate}) on meter segment #${targetSegment}.`,
        'READING_HIGHER_THAN_NEXT',
        400,
        {
          enteredKwh: kwh,
          nextKwh: nextReading.readingKwh,
          nextDate: nextReading.readingDate,
          meterSegment: targetSegment,
        }
      );
    }

    const record: ManualMeterReading = {
      id: crypto.randomUUID(),
      householdId,
      userId,
      readingKwh: Number(kwh.toFixed(2)),
      readingDate,
      meterSegment: targetSegment,
      isMeterReplacement: isReplacement,
      source: input.source === 'METER_SCAN' ? 'METER_SCAN' : 'MANUAL',
      notes: input.notes?.trim() || undefined,
      confidence: typeof input.confidence === 'number' ? input.confidence : undefined,
      createdAt: new Date().toISOString(),
    };

    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('meter_readings')
        .insert({
          id: record.id,
          household_id: record.householdId,
          user_id: record.userId,
          reading_kwh: record.readingKwh,
          reading_date: record.readingDate,
          meter_segment: record.meterSegment,
          is_meter_replacement: Boolean(record.isMeterReplacement),
          source: record.source,
          notes: record.notes ?? null,
          confidence: record.confidence ?? null,
          created_at: record.createdAt,
        })
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to persist meter reading to Supabase: ${error?.message || 'Unknown error'}`);
      }
      return this.mapDbReadingRow(data);
    }

    const disk = this.readDiskStore();
    disk.meterReadings.push(record);
    this.writeDiskStore(disk);
    return record;
  }

  public async deleteReading(
    householdId: string,
    userId: string,
    readingId: string,
    authToken?: string
  ): Promise<boolean> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('meter_readings')
        .delete()
        .eq('id', readingId)
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        throw new Error(`Failed to delete meter reading: ${error.message}`);
      }
      return Array.isArray(data) && data.length > 0;
    }

    const disk = this.readDiskStore();
    const initialLen = disk.meterReadings.length;
    disk.meterReadings = disk.meterReadings.filter(
      (r) => !(r.id === readingId && r.householdId === householdId && r.userId === userId)
    );
    if (disk.meterReadings.length === initialLen) return false;
    this.writeDiskStore(disk);
    return true;
  }

  public async clearReadings(
    householdId: string,
    userId: string,
    authToken?: string
  ): Promise<void> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      await pg
        .from('meter_readings')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
      return;
    }

    const disk = this.readDiskStore();
    disk.meterReadings = disk.meterReadings.filter(
      (r) => !(r.householdId === householdId && r.userId === userId)
    );
    this.writeDiskStore(disk);
  }

  public async getSmsRecords(
    householdId: string,
    userId: string,
    authToken?: string
  ): Promise<SavedSmsRecord[]> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('sms_records')
        .select('*')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to query sms_records: ${error.message}`);
      }
      return (data || []).map((row) => this.mapDbSmsRow(row));
    }

    const disk = this.readDiskStore();
    const list = disk.smsRecords.filter(
      (s) => s.householdId === householdId && s.userId === userId
    );
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  public async addSmsRecord(
    householdId: string,
    userId: string,
    input: {
      smsType: SmsRecordType;
      utility: string | null;
      amountBdt: number | null;
      date: string | null;
      balanceBdt: number | null;
      unitsKwh: number | null;
      tokenLast4?: string | null;
      token?: string | null; // accepted transiently if passed, ONLY last 4 ever persisted
      rawText: string;
    },
    authToken?: string
  ): Promise<SavedSmsRecord> {
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

    // Security rule: NEVER persist full STS token; keep only last 4 digits & masked format
    const tokenCandidate = (input.tokenLast4 || input.token || '').replace(/\D/g, '');
    const tokenLast4 = tokenCandidate.length >= 4 ? tokenCandidate.slice(-4) : null;
    const tokenMasked = tokenLast4 ? formatMaskedToken(tokenLast4) : null;
    const safeRawText = maskStsTokensInText(String(input.rawText || ''));

    const record: SavedSmsRecord = {
      id: crypto.randomUUID(),
      householdId,
      userId,
      smsType: input.smsType || 'UNKNOWN',
      utility: input.utility || null,
      amountBdt:
        input.amountBdt !== null && Number.isFinite(Number(input.amountBdt))
          ? Number(Number(input.amountBdt).toFixed(2))
          : null,
      date: input.date && isValidDateString(input.date) ? input.date : null,
      balanceBdt:
        input.balanceBdt !== null && Number.isFinite(Number(input.balanceBdt))
          ? Number(Number(input.balanceBdt).toFixed(2))
          : null,
      unitsKwh:
        input.unitsKwh !== null && Number.isFinite(Number(input.unitsKwh))
          ? Number(Number(input.unitsKwh).toFixed(2))
          : null,
      tokenLast4,
      tokenMasked,
      rawText: safeRawText,
      createdAt: new Date().toISOString(),
    };

    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('sms_records')
        .insert({
          id: record.id,
          household_id: record.householdId,
          user_id: record.userId,
          sms_type: record.smsType,
          utility: record.utility,
          amount_bdt: record.amountBdt,
          sms_date: record.date,
          balance_bdt: record.balanceBdt,
          units_kwh: record.unitsKwh,
          token_last4: record.tokenLast4,
          token_masked: record.tokenMasked,
          raw_text: record.rawText,
          created_at: record.createdAt,
        })
        .select('*')
        .single();

      if (error || !data) {
        throw new Error(`Failed to persist SMS record to Supabase: ${error?.message || 'Unknown error'}`);
      }
      return this.mapDbSmsRow(data);
    }

    const disk = this.readDiskStore();
    disk.smsRecords.unshift(record);
    this.writeDiskStore(disk);
    return record;
  }

  public async deleteSmsRecord(
    householdId: string,
    userId: string,
    smsId: string,
    authToken?: string
  ): Promise<boolean> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      const { data, error } = await pg
        .from('sms_records')
        .delete()
        .eq('id', smsId)
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        throw new Error(`Failed to delete SMS record: ${error.message}`);
      }
      return Array.isArray(data) && data.length > 0;
    }

    const disk = this.readDiskStore();
    const initialLen = disk.smsRecords.length;
    disk.smsRecords = disk.smsRecords.filter(
      (s) => !(s.id === smsId && s.householdId === householdId && s.userId === userId)
    );
    if (disk.smsRecords.length === initialLen) return false;
    this.writeDiskStore(disk);
    return true;
  }

  public async clearSmsRecords(
    householdId: string,
    userId: string,
    authToken?: string
  ): Promise<void> {
    const pg = this.resolvePostgresClient(authToken);
    if (pg) {
      await pg
        .from('sms_records')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
      return;
    }

    const disk = this.readDiskStore();
    disk.smsRecords = disk.smsRecords.filter(
      (s) => !(s.householdId === householdId && s.userId === userId)
    );
    this.writeDiskStore(disk);
  }
}
