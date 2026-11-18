/**
 * Utility Recharge & Bill SMS Parser
 *
 * Security rule for prepaid STS tokens:
 * - Full 20-digit STS tokens are NEVER stored or returned intact.
 * - Only the last 4 digits (`tokenLast4`) and masked format (`****-****-****-****-1234`)
 *   are kept, and any full 20-digit token inside `rawText` is also masked before persistence.
 */

import { ParsedUtilitySms, SmsRecordType } from './types';

const BN_TO_EN_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

export function normalizeDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => BN_TO_EN_DIGITS[d] || d);
}

function parseNumericToken(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return null;
  const val = Number(cleaned);
  return Number.isFinite(val) && val >= 0 ? Number(val.toFixed(2)) : null;
}

function normalizeYear(y: string): string {
  if (y.length === 2) {
    const n = parseInt(y, 10);
    return n >= 70 ? `19${y}` : `20${y}`;
  }
  return y;
}

function isValidIsoDate(yyyyMmDd: string): boolean {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function extractDate(text: string): string | null {
  // 1. YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  // 2. DD-Mon-YYYY or DD Mon YYYY (e.g., 16-Nov-2026 or 16 Nov 26)
  const monMatch = text.match(/\b(\d{1,2})[-\s]([A-Za-z]{3,9})[-,\s]+(\d{2,4})\b/);
  if (monMatch) {
    const monthNum = MONTH_MAP[monMatch[2].toLowerCase()];
    if (monthNum) {
      const year = normalizeYear(monMatch[3]);
      const day = monMatch[1].padStart(2, '0');
      const candidate = `${year}-${monthNum}-${day}`;
      if (isValidIsoDate(candidate)) return candidate;
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YY (standard Bangladesh date order)
  const dmyMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = normalizeYear(dmyMatch[3]);
    const candidate = `${year}-${month}-${day}`;
    if (isValidIsoDate(candidate)) return candidate;
  }

  return null;
}

function extractUtility(rawText: string): string | null {
  const upper = rawText.toUpperCase();
  if (upper.includes('DESCO') || rawText.includes('ডেসকো')) return 'DESCO';
  if (upper.includes('DPDC') || rawText.includes('ডিপিডিসি')) return 'DPDC';
  if (upper.includes('NESCO') || rawText.includes('নেসকো')) return 'NESCO';
  if (upper.includes('WZPDCL') || upper.includes('WZPDC')) return 'WZPDCL';
  if (upper.includes('BREB') || upper.includes('REB') || upper.includes('PALLI BIDYUT') || rawText.includes('পল্লী বিদ্যুৎ')) {
    return 'BREB';
  }
  if (upper.includes('BPDB') || upper.includes('PDB') || rawText.includes('বিপিডিবি')) return 'BPDB';
  return null;
}

export function formatMaskedToken(last4: string): string {
  const cleanLast4 = normalizeDigits(last4).replace(/\D/g, '').slice(-4);
  return cleanLast4.length === 4 ? `****-****-****-****-${cleanLast4}` : '****';
}

function extractStsTokenLast4(normalizedText: string): { last4: string | null; masked: string | null } {
  // Match 20-digit STS prepaid meter token grouped with hyphens/spaces or contiguous 20 digits
  const grouped = normalizedText.match(/\b(\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})[-\s](\d{4})\b/);
  if (grouped && grouped[5]) {
    const last4 = grouped[5];
    return { last4, masked: formatMaskedToken(last4) };
  }
  const contiguous = normalizedText.match(/\b\d{16}(\d{4})\b/);
  if (contiguous && contiguous[1]) {
    const last4 = contiguous[1];
    return { last4, masked: formatMaskedToken(last4) };
  }
  return { last4: null, masked: null };
}

/**
 * Replaces any full 20-digit STS token in SMS text with a masked representation
 * preserving only the last 4 digits. Never retains the full STS token.
 */
export function maskStsTokensInText(rawText: string): string {
  if (!rawText) return '';
  const digitGroup = '[0-9০-৯]';
  const groupedRe = new RegExp(
    `\\b${digitGroup}{4}[-\\s]${digitGroup}{4}[-\\s]${digitGroup}{4}[-\\s]${digitGroup}{4}[-\\s](${digitGroup}{4})\\b`,
    'g'
  );
  const contiguousRe = new RegExp(`\\b${digitGroup}{16}(${digitGroup}{4})\\b`, 'g');

  return rawText
    .replace(groupedRe, (_m, last4) => formatMaskedToken(last4))
    .replace(contiguousRe, (_m, last4) => formatMaskedToken(last4));
}

export function parseUtilitySms(rawSms: string): ParsedUtilitySms {
  const rawInput = (rawSms || '').trim();
  const maskedRawText = maskStsTokensInText(rawInput);

  if (rawInput.length < 6) {
    return {
      parsed: false,
      smsType: 'UNKNOWN',
      utility: null,
      amountBdt: null,
      date: null,
      balanceBdt: null,
      unitsKwh: null,
      tokenLast4: null,
      tokenMasked: null,
      confidence: 'LOW',
      rawText: maskedRawText,
      failureReason: 'SMS text is too short or empty. Please paste the full utility SMS.',
    };
  }

  const text = normalizeDigits(rawInput);
  const utility = extractUtility(rawInput);
  const date = extractDate(text);
  const { last4: tokenLast4, masked: tokenMasked } = extractStsTokenLast4(text);

  // Extract remaining balance first so it isn't confused with recharge/bill amount
  let balanceBdt: number | null = null;
  const balancePatterns: RegExp[] = [
    /(?:rem(?:aining)?\s*bal(?:ance)?|curr(?:ent)?\s*bal(?:ance)?|new\s*bal(?:ance)?|av(?:ail(?:able)?)?\s*bal(?:ance)?|bal(?:ance)?|ব্যালেন্স|অবশিষ্ট\s*(?:টাকা|ব্যালেন্স))\s*[:=\-]?\s*(?:tk\.?|bdt|৳)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:tk\.?|bdt|৳|টাকা)?/i,
  ];
  for (const pat of balancePatterns) {
    const m = text.match(pat);
    if (m && m[1]) {
      const val = parseNumericToken(m[1]);
      if (val !== null) {
        balanceBdt = val;
        break;
      }
    }
  }

  // Strip matched balance snippet & full STS tokens before searching for recharge/bill amount
  let textWithoutBalance = maskStsTokensInText(text);
  for (const pat of balancePatterns) {
    textWithoutBalance = textWithoutBalance.replace(pat, ' ');
  }

  // Extract units (kWh) if explicitly mentioned
  let unitsKwh: number | null = null;
  const unitMatch =
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:kwh|units?|ইউনিট)\b/i) ||
    text.match(/(?:units?|consumed|energy|ইউনিট)\s*[:=\-]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:kwh)?/i);
  if (unitMatch && unitMatch[1]) {
    unitsKwh = parseNumericToken(unitMatch[1]);
  }

  // Extract primary recharge or bill amount (BDT)
  let amountBdt: number | null = null;
  const amountPatterns: RegExp[] = [
    /(?:recharge(?:d)?|top[- ]?up|vend(?:ed)?|bill\s*(?:amount|amt|due|total)?|payable|paid|payment|amount|amt|total|রিচার্জ|বিল|পরিশোধ|মোট)\s*(?:of|is|amount|amt)?\s*[:=\-]?\s*(?:tk\.?|bdt|taka|৳)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:recharge(?:d)?|top[- ]?up|vend(?:ed)?|bill\s*(?:amount|amt|due|total)?|payable|paid|payment|amount|amt|রিচার্জ|বিল|পরিশোধ)\s*(?:of|is)?\s*[:=\-]?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:tk\.?|bdt|taka|৳|টাকা)/i,
    /(?:tk\.?|bdt|taka|৳)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has been|is|successfully|recharged|paid|due|credited|রিচার্জ|পরিশোধ)/i,
    /(?:tk\.?|bdt|taka|৳)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:টাকা|taka|bdt|tk\.?)\b/i,
  ];

  for (const pat of amountPatterns) {
    const m = textWithoutBalance.match(pat);
    if (m && m[1]) {
      const val = parseNumericToken(m[1]);
      if (val !== null && val > 0) {
        amountBdt = val;
        break;
      }
    }
  }

  // Determine SMS type
  const lower = text.toLowerCase();
  let smsType: SmsRecordType = 'UNKNOWN';
  if (tokenLast4 || /recharge|top[- ]?up|vending|credited|token|রিচার্জ|টোকেন/.test(lower)) {
    smsType = 'RECHARGE';
  } else if (/bill|due|payable|invoice|biller|paid|বিল|বকেয়া|পরিশোধ/.test(lower)) {
    smsType = 'BILL';
  } else if (balanceBdt !== null) {
    smsType = 'BALANCE';
  }

  const hasFinancialOrMeterSignal = amountBdt !== null || balanceBdt !== null || unitsKwh !== null;
  if (!hasFinancialOrMeterSignal) {
    return {
      parsed: false,
      smsType: 'UNKNOWN',
      utility,
      amountBdt: null,
      date,
      balanceBdt: null,
      unitsKwh: null,
      tokenLast4,
      tokenMasked,
      confidence: 'LOW',
      rawText: maskedRawText,
      failureReason:
        'Could not extract an amount, balance, or kWh figure from this SMS. Please check the message and try again.',
    };
  }

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  if (amountBdt !== null && (date !== null || balanceBdt !== null || utility !== null)) {
    confidence = 'HIGH';
  }

  return {
    parsed: true,
    smsType,
    utility,
    amountBdt,
    date,
    balanceBdt,
    unitsKwh,
    tokenLast4,
    tokenMasked,
    confidence,
    rawText: maskedRawText,
  };
}
