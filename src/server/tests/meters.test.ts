/**
 * Test Suite: Hardened No-IoT Real Household Meter Readings, Persistence,
 * Meter Replacement, Billing Cycles, Gemini Vision Hardening & SMS Fixtures.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MeterReadingService,
  MeterReadingValidationError,
  computeMeterUsageMetrics,
  getBillingCycleWindow,
} from '../meters/meterReadingService';
import {
  DEFAULT_GEMINI_VISION_MODEL,
  MeterVisionService,
  MeterVisionError,
  SCAN_DAILY_LIMIT,
  SCAN_HOURLY_LIMIT,
  ScanRateLimiter,
  resolveGeminiVisionModel,
} from '../meters/meterVisionService';
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

interface SmsFixture {
  utility: string;
  synthetic: boolean;
  expectedAmount?: number;
  expectedBalance?: number;
  expectedDate?: string;
  body: string;
}

function loadSmsFixtures(filePath: string): SmsFixture[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rawBlocks = raw.split(/^---\s*$/m).slice(1);
  const fixtures: SmsFixture[] = [];

  for (const block of rawBlocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

    if (lines.length === 0) continue;

    let utility = '';
    let synthetic = false;
    let expectedAmount: number | undefined;
    let expectedBalance: number | undefined;
    let expectedDate: string | undefined;
    const bodyLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('UTILITY:')) {
        utility = line.slice('UTILITY:'.length).trim();
      } else if (line.startsWith('SYNTHETIC:')) {
        synthetic = line.slice('SYNTHETIC:'.length).trim().toLowerCase() === 'true';
      } else if (line.startsWith('EXPECTED_AMOUNT:')) {
        expectedAmount = Number(line.slice('EXPECTED_AMOUNT:'.length).trim());
      } else if (line.startsWith('EXPECTED_BALANCE:')) {
        expectedBalance = Number(line.slice('EXPECTED_BALANCE:'.length).trim());
      } else if (line.startsWith('EXPECTED_DATE:')) {
        expectedDate = line.slice('EXPECTED_DATE:'.length).trim();
      } else {
        bodyLines.push(line);
      }
    }

    fixtures.push({
      utility,
      synthetic,
      expectedAmount,
      expectedBalance,
      expectedDate,
      body: bodyLines.join('\n').trim(),
    });
  }
  return fixtures;
}

function createMockSupabaseForMeters() {
  const readingsRows: any[] = [];
  const smsRows: any[] = [];
  const recordedFilters: string[] = [];

  const mockClient = {
    from(table: string) {
      const filters: Record<string, any> = {};
      const applyFilters = (rows: any[]) =>
        rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));

      const builder: any = {
        select() {
          return builder;
        },
        eq(col: string, val: any) {
          filters[col] = val;
          recordedFilters.push(`${table}.${col}=${val}`);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          if (table === 'households') {
            return Promise.resolve({ data: { billing_day: 1 }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: any) {
          if (table === 'meter_readings') readingsRows.push(payload);
          if (table === 'sms_records') smsRows.push(payload);
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: payload, error: null });
                },
              };
            },
          };
        },
        then(onFulfilled: (v: any) => any, onRejected?: (e: any) => any) {
          const target = table === 'meter_readings' ? readingsRows : smsRows;
          return Promise.resolve({ data: applyFilters(target), error: null }).then(
            onFulfilled,
            onRejected
          );
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { mockClient, readingsRows, smsRows, recordedFilters };
}

export async function runMetersTestSuite(): Promise<void> {
  console.log('--- RUNNING HARDENED NO-IOT METER READING & SMS TESTS ---');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilowattiq-meters-test-'));
  const storePath = path.join(tmpDir, 'meters-store.json');
  const rateLimitPath = path.join(tmpDir, 'scan-ratelimit.json');

  try {
    const svc1 = new MeterReadingService({ storePath });
    const hhId = 'hh_test_meters';
    const userA = 'user_alpha';
    const userB = 'user_beta';

    // ------------------------------------------------------------------
    // 1. Empty-start guarantee & strict user isolation
    // ------------------------------------------------------------------
    const initialReadings = await svc1.getReadings(hhId, userA);
    const initialSms = await svc1.getSmsRecords(hhId, userA);
    if (initialReadings.length !== 0 || initialSms.length !== 0) {
      throw new Error('Expected new (householdId, userId) to start with 0 readings and 0 SMS');
    }

    await svc1.addReading(hhId, userA, {
      readingKwh: 12000,
      readingDate: '2026-10-31',
      source: 'MANUAL',
    });
    const userBReadings = await svc1.getReadings(hhId, userB);
    if (userBReadings.length !== 0) {
      throw new Error(`Expected user isolation: userB saw ${userBReadings.length} readings from userA`);
    }
    console.log('  ✓ Test 1: Empty-start guarantee & strict user_id scoping verified');

    // ------------------------------------------------------------------
    // 2. Service restart persistence + Postgres/Supabase client wiring
    // ------------------------------------------------------------------
    await svc1.addReading(hhId, userA, {
      readingKwh: 12100,
      readingDate: '2026-11-10',
      source: 'MANUAL',
    });
    await svc1.addSmsRecord(hhId, userA, {
      smsType: 'RECHARGE',
      utility: 'DESCO',
      amountBdt: 1000,
      date: '2026-11-10',
      balanceBdt: 1250.5,
      unitsKwh: null,
      tokenLast4: '7890',
      rawText: 'DESCO Recharge Tk 1000.00 Token: 1234-5678-9012-3456-7890 Bal: Tk 1250.50',
    });
    await svc1.setHouseholdBillingDay(hhId, userA, 15);

    // Re-instantiate a brand new service pointing at the same storePath (zero RAM shared)
    const svc2 = new MeterReadingService({ storePath });
    const reloadedReadings = await svc2.getReadings(hhId, userA);
    const reloadedSms = await svc2.getSmsRecords(hhId, userA);
    const reloadedBillingDay = await svc2.getHouseholdBillingDay(hhId, userA);

    if (reloadedReadings.length !== 2 || reloadedReadings[1].readingKwh !== 12100) {
      throw new Error(`Expected 2 persisted readings after service restart, got ${reloadedReadings.length}`);
    }
    if (reloadedSms.length !== 1 || reloadedSms[0].amountBdt !== 1000) {
      throw new Error(`Expected 1 persisted SMS record after service restart, got ${reloadedSms.length}`);
    }
    if (reloadedBillingDay !== 15) {
      throw new Error(`Expected persisted billingDay=15 after restart, got ${reloadedBillingDay}`);
    }

    // Also verify Supabase client scoping path
    const { mockClient, recordedFilters } = createMockSupabaseForMeters();
    const svcPg = new MeterReadingService({ supabaseClient: mockClient });
    await svcPg.addReading(hhId, userA, {
      readingKwh: 500,
      readingDate: '2026-11-15',
      source: 'MANUAL',
    });
    const pgUserA = await svcPg.getReadings(hhId, userA);
    const pgUserB = await svcPg.getReadings(hhId, userB);
    if (pgUserA.length !== 1 || pgUserB.length !== 0) {
      throw new Error('Expected Supabase client query to isolate rows by user_id');
    }
    if (!recordedFilters.some((f) => f.startsWith('meter_readings.user_id='))) {
      throw new Error('Expected meter_readings query to explicitly filter by user_id');
    }
    console.log('  ✓ Test 2: Persistence survives service restart & Supabase RLS/user_id queries verified');

    // ------------------------------------------------------------------
    // 3. Per-segment monotonic validation & meter replacement
    // ------------------------------------------------------------------
    let lowerRejected = false;
    try {
      await svc2.addReading(hhId, userA, {
        readingKwh: 11950,
        readingDate: '2026-11-12',
        source: 'MANUAL',
      });
    } catch (err: any) {
      if (err instanceof MeterReadingValidationError && err.code === 'READING_LOWER_THAN_PREVIOUS') {
        lowerRejected = true;
      }
    }
    if (!lowerRejected) {
      throw new Error('Expected lower reading without isMeterReplacement to fail with READING_LOWER_THAN_PREVIOUS');
    }

    // Install replacement meter starting at 10 kWh while keeping old 12000 & 12100 readings
    const swapStart = await svc2.addReading(hhId, userA, {
      readingKwh: 10,
      readingDate: '2026-11-11',
      source: 'MANUAL',
      isMeterReplacement: true,
      notes: 'Replaced faulty meter',
    });
    if (swapStart.meterSegment !== 2 || !swapStart.isMeterReplacement) {
      throw new Error(`Expected replacement reading in meterSegment=2, got ${JSON.stringify(swapStart)}`);
    }

    await svc2.addReading(hhId, userA, {
      readingKwh: 50,
      readingDate: '2026-11-16',
      source: 'MANUAL',
    });

    const afterSwapReadings = await svc2.getReadings(hhId, userA);
    if (afterSwapReadings.length !== 4) {
      throw new Error(`Expected all 4 readings (old + new meter) kept, got ${afterSwapReadings.length}`);
    }

    // Usage in calendar month Nov 1..16 (billingDay=1): seg1 (12100 - 12000 = 100) + seg2 (50 - 10 = 40) = 140 kWh
    // Daily usage on seg2: (50 - 10) / 5 days = 8 kWh/day
    const swapMetrics = computeMeterUsageMetrics(afterSwapReadings, 3.0, '2026-11-16', 1);
    if (swapMetrics.monthToDateKwh !== 140) {
      throw new Error(`Expected segment-summed MTD=140 kWh across meter swap, got ${swapMetrics.monthToDateKwh}`);
    }
    if (swapMetrics.dailyUsageKwh !== 8 || swapMetrics.dailySpanDays !== 5) {
      throw new Error(
        `Expected segment-2 dailyUsageKwh=8 over 5 days, got ${swapMetrics.dailyUsageKwh} over ${swapMetrics.dailySpanDays} days`
      );
    }
    console.log('  ✓ Test 3: Meter replacement starts segment #2, keeps history, and avoids negative usage');

    // ------------------------------------------------------------------
    // 4. Household Billing Cycle Day (billingDay = 15)
    // ------------------------------------------------------------------
    const winBefore = getBillingCycleWindow('2026-11-10', 15);
    const winAfter = getBillingCycleWindow('2026-11-18', 15);
    if (winBefore.cycleStartDate !== '2026-10-15' || winBefore.cycleEndDate !== '2026-11-14') {
      throw new Error(`Unexpected cycle window before billingDay 15: ${JSON.stringify(winBefore)}`);
    }
    if (winAfter.cycleStartDate !== '2026-11-15' || winAfter.cycleEndDate !== '2026-12-14') {
      throw new Error(`Unexpected cycle window after billingDay 15: ${JSON.stringify(winAfter)}`);
    }

    const cycleHh = 'hh_cycle_15';
    await svc2.addReading(cycleHh, userA, { readingKwh: 1000, readingDate: '2026-10-10', source: 'MANUAL' });
    await svc2.addReading(cycleHh, userA, { readingKwh: 1060, readingDate: '2026-10-20', source: 'MANUAL' });
    await svc2.addReading(cycleHh, userA, { readingKwh: 1120, readingDate: '2026-11-10', source: 'MANUAL' });
    await svc2.addReading(cycleHh, userA, { readingKwh: 1150, readingDate: '2026-11-18', source: 'MANUAL' });
    const cycleReadings = await svc2.getReadings(cycleHh, userA);

    // On 2026-11-10 with billingDay=15: active cycle is 2026-10-15..2026-11-14.
    // Baseline before Oct 15 is Oct 10 (1000), latest in cycle up to Nov 10 is 1120 => MTD = 120 kWh!
    const mtdBeforeCycleEnd = computeMeterUsageMetrics(cycleReadings, 3.0, '2026-11-10', 15);
    if (
      mtdBeforeCycleEnd.cycleStartDate !== '2026-10-15' ||
      mtdBeforeCycleEnd.monthToDateKwh !== 120
    ) {
      throw new Error(
        `Expected cross-month billingDay=15 MTD=120 kWh on 2026-11-10, got ${JSON.stringify(mtdBeforeCycleEnd)}`
      );
    }

    // On 2026-11-18 with billingDay=15: active cycle is 2026-11-15..2026-12-14.
    // Baseline before Nov 15 is Nov 10 (1120), latest up to Nov 18 is 1150 => MTD = 30 kWh!
    const mtdNewCycle = computeMeterUsageMetrics(cycleReadings, 3.0, '2026-11-18', 15);
    if (
      mtdNewCycle.cycleStartDate !== '2026-11-15' ||
      mtdNewCycle.monthToDateKwh !== 30 ||
      mtdNewCycle.dailyUsageKwh !== 3.75
    ) {
      throw new Error(
        `Expected new cycle billingDay=15 MTD=30 kWh & daily=3.75 on 2026-11-18, got ${JSON.stringify(mtdNewCycle)}`
      );
    }
    console.log('  ✓ Test 4: Custom household billingDay=15 computes cross-month cycle MTD & resets properly');

    // ------------------------------------------------------------------
    // 5. SMS Fixtures File Runner (src/server/tests/fixtures/sms.txt)
    // ------------------------------------------------------------------
    const fixturePath = path.join(process.cwd(), 'src/server/tests/fixtures/sms.txt');
    const fixtures = loadSmsFixtures(fixturePath);
    if (fixtures.length < 3) {
      throw new Error(`Expected at least 3 fixtures in ${fixturePath}, found ${fixtures.length}`);
    }

    for (const fx of fixtures) {
      const res = parseUtilitySms(fx.body);
      if (!res.parsed) {
        throw new Error(`SMS fixture failed to parse.\nUtility: ${fx.utility}\nMessage: "${fx.body}"\nReason: ${res.failureReason}`);
      }
      if (fx.utility && res.utility !== fx.utility) {
        throw new Error(`SMS fixture utility mismatch (expected ${fx.utility}, got ${res.utility}).\nMessage: "${fx.body}"`);
      }
      if (fx.expectedAmount !== undefined && res.amountBdt !== fx.expectedAmount) {
        throw new Error(`SMS fixture amount mismatch (expected ${fx.expectedAmount}, got ${res.amountBdt}).\nMessage: "${fx.body}"`);
      }
      if (fx.expectedBalance !== undefined && res.balanceBdt !== fx.expectedBalance) {
        throw new Error(`SMS fixture balance mismatch (expected ${fx.expectedBalance}, got ${res.balanceBdt}).\nMessage: "${fx.body}"`);
      }
      if (fx.expectedDate !== undefined && res.date !== fx.expectedDate) {
        throw new Error(`SMS fixture date mismatch (expected ${fx.expectedDate}, got ${res.date}).\nMessage: "${fx.body}"`);
      }
    }

    const garbageSms = parseUtilitySms('Hey are we still meeting at Dhanmondi 27 at 5?');
    if (garbageSms.parsed || !garbageSms.failureReason) {
      throw new Error(`Expected unrecognized SMS to fail cleanly, got: ${JSON.stringify(garbageSms)}`);
    }
    console.log(`  ✓ Test 5: All ${fixtures.length} SMS fixtures parsed cleanly (+ plain failure on garbage text)`);

    // ------------------------------------------------------------------
    // 6. STS Token Masking (last 4 digits only)
    // ------------------------------------------------------------------
    const tokenSms = parseUtilitySms(
      'DESCO: Recharge Tk 1,500.00 successful on 16/11/2026. Token: 1234-5678-9012-3456-7890. Bal: Tk 1842.50'
    );
    if (
      tokenSms.tokenLast4 !== '7890' ||
      tokenSms.tokenMasked !== '****-****-****-****-7890' ||
      tokenSms.rawText.includes('1234-5678')
    ) {
      throw new Error(`Parsed SMS leaked full STS token: ${JSON.stringify(tokenSms)}`);
    }

    const savedSmsList = await svc2.getSmsRecords(hhId, userA);
    const savedRecord = savedSmsList[0];
    if (
      savedRecord.tokenLast4 !== '7890' ||
      savedRecord.tokenMasked !== '****-****-****-****-7890' ||
      savedRecord.rawText.includes('1234-5678') ||
      savedRecord.rawText.includes('12345678')
    ) {
      throw new Error(`Persisted SMS record must mask STS token to last 4 digits only: ${JSON.stringify(savedRecord)}`);
    }
    const rawDiskContent = fs.readFileSync(storePath, 'utf8');
    if (rawDiskContent.includes('1234-5678') || rawDiskContent.includes('12345678')) {
      throw new Error('Disk store contained unmasked STS token digits!');
    }
    console.log('  ✓ Test 6: Full 20-digit STS tokens masked everywhere; only last 4 digits stored');

    // ------------------------------------------------------------------
    // 7. Gemini Vision Hardening (env model, invalid model, non-image, >4MB, rate limit)
    // ------------------------------------------------------------------
    const prevKey = process.env.GEMINI_API_KEY;
    const prevModel = process.env.GEMINI_VISION_MODEL;
    try {
      // 7a. Env model resolution
      delete process.env.GEMINI_VISION_MODEL;
      if (resolveGeminiVisionModel() !== DEFAULT_GEMINI_VISION_MODEL) {
        throw new Error(`Expected default model ${DEFAULT_GEMINI_VISION_MODEL}`);
      }
      process.env.GEMINI_VISION_MODEL = 'gemini-custom-vision-test';
      if (resolveGeminiVisionModel() !== 'gemini-custom-vision-test') {
        throw new Error('Expected resolveGeminiVisionModel() to read process.env.GEMINI_VISION_MODEL');
      }

      // 7b. Reject missing API key cleanly
      process.env.GEMINI_API_KEY = '';
      const visionDefault = new MeterVisionService();
      let missingKeyRejected = false;
      try {
        await visionDefault.extractMeterReadingFromImage('dGVzdA==', 'image/png');
      } catch (err: any) {
        if (err instanceof MeterVisionError && err.code === 'GEMINI_KEY_MISSING') {
          missingKeyRejected = true;
        }
      }
      if (!missingKeyRejected) {
        throw new Error('Expected MeterVisionService to reject when GEMINI_API_KEY is missing');
      }

      // 7c. Reject non-image data (PDF header bytes, SVG, and non-image MIME)
      process.env.GEMINI_API_KEY = 'test-fake-key-for-validation-only';
      const pdfBase64 = Buffer.from('%PDF-1.4\n%fake-pdf-payload-long-enough', 'utf8').toString('base64');
      const svgBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8').toString('base64');
      const fakePngTextBase64 = Buffer.from('not-actually-a-png-file-at-all', 'utf8').toString('base64');

      for (const [label, b64, mime] of [
        ['PDF MIME', pdfBase64, 'application/pdf'],
        ['SVG text', svgBase64, 'image/svg+xml'],
        ['Spoofed PNG bytes', fakePngTextBase64, 'image/png'],
      ] as const) {
        let rejected = false;
        try {
          await visionDefault.extractMeterReadingFromImage(b64, mime);
        } catch (err: any) {
          if (err instanceof MeterVisionError && err.code === 'NON_IMAGE_DATA' && err.statusCode === 400) {
            rejected = true;
          }
        }
        if (!rejected) {
          throw new Error(`Expected non-image payload (${label}) to be rejected with 400 NON_IMAGE_DATA`);
        }
      }

      // 7d. Reject >4MB image payload
      const bigJpeg = Buffer.alloc(4 * 1024 * 1024 + 512, 0);
      bigJpeg[0] = 0xff;
      bigJpeg[1] = 0xd8;
      bigJpeg[2] = 0xff;
      let tooLargeRejected = false;
      try {
        await visionDefault.extractMeterReadingFromImage(bigJpeg.toString('base64'), 'image/jpeg');
      } catch (err: any) {
        if (err instanceof MeterVisionError && err.code === 'IMAGE_TOO_LARGE' && err.statusCode === 413) {
          tooLargeRejected = true;
        }
      }
      if (!tooLargeRejected) {
        throw new Error('Expected >4MB image payload to be rejected with 413 IMAGE_TOO_LARGE');
      }

      // 7e. Valid minimal PNG + invalid model name surfaces clear check-model-name error
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]).toString('base64');

      const invalidModelVision = new MeterVisionService(async ({ model }) => {
        const err: any = new Error(`404 NOT_FOUND: Model ${model} does not exist`);
        err.status = 404;
        throw err;
      });

      let invalidModelCaught = false;
      try {
        await invalidModelVision.extractMeterReadingFromImage(validPng, 'image/png');
      } catch (err: any) {
        if (
          err instanceof MeterVisionError &&
          err.code === 'INVALID_GEMINI_MODEL' &&
          err.message.includes('GEMINI_VISION_MODEL')
        ) {
          invalidModelCaught = true;
        }
      }
      if (!invalidModelCaught) {
        throw new Error('Expected invalid model API error to surface clear INVALID_GEMINI_MODEL guidance');
      }

      // 7f. Rate limiter: 10/hr and 100/day per user -> HTTP 429
      const limiter = new ScanRateLimiter(rateLimitPath);
      const t0 = 1_700_000_000_000;
      for (let i = 0; i < SCAN_HOURLY_LIMIT; i++) {
        await limiter.consumeOrReject('rate_user_hr', t0 + i * 1000);
      }
      let hr429 = false;
      try {
        await limiter.consumeOrReject('rate_user_hr', t0 + 20_000);
      } catch (err: any) {
        if (err instanceof MeterVisionError && err.statusCode === 429) {
          hr429 = true;
        }
      }
      if (!hr429) {
        throw new Error(`Expected 11th scan within an hour to return HTTP 429`);
      }

      // Daily limit across 11 separate hours (< 10/hr each, 100/day total -> 101st fails with 429)
      for (let bucket = 0; bucket < 10; bucket++) {
        for (let k = 0; k < SCAN_HOURLY_LIMIT; k++) {
          await limiter.consumeOrReject('rate_user_day', t0 + bucket * 3_700_000 + k * 1000);
        }
      }
      if (SCAN_DAILY_LIMIT !== 100) {
        throw new Error(`Expected SCAN_DAILY_LIMIT to be 100`);
      }
      let day429 = false;
      try {
        await limiter.consumeOrReject('rate_user_day', t0 + 11 * 3_700_000);
      } catch (err: any) {
        if (err instanceof MeterVisionError && err.statusCode === 429) {
          day429 = true;
        }
      }
      if (!day429) {
        throw new Error('Expected 101st scan in 24h to return HTTP 429');
      }
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
      else delete process.env.GEMINI_API_KEY;
      if (prevModel !== undefined) process.env.GEMINI_VISION_MODEL = prevModel;
      else delete process.env.GEMINI_VISION_MODEL;
    }

    // 7g. Client bundle isolation check: no @google/genai or GEMINI_API_KEY in client code
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
    console.log('  ✓ Test 7: Vision model env config, non-image/size checks, 429 rate limits & client isolation verified');

    console.log('✅ [PASS] All Hardened No-IoT Meter Reading & SMS Tests Succeeded!');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('meters.test')) {
  runMetersTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [FAIL] Meters Test Failed:', err);
      process.exit(1);
    });
}
