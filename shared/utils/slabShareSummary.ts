/**
 * Privacy-Sanitized WhatsApp / SMS Slab Summary Formatter.
 *
 * Security & Privacy Guarantee:
 * - Outputs ONLY: current slab, units used this month, projected range (or "Not enough data yet" + current bill), and daily cap.
 * - NEVER accepts or includes household name, owner name, account number, address, meter ID, or STS tokens.
 */

import { SlabThresholdAnalysis } from '../types/energy';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBnDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)] ?? d);
}

export interface SafeShareSummaryInput {
  analysis: SlabThresholdAnalysis;
  hasAnyUnits: boolean;
  language: 'en' | 'bn';
}

export function buildSafeShareSummary({
  analysis,
  hasAnyUnits,
  language,
}: SafeShareSummaryInput): string {
  if (!hasAnyUnits) {
    return language === 'bn'
      ? 'KilowattIQ স্ল্যাব সারসংক্ষেপ: এখনো পর্যাপ্ত রিডিং নেই (অন্তত ২টি রিডিং যোগ করুন)।'
      : 'KilowattIQ Slab Summary: Not enough readings yet (log 2+ readings to calculate current slab and bill).';
  }

  const conf = analysis.projectionConfidence;
  const hasEnoughForProjection = Boolean(conf?.hasEnoughData);

  const projTextEn = hasEnoughForProjection && conf
    ? `Projected: ৳${Math.round(conf.lowBillBDT)} to ৳${Math.round(conf.highBillBDT)}, likely ৳${Math.round(conf.expectedBillBDT)} (${conf.lowKwh}–${conf.highKwh} kWh)`
    : `Not enough data yet (${conf?.readingDaysInCycle ?? 0}/5 days of readings). Current bill: ৳${Math.round(analysis.currentBillBDT)}`;

  const projTextBn = hasEnoughForProjection && conf
    ? `সম্ভাব্য বিল: ৳${toBnDigits(Math.round(conf.lowBillBDT))} থেকে ৳${toBnDigits(Math.round(conf.highBillBDT))}, মূলত ৳${toBnDigits(Math.round(conf.expectedBillBDT))} (${toBnDigits(conf.lowKwh)}–${toBnDigits(conf.highKwh)} kWh)`
    : `এখনো পর্যাপ্ত ডেটা নেই (${toBnDigits(conf?.readingDaysInCycle ?? 0)}/৫ দিনের রিডিং)। বর্তমান বিল: ৳${toBnDigits(Math.round(analysis.currentBillBDT))}`;

  const capTextEn =
    analysis.thresholdKwh !== null
      ? `${analysis.maxDailyKwhToStayInSlab} kWh/day`
      : 'Top tier active (no upper cap)';

  const capTextBn =
    analysis.thresholdKwh !== null
      ? `দৈনিক সর্বোচ্চ ${toBnDigits(analysis.maxDailyKwhToStayInSlab)} kWh`
      : 'সর্বোচ্চ ধাপ সক্রিয়';

  if (language === 'bn') {
    return [
      'বিদ্যুৎ স্ল্যাব সারসংক্ষেপ (KilowattIQ)',
      `• স্ল্যাব: ${analysis.currentSlabName} (৳${toBnDigits(analysis.currentRateBDT.toFixed(2))}/ইউনিট)`,
      `• ব্যবহৃত ইউনিট: ${toBnDigits(analysis.unitsUsedThisMonth)} kWh`,
      `• ${projTextBn}`,
      `• দৈনিক সীমা: ${capTextBn}`,
    ].join('\n');
  }

  return [
    'Electricity Slab Summary (KilowattIQ)',
    `• Slab: ${analysis.currentSlabName} (৳${analysis.currentRateBDT.toFixed(2)}/kWh)`,
    `• Units used: ${analysis.unitsUsedThisMonth} kWh`,
    `• ${projTextEn}`,
    `• Daily cap: ${capTextEn}`,
  ].join('\n');
}
