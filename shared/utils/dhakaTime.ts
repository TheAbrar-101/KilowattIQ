/**
 * Deterministic Asia/Dhaka (UTC+06:00) Date & Billing-Cycle Helpers.
 * Shared across backend services and React components so billing-cycle
 * boundaries, days passed, and days left never drift to server UTC.
 */

export const DHAKA_TIMEZONE = 'Asia/Dhaka';

export function isValidYyyyMmDd(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Formats a Date / timestamp / ISO string into a YYYY-MM-DD calendar date in Asia/Dhaka.
 * If already passed a bare YYYY-MM-DD string, returns it unchanged.
 */
export function getDhakaDateString(input: Date | string | number = new Date()): string {
  if (typeof input === 'string' && isValidYyyyMmDd(input.trim())) {
    return input.trim();
  }

  const dateObj = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dateObj.getTime())) {
    return getDhakaDateString(new Date());
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DHAKA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateObj);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  // Fallback fixed UTC+06:00 shift (Bangladesh Standard Time has no DST)
  const shifted = new Date(dateObj.getTime() + 6 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export function daysInCalendarMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

export function formatCalendarDate(year: number, month1to12: number, day: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysYyyyMmDd(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenYyyyMmDd(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24));
}

export function normalizeBillingDayValue(day?: number | null): number {
  const n = Number(day);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(31, Math.floor(n));
}

export interface DhakaBillingCycleTiming {
  todayDhaka: string;
  billingDay: number;
  cycleStartDate: string;
  cycleEndDate: string;
  cycleLabel: string;
  cycleDaysElapsed: number; // 1 on cycleStartDate, totalDays on cycleEndDate
  cycleTotalDays: number;
  cycleDaysRemaining: number; // totalDays - cycleDaysElapsed (0 on cycleEndDate)
}

/**
 * Computes active billing cycle window, days elapsed, and days remaining strictly in Asia/Dhaka.
 */
export function getDhakaBillingCycleTiming(
  referenceInstantOrDate: Date | string | number = new Date(),
  billingDay: number = 1
): DhakaBillingCycleTiming {
  const todayDhaka = getDhakaDateString(referenceInstantOrDate);
  const bDay = normalizeBillingDayValue(billingDay);
  const [refYear, refMonth, refDay] = todayDhaka.split('-').map(Number);

  const clampedThisMonth = Math.min(bDay, daysInCalendarMonth(refYear, refMonth));
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

  const startDay = Math.min(bDay, daysInCalendarMonth(startYear, startMonth));
  const nextCycleStartDay = Math.min(bDay, daysInCalendarMonth(endYear, endMonth));
  const cycleStartDate = formatCalendarDate(startYear, startMonth, startDay);
  const nextCycleStartDate = formatCalendarDate(endYear, endMonth, nextCycleStartDay);
  const cycleEndDate = addDaysYyyyMmDd(nextCycleStartDate, -1);

  const cycleTotalDays = Math.max(1, daysBetweenYyyyMmDd(cycleStartDate, cycleEndDate) + 1);
  const rawElapsed = daysBetweenYyyyMmDd(cycleStartDate, todayDhaka) + 1;
  const cycleDaysElapsed = Math.min(cycleTotalDays, Math.max(1, rawElapsed));
  const cycleDaysRemaining = Math.max(0, cycleTotalDays - cycleDaysElapsed);

  return {
    todayDhaka,
    billingDay: bDay,
    cycleStartDate,
    cycleEndDate,
    cycleLabel: `${cycleStartDate} → ${cycleEndDate}`,
    cycleDaysElapsed,
    cycleTotalDays,
    cycleDaysRemaining,
  };
}
