/**
 * KilowattIQ Bangla Text-to-Speech (TTS) Service
 * 
 * Supports:
 * - Client-side Web Speech Synthesis (SpeechSynthesisUtterance) using 'bn-BD' voice
 * - Phonetic text normalization for Bangladeshi numbers, currency (৳ / BDT), and electrical units (kWh, W, kW)
 * - Gemini TTS generation / metadata for rich spoken energy advisories
 */

export interface BanglaTtsMetadata {
  originalText: string;
  spokenText: string;
  lang: string; // 'bn-BD'
  rate: number;
  pitch: number;
  voiceGenderPreference: 'female' | 'male';
}

/**
 * Maps English digits to Bengali digits
 */
export const EN_TO_BN_DIGITS: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

export function convertToBengaliDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, digit => EN_TO_BN_DIGITS[digit] || digit);
}

/**
 * Prepares and normalizes Bengali text for speech synthesis so that abbreviations,
 * currency symbols, and electrical terms sound natural to native speakers.
 */
export function prepareBengaliForSpeech(text: string): string {
  if (!text) return '';

  let spoken = text;

  // Replace BDT currency symbols with "টাকা"
  spoken = spoken.replace(/৳\s*([\d,]+)/g, '$1 টাকা');
  spoken = spoken.replace(/BDT\s*([\d,]+)/gi, '$1 টাকা');
  spoken = spoken.replace(/([\d,]+)\s*BDT/gi, '$1 টাকা');

  // Replace electrical units with spoken Bengali (supporting both English and Bengali digits)
  spoken = spoken.replace(/([0-9.০-৯]+)\s*kWh\b/gi, '$1 ইউনিট বা কিলোওয়াট ঘণ্টা');
  spoken = spoken.replace(/([0-9.০-৯]+)\s*kW\b/gi, '$1 কিলোওয়াট');
  spoken = spoken.replace(/([0-9.০-৯]+)\s*W\b/g, '$1 ওয়াট');

  // Replace tariff steps with spoken Bengali
  spoken = spoken.replace(/Step\s*1/gi, 'প্রথম ধাপ');
  spoken = spoken.replace(/Step\s*2/gi, 'দ্বিতীয় ধাপ');
  spoken = spoken.replace(/Step\s*3/gi, 'তৃতীয় ধাপ');
  spoken = spoken.replace(/Step\s*4/gi, 'চতুর্থ ধাপ');
  spoken = spoken.replace(/Step\s*5/gi, 'পঞ্চম ধাপ');
  spoken = spoken.replace(/Step\s*6/gi, 'ষষ্ঠ ধাপ');

  // Clean markdown asterisks, hashes, and bullets
  spoken = spoken
    .replace(/[*#_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return spoken;
}

/**
 * Creates TTS metadata optimized for browser Web Speech Synthesis
 */
export function createBanglaTtsMetadata(text: string): BanglaTtsMetadata {
  const spokenText = prepareBengaliForSpeech(text);

  return {
    originalText: text,
    spokenText,
    lang: 'bn-BD',
    rate: 0.95, // Slightly relaxed tempo for high intelligibility in technical topics
    pitch: 1.0,
    voiceGenderPreference: 'female',
  };
}
