/**
 * Golden Bills Verifiability Fixture & Regression Guard
 *
 * NOTE: The starter EXAMPLE entries below are SYNTHETIC — replace them with
 * real DESCO / DPDC / BPDB paper bills before trusting this test suite.
 * This test run will fail with a warning if every entry is still marked as Example.
 *
 * Each bill MUST match TariffCalculator.calculateCost() within 1.0% tolerance,
 * otherwise this suite fails loudly with a non-zero exit code.
 */

import { TariffCalculator, DEFAULT_BILL_ROUNDING_MODE } from '../../../backend/engine/TariffCalculator';
import { BillVerifier } from '../bills/billVerifier';
import { BillRoundingMode } from '../../../shared/types/energy';

export interface GoldenBillFixture {
  utility: 'DESCO' | 'DPDC' | 'BPDB' | 'BREB' | 'WZPDCL' | 'NESCO';
  month: string; // e.g. '2026-06' or '2026-05'
  units: number;
  expected_total: number;
  sanctionedLoadKw?: number;
  roundingMode?: BillRoundingMode;
  /** Clearly marks starter examples to be replaced with verified real utility bills */
  isExample: boolean;
  note?: string;
}

export const MAX_ALLOWED_VARIANCE_PERCENT = 1.0;

/**
 * GOLDEN BILLS FIXTURE
 * ---------------------------------------------------------------------------
 * Replace the 3 EXAMPLE entries below with values read directly from real
 * DESCO / DPDC / BPDB paper bills (matching utility, month, units, and
 * sanctioned load). Do not delete the EXAMPLE marker until replaced with a
 * real verified bill.
 */
export const GOLDEN_BILLS: GoldenBillFixture[] = [
  {
    utility: 'DESCO',
    month: '2026-05',
    units: 285,
    expected_total: 2277.49,
    sanctionedLoadKw: 4.5,
    isExample: true,
    note: 'EXAMPLE 1 — Replace with real pre-June 2026 bill (BERC-LTA-2024-03 baseline)',
  },
  {
    utility: 'DPDC',
    month: '2026-07',
    units: 285,
    expected_total: 2583.11,
    sanctionedLoadKw: 4.5,
    isExample: true,
    note: 'EXAMPLE 2 — Replace with real post-June 2026 bill (BERC-LTA-2026-06 baseline)',
  },
  {
    utility: 'BPDB',
    month: '2026-06',
    units: 45,
    expected_total: 348.97,
    sanctionedLoadKw: 2.0,
    isExample: true,
    note: 'EXAMPLE 3 — Replace with real Lifeline (<= 50 kWh) utility bill',
  },
];

export interface GoldenBillAuditRow {
  fixture: GoldenBillFixture;
  tariffVersionId: string;
  calculatedTotal: number;
  diffBdt: number;
  diffPercent: number;
  passed: boolean;
}

/**
 * Evaluates a list of golden bills against TariffCalculator and fails loudly
 * if any entry deviates from expected_total by more than 1%.
 */
export function verifyGoldenBills(
  bills: GoldenBillFixture[] = GOLDEN_BILLS,
  maxTolerancePct: number = MAX_ALLOWED_VARIANCE_PERCENT
): GoldenBillAuditRow[] {
  const auditRows: GoldenBillAuditRow[] = [];
  const failures: string[] = [];

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (bill.expected_total <= 0) {
      throw new Error(`Invalid expected_total (${bill.expected_total}) on golden bill #${i + 1}`);
    }

    const calc = TariffCalculator.calculateCost(
      bill.units,
      bill.sanctionedLoadKw ?? 3.0,
      'SLAB',
      undefined,
      {
        billingPeriod: bill.month,
        roundingMode: bill.roundingMode ?? DEFAULT_BILL_ROUNDING_MODE,
      }
    );

    const diffBdt = Number((calc.grossTotalBDT - bill.expected_total).toFixed(2));
    const diffPercent = Number(((Math.abs(diffBdt) / bill.expected_total) * 100).toFixed(4));
    const passed = diffPercent <= maxTolerancePct;

    auditRows.push({
      fixture: bill,
      tariffVersionId: calc.tariffVersionId || 'UNKNOWN',
      calculatedTotal: calc.grossTotalBDT,
      diffBdt,
      diffPercent,
      passed,
    });

    if (!passed) {
      failures.push(
        `FAIL [${bill.isExample ? 'EXAMPLE' : 'REAL'}] #${i + 1} ${bill.utility} ${bill.month} (${bill.units} kWh): ` +
        `expected ৳${bill.expected_total.toFixed(2)}, calculated ৳${calc.grossTotalBDT.toFixed(2)} ` +
        `(diff ${diffBdt >= 0 ? '+' : ''}৳${diffBdt.toFixed(2)} / ${diffPercent}% > ${maxTolerancePct}% limit)`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `GOLDEN BILLS VERIFICATION FAILED (${failures.length}/${bills.length} exceeded ${maxTolerancePct}% tolerance):\n` +
      failures.map(f => `  - ${f}`).join('\n')
    );
  }

  return auditRows;
}

export async function runGoldenBillsSuite(): Promise<void> {
  console.log('--- RUNNING GOLDEN BILLS & ROUNDING VERIFIABILITY SUITE ---');

  // 1. Validate GOLDEN_BILLS fixture within <= 1% tolerance
  const results = verifyGoldenBills(GOLDEN_BILLS, MAX_ALLOWED_VARIANCE_PERCENT);
  for (const row of results) {
    const tag = row.fixture.isExample ? '[EXAMPLE]' : '[REAL BILL]';
    console.log(
      `  ✓ ${tag} ${row.fixture.utility} ${row.fixture.month} | ${row.fixture.units} kWh | ` +
      `Expected: ৳${row.fixture.expected_total.toFixed(2)} | Calculated (${row.tariffVersionId}): ৳${row.calculatedTotal.toFixed(2)} | ` +
      `Variance: ${row.diffPercent.toFixed(3)}%`
    );
  }

  // 2. Assert that >1% discrepancy MUST fail loudly
  let threwOnMismatch = false;
  try {
    verifyGoldenBills(
      [
        {
          utility: 'DESCO',
          month: '2026-07',
          units: 285,
          expected_total: 2400.0, // >7% away from 2583.11
          sanctionedLoadKw: 4.5,
          isExample: true,
        },
      ],
      MAX_ALLOWED_VARIANCE_PERCENT
    );
  } catch (err: any) {
    if (String(err?.message || '').includes('GOLDEN BILLS VERIFICATION FAILED')) {
      threwOnMismatch = true;
    }
  }
  if (!threwOnMismatch) {
    throw new Error('Expected verifyGoldenBills to fail loudly when variance exceeds 1%');
  }
  console.log('  ✓ Loud failure confirmed when expected_total differs by > 1%');

  // 3. Assert default rounding mode is FINAL and PER_SLAB is configurable
  if (DEFAULT_BILL_ROUNDING_MODE !== 'FINAL') {
    throw new Error(`Expected default rounding mode 'FINAL', got '${DEFAULT_BILL_ROUNDING_MODE}'`);
  }
  const finalCalc = TariffCalculator.calculateCost(285, 4.5, 'SLAB', undefined, {
    billingPeriod: '2026-07',
    roundingMode: 'FINAL',
  });
  const perSlabCalc = TariffCalculator.calculateCost(285, 4.5, 'SLAB', undefined, {
    billingPeriod: '2026-07',
    roundingMode: 'PER_SLAB',
  });
  if (finalCalc.roundingMode !== 'FINAL' || perSlabCalc.roundingMode !== 'PER_SLAB') {
    throw new Error('Rounding mode option not propagated to CostCalculation result');
  }
  console.log(
    `  ✓ Configurable rounding verified: FINAL=৳${finalCalc.grossTotalBDT.toFixed(2)} vs PER_SLAB=৳${perSlabCalc.grossTotalBDT.toFixed(2)}`
  );

  // 4. Verify BillVerifier hypothesis diagnosis (old tariff vs random unexplained)
  const verifier = BillVerifier.getInstance();
  const oldTariffDiag = verifier.verifyBill('hh_golden_test', {
    utility: 'DESCO',
    month: '2026-07',
    unitsKwh: 285,
    totalBdt: 2277.49,
    sanctionedLoadKw: 4.5,
    meterReading: { previous: 10000, present: 10285, difference: 285 },
    confidence: 1.0,
  }, 4.5);

  if (oldTariffDiag.topExplanation?.code !== 'TARIFF_VERSION') {
    throw new Error(`Expected TARIFF_VERSION top explanation, got: ${oldTariffDiag.topExplanation?.code}`);
  }
  console.log(
    `  ✓ BillVerifier hypothesis diagnosis verified: ${oldTariffDiag.topExplanation.code} (residual ৳${oldTariffDiag.topExplanation.residualBdt.toFixed(2)})`
  );

  // 5. Fail with a clear warning if every entry in GOLDEN_BILLS is still a synthetic Example
  if (GOLDEN_BILLS.every(b => b.isExample)) {
    console.warn(
      '⚠️  WARNING: Every entry in GOLDEN_BILLS is still a synthetic EXAMPLE. ' +
      'Replace at least one entry with a verified real utility bill (isExample: false) before trusting this test.'
    );
    throw new Error(
      'GOLDEN_BILLS contains only synthetic EXAMPLE entries — replace with real bills before trusting the test.'
    );
  }

  console.log('✅ [PASS] Golden Bills & Verifiability Suite Passed!');
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('goldenBills.test')) {
  runGoldenBillsSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [FAIL]', err?.message || err);
      process.exit(1);
    });
}
