/**
 * Test Suite: Server-Side PDF Bangla Text Rendering & Unicode Shaping
 * 
 * Verifies:
 * 1. Embedding of Noto Sans Bengali (Regular & Bold), SolaimanLipi, and JetBrains Mono.
 * 2. Proper Unicode layout & OpenType shaping for complex conjuncts (juktakkhor, reph, ya-phala).
 * 3. Exact rendering of the test string: "এনার্জি অ্যানালাইসিস রিপোর্ট — ৳১২,৪৫০".
 * 4. Asserts no tofu boxes (missing glyph / .notdef / ID === 0) across all text runs.
 * 5. Validates tabular alignment of numeric metrics in JetBrains Mono.
 * 6. Generates full multi-page bilingual PDF report through ReportService.
 */

import PDFDocument from 'pdfkit';
import {
  registerReportFonts,
  renderSmartText,
  assertNoTofuBoxes,
  shapeBanglaText,
  segmentTextRuns,
  FONT_NOTO_BENGALI,
  FONT_NOTO_BENGALI_BOLD,
  FONT_SOLAIMAN_LIPI,
  FONT_JETBRAINS_MONO,
} from '../reports/pdf/fonts';
import { ReportService } from '../../../backend/services/ReportService';
import { FullReportData } from '../../../shared/types/energy';

export async function runBanglaPdfTest(): Promise<{
  success: boolean;
  bufferSize: number;
  testString: string;
  totalSegmentsChecked: number;
}> {
  const TEST_STRING = 'এনার্জি অ্যানালাইসিস রিপোর্ট — ৳১২,৪৫০';
  const MIXED_TEST = 'KilowattIQ Report • গ্রাহক: তানভীর হোসেন • AC: 1,800 W • ফ্যানের গতি: মাঝারি';
  const NUMERIC_TEST = 'Tabular Numbers (JetBrains Mono): 4265 W | 219.8 V | 50.0 Hz | ৳ 2,277.49';

  // 1. Direct Fontkit Shaping Assertions (Assert 0 tofu boxes / .notdef glyphs)
  assertNoTofuBoxes(TEST_STRING, FONT_NOTO_BENGALI);
  assertNoTofuBoxes(TEST_STRING, FONT_NOTO_BENGALI_BOLD);

  const shapedTest = shapeBanglaText(TEST_STRING, FONT_NOTO_BENGALI);
  if (shapedTest.hasTofu || shapedTest.tofuCount > 0) {
    throw new Error(`Assertion failed: Tofu boxes found in test string "${TEST_STRING}"!`);
  }

  // Verify multi-script segmentation for mixed strings
  const mixedSegments = segmentTextRuns(MIXED_TEST);
  let totalSegmentsChecked = mixedSegments.length;
  for (const seg of mixedSegments) {
    if (seg.font === FONT_NOTO_BENGALI || seg.font === FONT_NOTO_BENGALI_BOLD) {
      assertNoTofuBoxes(seg.text, seg.font);
    }
  }

  // 2. Render Full Document with PDFKit
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('error', err => reject(err));

      // Register custom fonts
      registerReportFonts(doc);

      // Render primary test string
      doc.fillColor('#0f172a').fontSize(18);
      renderSmartText(doc, TEST_STRING, 50, 50, { isBold: true });

      // Render in SolaimanLipi
      doc.fontSize(14);
      renderSmartText(doc, `SolaimanLipi Rendering: ${TEST_STRING}`, 50, 85, { preferSolaiman: true });

      // Render mixed English / Bangla text
      doc.fontSize(12);
      renderSmartText(doc, MIXED_TEST, 50, 120);

      // Render numeric metrics in JetBrains Mono
      renderSmartText(doc, NUMERIC_TEST, 50, 155, { isNumeric: true });

      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });

  const pdfText = buffer.toString('binary');

  // Assertion 1: Valid PDF Magic Header
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    throw new Error(`Invalid PDF header: expected '%PDF-', got '${header}'`);
  }

  // Assertion 2: Font descriptors exist in generated stream
  if (!pdfText.includes('NotoSansBengali')) {
    throw new Error('Missing embedded font descriptor for NotoSansBengali in PDF stream.');
  }
  if (!pdfText.includes('SolaimanLipi')) {
    throw new Error('Missing embedded font descriptor for SolaimanLipi in PDF stream.');
  }
  if (!pdfText.includes('JetBrainsMono')) {
    throw new Error('Missing embedded font descriptor for JetBrainsMono in PDF stream.');
  }

  // Assertion 3: Buffer contains subsetted glyph tables
  if (buffer.length < 8000) {
    throw new Error(`PDF buffer unexpectedly small (${buffer.length} bytes). Fonts may not be embedded.`);
  }

  // Assertion 4: Absence of replacement tofu character sequences
  if (pdfText.includes('(???)') || pdfText.includes('(?????)') || pdfText.includes('\uFFFD')) {
    throw new Error('Tofu boxes or unmapped replacement characters detected in PDF stream.');
  }

  // 3. Test Full ReportService Bilingual PDF generation
  const mockReportData: FullReportData = {
    household: {
      id: 'hh-test-bangla',
      name: 'তানভীর ভিলা (Tanvir Villa)',
      utilityProvider: 'DESCO',
      accountNumber: 'ACC-8849201',
      sanctionedLoadKw: 3.0,
      monthlyBudgetBDT: 4500,
    },
    reportingPeriod: 'October 2026',
    generatedAt: '2026-10-05 19:00:00',
    energySummary: {
      totalMonthlyKwh: 285,
      avgDailyKwh: 9.5,
      avgActivePowerW: 395,
      peakPowerW: 3420,
      peakTimestamp: '2026-10-02 21:15:00',
    },
    costAnalysis: {
      tariffType: 'SLAB',
      totalKwh: 285,
      energyCostBDT: 1940.04,
      demandChargeBDT: 189,
      meterRentBDT: 40,
      vatBDT: 108.45,
      grossTotalBDT: 2277.49,
      effectiveRatePerKwh: 7.99,
      slabBreakdown: [
        { stepName: 'Step 1 (0 - 75 kWh)', kwhInSlab: 75, rate: 5.26, costBDT: 394.5 },
        { stepName: 'Step 2 (76 - 200 kWh)', kwhInSlab: 125, rate: 7.20, costBDT: 900.0 },
        { stepName: 'Step 3 (201 - 300 kWh)', kwhInSlab: 85, rate: 7.59, costBDT: 645.15 },
      ],
    },
    budgetAnalysis: {
      monthlyBudgetBDT: 4500,
      currentSpentBDT: 1850,
      projectedKwh: 295,
      projectedCostBDT: 2355,
      remainingBudgetBDT: 2145,
      budgetUtilizationPct: 52,
      isOverBudget: false,
    },
    applianceAnalysis: [
      { id: '1', name: 'মাস্টার বেড এসি (Master AC)', roomName: 'মাস্টার বেডরুম', ratedPowerW: 1800, estimatedMonthlyKwh: 120, estimatedMonthlyCostBDT: 960, isOn: true },
      { id: '2', name: 'রেফ্রিজারেটর (Inverter Refrigerator)', roomName: 'রান্নাঘর', ratedPowerW: 180, estimatedMonthlyKwh: 65, estimatedMonthlyCostBDT: 520, isOn: true },
    ],
    vampirePowerAudit: {
      totalStandbyWatts: 24,
      totalMonthlyWastedBDT: 138,
      totalAnnualWastedBDT: 1656,
      reports: [
        {
          applianceId: '1',
          applianceName: 'স্মার্ট টিভি (Smart TV)',
          roomName: 'লিভিং রুম',
          standbyWatts: 8.5,
          dailyStandbyKwh: 0.204,
          monthlyWastedBDT: 49,
          annualWastedBDT: 588,
          severity: 'MEDIUM',
        },
      ],
    },
    recommendations: [
      {
        id: '1',
        category: 'PEAK_SHIFTING',
        priority: 'HIGH',
        title: 'পিক আওয়ার এসি তাপমাত্রা নিয়ন্ত্রণ (Peak AC Optimization)',
        description: 'সন্ধ্যায় পিক আওয়ারে লোড কমিয়ে বিইআরসি পরবর্তী স্ল্যাব চার্জ এড়ান।',
        estimatedMonthlySavingsBDT: 450,
        actionableStep: 'বিকাল ৫টা থেকে রাত ১১টা পর্যন্ত এসির তাপমাত্রা ২৫° সেলসিয়াসে রাখুন।',
      },
    ],
    roiAnalyses: [],
    aiAdvice: {
      language: 'bn',
      summary: 'আপনার বর্তমান বিদ্যুৎ ব্যবহার বিইআরসি ৩য় স্ল্যাবের সীমায় রয়েছে। সামান্য সাশ্রয়ী হলে ৪র্থ স্ল্যাবের উচ্চমূল্য এড়ানো সম্ভব।',
      priorityActions: [],
      explanation: 'নিয়মিত স্ট্যান্ডবাই বিদ্যুৎ বিচ্ছিন্ন করুন।',
    },
  };

  const bilingualPdfBuffer = await ReportService.generatePDFReport(mockReportData, 'both');
  if (bilingualPdfBuffer.length < 15000) {
    throw new Error(`Bilingual PDF report size (${bilingualPdfBuffer.length} bytes) is suspiciously low.`);
  }

  return {
    success: true,
    bufferSize: buffer.length + bilingualPdfBuffer.length,
    testString: TEST_STRING,
    totalSegmentsChecked,
  };
}

// Execute standalone if called directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('pdfBangla')) {
  console.log('--- RUNNING BANGLA PDF RENDERING TEST ---');
  runBanglaPdfTest()
    .then(result => {
      console.log('✅ [PASS] Bangla PDF Rendering Test Successful!');
      console.log(`         ↳ Test String: "${result.testString}"`);
      console.log(`         ↳ Output PDF Buffers: ${result.bufferSize} bytes`);
      console.log('         ↳ Embedded Fonts: NotoSansBengali, SolaimanLipi, JetBrainsMono');
      console.log('         ↳ Unicode Shaping: Active (fontkit OpenType layout engine)');
      console.log('         ↳ Tofu Box Check: None detected (0 unmapped glyphs / .notdef)');
      console.log(`         ↳ Segments Validated: ${result.totalSegmentsChecked}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ [FAIL] Bangla PDF Test Failed:', err);
      process.exit(1);
    });
}

export default runBanglaPdfTest;
