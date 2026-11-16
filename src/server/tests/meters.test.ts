/**
 * Test Suite: No-IoT Real Household Meter Readings, Gemini Scan Boundary & Utility SMS Parser
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  MeterReadingService,
  MeterReadingValidationError,
  computeMeterUsageMetrics,
} from '../meters/meterReadingService';
import { MeterVisionService, MeterVisionError } from '../meters/meterVisionService';
import { parseUtilitySms } from '../meters/smsParser';

function collectClientFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectClientFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export async function runMetersTestSuite(): Promise<void> {
  console.log('--- RUNNING NO-IOT METER READING & SMS PARSER TESTS ---');

  const svc = MeterReadingService.getInstance();
  const hhId = 'hh_test_meters';
  svc.clearReadings(hhId);

  // 1. Starts empty (real readings only, no simulated prefill)
  if (svc.getReadings(hhId).length !== 0) {
    throw new Error('Expected new household to start with 0 real readings');
  }
  console.log('  ✓ Test 1: Household real readings start clean/empty (no simulated defaults)');

  // 2. Monotonic validation: reject reading lower than previous reading
  svc.addReading(hhId, { readingKwh: 12000, readingDate: '2026-10-31', source: 'MANUAL' });
  let lowerRejected = false;
  try {
    svc.addReading(hhId, { readingKwh: 11950, readingDate: '2026-11-05', source: 'MANUAL' });
  } catch (err: any) {
    if (err instanceof MeterReadingValidationError && err.code === 'READING_LOWER_THAN_PREVIOUS') {
      lowerRejected = true;
    }
  }
  if (!lowerRejected) {
    throw new Error('Expected reading lower than previous reading to be rejected');
  }
  console.log('  ✓ Test 2: Reading lower than previous reading rejected with READING_LOWER_THAN_PREVIOUS');

  // 3. Daily usage & Month-to-Date calculation from chronological readings
  svc.addReading(hhId, { readingKwh: 12120, readingDate: '2026-11-10', source: 'MANUAL' });
  svc.addReading(hhId, { readingKwh: 12180, readingDate: '2026-11-16', source: 'MANUAL' });
  const readings = svc.getReadings(hhId);
  const metrics = computeMeterUsageMetrics(readings, 3.0, '2026-11-16');

  // Daily span: 2026-11-10 -> 2026-11-16 (6 days), delta 60 kWh => 10 kWh/day
  if (metrics.dailyUsageKwh !== 10 || metrics.dailySpanDays !== 6) {
    throw new Error(`Expected dailyUsageKwh=10 over 6 days, got ${metrics.dailyUsageKwh} over ${metrics.dailySpanDays} days`);
  }
  // MTD: baseline 2026-10-31 (12000) -> latest in Nov (12180) => 180 kWh
  if (metrics.monthToDateKwh !== 180) {
    throw new Error(`Expected monthToDateKwh=180, got ${metrics.monthToDateKwh}`);
  }
  if (metrics.monthToDateEstimatedCostBdt === null || metrics.monthToDateEstimatedCostBdt <= 0) {
    throw new Error('Expected positive BERC estimated MTD cost');
  }
  console.log(
    `  ✓ Test 3: Daily usage (${metrics.dailyUsageKwh} kWh/day) & MTD (${metrics.monthToDateKwh} kWh, ৳${metrics.monthToDateEstimatedCostBdt}) computed accurately`
  );

  // 4. SMS Parsing: DESCO Recharge SMS
  const descoSms = parseUtilitySms(
    'DESCO: Recharge Tk 1,500.00 successful on 16/11/2026. Token: 1234-5678-9012-3456-7890. Bal: Tk 1842.50'
  );
  if (
    !descoSms.parsed ||
    descoSms.utility !== 'DESCO' ||
    descoSms.amountBdt !== 1500 ||
    descoSms.date !== '2026-11-16' ||
    descoSms.balanceBdt !== 1842.5 ||
    descoSms.token !== '1234-5678-9012-3456-7890'
  ) {
    throw new Error(`DESCO recharge SMS parse mismatch: ${JSON.stringify(descoSms)}`);
  }
  console.log('  ✓ Test 4a: DESCO recharge SMS parsed (amount, date, balance, token)');

  // 4b. SMS Parsing: DPDC Postpaid Bill SMS
  const dpdcSms = parseUtilitySms(
    'DPDC Bill for Oct 2026 Tk 2450.75 paid on 2026-11-12 for 260 kWh. Thank you.'
  );
  if (!dpdcSms.parsed || dpdcSms.utility !== 'DPDC' || dpdcSms.amountBdt !== 2450.75 || dpdcSms.date !== '2026-11-12' || dpdcSms.unitsKwh !== 260) {
    throw new Error(`DPDC bill SMS parse mismatch: ${JSON.stringify(dpdcSms)}`);
  }
  console.log('  ✓ Test 4b: DPDC bill SMS parsed (amount, date, kWh)');

  // 4c. SMS Parsing: Bengali numerals
  const bnSms = parseUtilitySms('ডেসকো: রিচার্জ ১০০০ টাকা সফল হয়েছে ১৬/১১/২০২৬। বর্তমান ব্যালেন্স ৪৫০.৫০ টাকা।');
  if (!bnSms.parsed || bnSms.utility !== 'DESCO' || bnSms.amountBdt !== 1000 || bnSms.balanceBdt !== 450.5 || bnSms.date !== '2026-11-16') {
    throw new Error(`Bengali SMS parse mismatch: ${JSON.stringify(bnSms)}`);
  }
  console.log('  ✓ Test 4c: Bengali numeral SMS parsed cleanly');

  // 4d. SMS Parsing failure case
  const garbageSms = parseUtilitySms('Hey are we still meeting at Dhanmondi 27 at 5?');
  if (garbageSms.parsed || !garbageSms.failureReason) {
    throw new Error(`Expected unrecognized SMS to fail cleanly, got: ${JSON.stringify(garbageSms)}`);
  }
  console.log('  ✓ Test 4d: Unrecognized SMS returns parsed=false with plain failure message');

  // 5. Gemini Vision server boundary & never-auto-save check
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  const visionSvc = MeterVisionService.getInstance();
  let rejectedMissingKey = false;
  try {
    await visionSvc.extractMeterReadingFromImage('dGVzdA==', 'image/png');
  } catch (err: any) {
    if (err instanceof MeterVisionError && err.code === 'GEMINI_KEY_MISSING') {
      rejectedMissingKey = true;
    }
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  }
  if (!rejectedMissingKey) {
    throw new Error('Expected MeterVisionService to reject cleanly when GEMINI_API_KEY is missing (no fake OCR fallback)');
  }
  if (svc.getReadings(hhId).length !== 3) {
    throw new Error('MeterVisionService must never modify stored meter readings');
  }

  // Client bundle isolation check: no @google/genai or GEMINI_API_KEY in client directories
  const clientDirs = ['src/components', 'src/context', 'src/hooks', 'src/lib'];
  for (const relDir of clientDirs) {
    const absDir = path.join(process.cwd(), relDir);
    for (const file of collectClientFiles(absDir)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('@google/genai') || content.includes('GEMINI_API_KEY')) {
        throw new Error(`Client file must never reference Gemini SDK or API key: ${file}`);
      }
    }
  }
  console.log('  ✓ Test 5: Gemini API strictly server-only & Scan meter never auto-saves or fakes output');

  console.log('✅ [PASS] All No-IoT Meter Reading & SMS Tests Succeeded!');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('meters.test')) {
  runMetersTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [FAIL] Meters Test Failed:', err);
      process.exit(1);
    });
}
