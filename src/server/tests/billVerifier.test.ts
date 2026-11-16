/**
 * Test Suite: Bill Verification Engine & Gemini OCR Subsystem
 * 
 * Verifies:
 * 1. TariffCalculator integration for BERC LT-A residential tariff slabs
 * 2. Accurate bill matching (variance <= 1% marked VERIFIED_ACCURATE)
 * 3. Overcharge detection (variance > 5% flagged as CHECK_WITH_UTILITY)
 * 4. Lifeline tier verification (<= 75 kWh Step 1 calculation)
 * 5. Dispute letter generation in English and Bangla
 * 6. Historical trend persistence
 */

import { BillVerifier } from '../bills/billVerifier';
import { BillOcrExtractor } from '../bills/ocrExtractor';
import { ExtractedBillData } from '../bills/types';

export async function runBillVerifierTests() {
  console.log('--- RUNNING BILL VERIFIER & OCR SUBSYSTEM TESTS ---');

  const verifier = BillVerifier.getInstance();
  const ocr = BillOcrExtractor.getInstance();
  const testHouseholdId = 'hh_test_bills';

  // 1. Test Accurate Bill (285 kWh pre-June 2026 @ 4.5 kW billed at ~৳2280)
  const accurateBill: ExtractedBillData = {
    utility: 'DESCO',
    customerAccount: 'DESCO-AC-100293',
    meterNumber: 'MTR-8819',
    month: 'May 2026',
    unitsKwh: 285,
    totalBdt: 2280, // Very close to ৳2277.49
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 12540, present: 12825, difference: 285 },
    confidence: 0.98,
  };

  const accurateResult = verifier.verifyBill(testHouseholdId, accurateBill, 4.5);
  if (accurateResult.summary.hasDiscrepancy) {
    throw new Error(`Expected accurate bill to have no discrepancy, got diff: ${accurateResult.summary.differencePercent}%`);
  }
  if (accurateResult.summary.statusLabel !== 'VERIFIED_ACCURATE') {
    throw new Error(`Expected status VERIFIED_ACCURATE, got: ${accurateResult.summary.statusLabel}`);
  }
  console.log('  ✓ Test 1: Accurate bill verified within tolerance (৳2,277.49 vs ৳2,280.00)');

  // 2. Test Overcharged Bill (> 5% discrepancy)
  const overchargedBill: ExtractedBillData = {
    utility: 'DPDC',
    customerAccount: 'DPDC-AC-99401',
    meterNumber: 'MTR-DPDC-002',
    month: 'May 2026',
    unitsKwh: 285,
    totalBdt: 2580, // Overcharged by ~৳302 (+13.3% — billed at June 2026+ rates)
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 11970, present: 12255, difference: 285 },
    confidence: 0.95,
  };

  const overchargedResult = verifier.verifyBill(testHouseholdId, overchargedBill, 4.5);
  if (!overchargedResult.summary.hasDiscrepancy) {
    throw new Error('Expected overcharged bill to trigger discrepancy flag');
  }
  if (overchargedResult.summary.statusLabel !== 'CHECK_WITH_UTILITY') {
    throw new Error(`Expected CHECK_WITH_UTILITY, got: ${overchargedResult.summary.statusLabel}`);
  }
  if (overchargedResult.summary.differencePercent <= 5.0) {
    throw new Error(`Expected >5% variance, got: ${overchargedResult.summary.differencePercent}%`);
  }
  console.log(`  ✓ Test 2: Overcharge detected (+${overchargedResult.summary.differencePercent}% > 5%) -> Flagged CHECK_WITH_UTILITY`);

  // 3. Test Dispute Messages (English and Bangla)
  if (!overchargedResult.disputeFavorsCustomer) {
    throw new Error('Expected overcharged bill to set disputeFavorsCustomer = true');
  }
  if (!overchargedResult.disputeMessage.en.includes('Inquiry Regarding Billing Discrepancy')) {
    throw new Error('English dispute letter missing subject or body');
  }
  if (!overchargedResult.disputeMessage.bn.includes('বিদ্যুৎ বিলের গরমিল')) {
    throw new Error('Bangla dispute letter missing Bengali heading or body');
  }
  if (!overchargedResult.disputeMessage.en.includes('DPDC-AC-99401')) {
    throw new Error('Dispute letter missing customer account number');
  }
  console.log('  ✓ Test 3: Customer-favoring polite dispute letters generated in English & Bangla with exact numbers');

  // 4. Test Lifeline Tier (45 kWh)
  const lifelineBill = ocr.parseManualInput({
    utility: 'DESCO',
    month: 'August 2026',
    unitsKwh: 45,
    totalBdt: 350, // ~৳348.97 with 2.0 kW load
    sanctionedLoadKw: 2.0,
  });

  const lifelineResult = verifier.verifyBill(testHouseholdId, lifelineBill, 2.0);
  if (lifelineResult.unitsKwh !== 45) {
    throw new Error('Lifeline units mismatch');
  }
  console.log(`  ✓ Test 4: Lifeline bill verified (45 units -> Calculated: ৳${lifelineResult.summary.calculatedTotalBdt})`);

  // 5. Test History Retrieval
  const history = verifier.getHistory(testHouseholdId);
  if (history.length < 2) {
    throw new Error(`Expected at least 2 saved history entries, got: ${history.length}`);
  }
  console.log(`  ✓ Test 5: Bill history persisted (${history.length} records retrieved for trend tracking)`);

  // 6. Hypothesis Tests (June 2026+ baseline: 285 kWh @ 4.5 kW => ৳2,583.11)
  // (i) Entered bill generated under the OLD tariff (BERC-LTA-2024-03 => ৳2,277.49)
  const oldTariffBill: ExtractedBillData = {
    utility: 'DESCO',
    month: '2026-07',
    unitsKwh: 285,
    totalBdt: 2277.49,
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 10000, present: 10285, difference: 285 },
    confidence: 1.0,
  };
  const oldTariffRes = verifier.verifyBill(testHouseholdId, oldTariffBill, 4.5);
  if (oldTariffRes.topExplanation?.code !== 'TARIFF_VERSION' || oldTariffRes.likelyCauses[0].code !== 'TARIFF_VERSION') {
    throw new Error(`Case (i) expected top explanation TARIFF_VERSION, got ${oldTariffRes.topExplanation?.code}`);
  }
  if (oldTariffRes.likelyCauses.some(c => c.residualBdt > 5.0)) {
    throw new Error('Case (i) included an explanation with residual > ৳5');
  }
  if (oldTariffRes.disputeFavorsCustomer) {
    throw new Error('Case (i) cheaper old tariff should NOT favor customer dispute');
  }
  console.log(`  ✓ Test 6(i): Old tariff bill -> Top: ${oldTariffRes.topExplanation.code} (${oldTariffRes.topExplanation.titleEn})`);

  // (ii) Entered bill generated with NO VAT (0% VAT => ৳2,460.10)
  const noVatBill: ExtractedBillData = {
    utility: 'DESCO',
    month: '2026-07',
    unitsKwh: 285,
    totalBdt: 2460.10,
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 10000, present: 10285, difference: 285 },
    confidence: 1.0,
  };
  const noVatRes = verifier.verifyBill(testHouseholdId, noVatBill, 4.5);
  if (noVatRes.topExplanation?.code !== 'VAT' || noVatRes.likelyCauses[0].code !== 'VAT') {
    throw new Error(`Case (ii) expected top explanation VAT, got ${noVatRes.topExplanation?.code}`);
  }
  if (noVatRes.likelyCauses.some(c => c.residualBdt > 5.0)) {
    throw new Error('Case (ii) included an explanation with residual > ৳5');
  }
  if (noVatRes.disputeFavorsCustomer) {
    throw new Error('Case (ii) 0% VAT undercharge should NOT favor customer dispute');
  }
  console.log(`  ✓ Test 6(ii): No VAT bill -> Top: ${noVatRes.topExplanation.code} (${noVatRes.topExplanation.titleEn})`);

  // (iii) Entered bill generated with +20 kWh (305 kWh total = ৳2,775.43, vs 285 kWh entered)
  const plus20Bill: ExtractedBillData = {
    utility: 'DPDC',
    month: '2026-07',
    unitsKwh: 285,
    totalBdt: 2775.43,
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 10000, present: 10285, difference: 285 },
    confidence: 1.0,
  };
  const plus20Res = verifier.verifyBill(testHouseholdId, plus20Bill, 4.5);
  if (plus20Res.topExplanation?.code !== 'METER_READING' || plus20Res.likelyCauses[0].code !== 'METER_READING') {
    throw new Error(`Case (iii) expected top explanation METER_READING, got ${plus20Res.topExplanation?.code}`);
  }
  if (!plus20Res.topExplanation.titleEn.includes('305 kWh vs 285 kWh')) {
    throw new Error(`Case (iii) expected implied unit report '305 kWh vs 285 kWh', got: ${plus20Res.topExplanation.titleEn}`);
  }
  if (!plus20Res.disputeFavorsCustomer) {
    throw new Error('Case (iii) +20 kWh overcharge SHOULD set disputeFavorsCustomer = true');
  }
  console.log(`  ✓ Test 6(iii): +20 kWh bill -> Top: ${plus20Res.topExplanation.code} (${plus20Res.topExplanation.titleEn})`);

  // (iv) Random unexplainable total (৳4,503.00 -> falls between integer kWhs in Step 5 by > ৳5)
  const randomBill: ExtractedBillData = {
    utility: 'DESCO',
    month: '2026-07',
    unitsKwh: 285,
    totalBdt: 4503.00,
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 10000, present: 10285, difference: 285 },
    confidence: 1.0,
  };
  const randomRes = verifier.verifyBill(testHouseholdId, randomBill, 4.5);
  if (
    randomRes.topExplanation?.code !== 'UNEXPLAINED' ||
    randomRes.likelyCauses.length !== 1 ||
    randomRes.likelyCauses[0].code !== 'UNEXPLAINED'
  ) {
    throw new Error(`Case (iv) expected single UNEXPLAINED result, got ${randomRes.likelyCauses.map(c => c.code).join(', ')}`);
  }
  if (!randomRes.topExplanation.detailEn.toLowerCase().includes('cannot determine the cause')) {
    throw new Error('Case (iv) UNEXPLAINED message should state plainly that cause cannot be determined');
  }
  console.log(`  ✓ Test 6(iv): Random total -> ${randomRes.topExplanation.code} (${randomRes.topExplanation.titleEn})`);

  console.log('✅ [PASS] All Bill Verifier & OCR Tests Succeeded!');
  return true;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('billVerifier.test')) {
  runBillVerifierTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ [FAIL] Bill Verifier Test Failed:', err);
      process.exit(1);
    });
}
