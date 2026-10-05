import PDFDocument from 'pdfkit';
import { FullReportData } from '../../shared/types/energy';
import {
  registerReportFonts,
  renderSmartText,
  FONT_NOTO_BENGALI,
  FONT_NOTO_BENGALI_BOLD,
  FONT_SOLAIMAN_LIPI,
  FONT_JETBRAINS_MONO,
  FONT_LATIN,
  FONT_LATIN_BOLD,
  hasBanglaCharacters,
} from '../../src/server/reports/pdf/fonts';

export type ReportLanguage = 'en' | 'bn' | 'both';

export class ReportService {
  /**
   * Generates formatted CSV energy audit report string for export
   */
  static generateCSVReport(data: FullReportData): string {
    const lines: string[] = [];

    const escapeCsv = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    lines.push('=== KILOWATTIQ SMART ENERGY AUDIT & ANALYTICS REPORT ===');
    lines.push(`Household Name,${escapeCsv(data.household.name)}`);
    lines.push(`Utility Provider,${escapeCsv(data.household.utilityProvider)}`);
    lines.push(`Account Number,${escapeCsv(data.household.accountNumber)}`);
    lines.push(`Sanctioned Capacity,${escapeCsv(data.household.sanctionedLoadKw)} kW`);
    lines.push(`Monthly Budget,BDT ${data.household.monthlyBudgetBDT}`);
    lines.push(`Reporting Period,${escapeCsv(data.reportingPeriod)}`);
    lines.push(`Report Generated Date,${escapeCsv(data.generatedAt)}`);
    lines.push('');

    lines.push('--- CONSUMPTION & ENERGY SUMMARY ---');
    lines.push(`Total Monthly Energy,${data.energySummary.totalMonthlyKwh} kWh`);
    lines.push(`Average Daily Consumption,${data.energySummary.avgDailyKwh} kWh/day`);
    lines.push(`Average Active Load,${data.energySummary.avgActivePowerW} W`);
    lines.push(`Peak Power Recorded,${data.energySummary.peakPowerW} W`);
    lines.push(`Peak Power Timestamp,${escapeCsv(data.energySummary.peakTimestamp)}`);
    lines.push('');

    lines.push('--- MONTHLY BILL BREAKDOWN (DESCO/DPDC BDT) ---');
    lines.push(`Tariff Type,${escapeCsv(data.costAnalysis.tariffType)}`);
    lines.push(`Energy Charge,BDT ${data.costAnalysis.energyCostBDT}`);
    lines.push(`Demand Charge,BDT ${data.costAnalysis.demandChargeBDT}`);
    lines.push(`Meter Rent,BDT ${data.costAnalysis.meterRentBDT}`);
    lines.push(`Govt VAT (5%),BDT ${data.costAnalysis.vatBDT}`);
    lines.push(`Gross Total Bill,BDT ${data.costAnalysis.grossTotalBDT}`);
    lines.push(`Effective Rate per kWh,BDT ${data.costAnalysis.effectiveRatePerKwh}`);
    lines.push('');

    if (data.costAnalysis.slabBreakdown && data.costAnalysis.slabBreakdown.length > 0) {
      lines.push('--- TARIFF SLAB STEP BREAKDOWN ---');
      lines.push('Slab Step,kWh in Slab,Rate per kWh (BDT),Cost in Slab (BDT)');
      for (const step of data.costAnalysis.slabBreakdown) {
        lines.push(`${escapeCsv(step.stepName)},${step.kwhInSlab},${step.rate},${step.costBDT}`);
      }
      lines.push('');
    }

    lines.push('--- BUDGET UTILIZATION STATUS ---');
    lines.push(`Target Monthly Budget,BDT ${data.budgetAnalysis.monthlyBudgetBDT}`);
    lines.push(`Current Spending (Est.),BDT ${data.budgetAnalysis.currentSpentBDT}`);
    lines.push(`Projected Month-End Cost,BDT ${data.budgetAnalysis.projectedCostBDT}`);
    lines.push(`Remaining Budget Balance,BDT ${data.budgetAnalysis.remainingBudgetBDT}`);
    lines.push(`Budget Utilization,${data.budgetAnalysis.budgetUtilizationPct}%`);
    lines.push(`Over-Budget Warning,${data.budgetAnalysis.isOverBudget ? 'YES - OVER BUDGET' : 'NO - WITHIN BUDGET'}`);
    lines.push('');

    lines.push('--- APPLIANCE ENERGY CONSUMPTION BREAKDOWN ---');
    lines.push('Appliance Name,Room,Rated Power (W),Monthly Est. kWh,Est. Monthly Cost (BDT),Status');
    for (const app of data.applianceAnalysis) {
      lines.push(`${escapeCsv(app.name)},${escapeCsv(app.roomName)},${app.ratedPowerW},${app.estimatedMonthlyKwh},${app.estimatedMonthlyCostBDT},${app.isOn ? 'ON' : 'OFF'}`);
    }
    lines.push('');

    lines.push('--- VAMPIRE / STANDBY POWER AUDIT ---');
    lines.push('Appliance Name,Room Area,Standby Power (W),Monthly Wasted (BDT),Annual Wasted (BDT),Severity');
    for (const v of data.vampirePowerAudit.reports) {
      lines.push(`${escapeCsv(v.applianceName)},${escapeCsv(v.roomName)},${v.standbyWatts},${v.monthlyWastedBDT},${v.annualWastedBDT},${escapeCsv(v.severity)}`);
    }
    lines.push(`Total Standby Load,${data.vampirePowerAudit.totalStandbyWatts} W`);
    lines.push(`Total Monthly Wasted Standby,BDT ${data.vampirePowerAudit.totalMonthlyWastedBDT}`);
    lines.push(`Total Annual Wasted Standby,BDT ${data.vampirePowerAudit.totalAnnualWastedBDT}`);
    lines.push('');

    lines.push('--- DETERMINISTIC RECOMMENDATIONS & EFFICIENCY ROI ---');
    lines.push('Priority,Title,Estimated Savings (BDT/mo),Actionable Step');
    for (const rec of data.recommendations) {
      lines.push(`${escapeCsv(rec.priority)},${escapeCsv(rec.title)},${rec.estimatedMonthlySavingsBDT},${escapeCsv(rec.actionableStep)}`);
    }
    lines.push('');

    if (data.roiAnalyses && data.roiAnalyses.length > 0) {
      lines.push('--- APPLIANCE UPGRADE ROI ---');
      lines.push('Current Appliance,Proposed Upgrade,Investment (BDT),Monthly Savings (BDT),Payback (Months),5-Yr Net Savings (BDT)');
      for (const roi of data.roiAnalyses) {
        lines.push(`${escapeCsv(roi.currentAppliance)},${escapeCsv(roi.proposedAppliance)},${roi.initialInvestmentBDT},${roi.monthlySavingsBDT},${roi.paybackPeriodMonths},${roi.fiveYearNetSavingsBDT}`);
      }
      lines.push('');
    }

    if (data.aiAdvice) {
      lines.push('--- AI ENERGY ADVISOR EXECUTIVE INSIGHTS ---');
      lines.push(`AI Summary,${escapeCsv(data.aiAdvice.summary)}`);
      lines.push('Priority Actions:');
      for (const act of data.aiAdvice.priorityActions) {
        lines.push(`- [${act.impact.toUpperCase()}] ${escapeCsv(act.title)}: ${escapeCsv(act.reason)}`);
      }
      lines.push(`Explanation,${escapeCsv(data.aiAdvice.explanation)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generates a PDF buffer using PDFKit with embedded Bangla and Monospace fonts
   */
  static async generatePDFReport(data: FullReportData, language: ReportLanguage = 'en'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 36,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', b => buffers.push(b));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', err => reject(err));

        // Register custom embedded fonts (Noto Sans Bengali, SolaimanLipi, JetBrains Mono)
        registerReportFonts(doc);

        const primaryColor = '#0f172a'; // slate-900
        const accentEmerald = '#059669'; // emerald-600
        const textColor = '#1e293b'; // slate-800
        const mutedTextColor = '#64748b'; // slate-500
        const tableBgHeader = '#f1f5f9'; // slate-100
        const tableBgAlt = '#f8fafc'; // slate-50

        // Helper for smart typography rendering
        const draw = (
          text: string,
          x?: number,
          y?: number,
          opts: {
            isBold?: boolean;
            isNumeric?: boolean;
            fontSize?: number;
            color?: string;
            align?: 'left' | 'center' | 'right' | 'justify';
            width?: number;
          } = {}
        ) => {
          renderSmartText(doc, text, x, y, opts);
        };

        const isBangla = language === 'bn';
        const isBoth = language === 'both';

        // --- HEADER BANNER ---
        doc.rect(36, 36, 523, 64).fill(primaryColor);

        // Header Title
        if (isBangla) {
          draw('কিলোওয়াট আইকিউ', 50, 46, { isBold: true, fontSize: 16, color: '#ffffff' });
          draw('এনার্জি অ্যানালাইসিস রিপোর্ট — ৳১২,৪৫০', 50, 68, { isBold: true, fontSize: 11, color: '#10b981' });
        } else if (isBoth) {
          draw('KILOWATTIQ • কিলোওয়াট আইকিউ', 50, 46, { isBold: true, fontSize: 15, color: '#ffffff' });
          draw('ENERGY AUDIT REPORT • এনার্জি অ্যানালাইসিস রিপোর্ট — ৳১২,৪৫০', 50, 68, { isBold: true, fontSize: 9.5, color: '#10b981' });
        } else {
          draw('KILOWATTIQ', 50, 46, { isBold: true, fontSize: 18, color: '#ffffff' });
          draw('ENERGY AUDIT & ANALYTICS REPORT', 50, 68, { isBold: true, fontSize: 11, color: '#10b981' });
        }

        const periodLabel = isBangla ? `রিপোর্টিং সময়কাল: ${data.reportingPeriod}` : `Reporting Period: ${data.reportingPeriod}`;
        const genLabel = isBangla ? `তৈরির তারিখ: ${data.generatedAt}` : `Generated: ${data.generatedAt}`;

        draw(periodLabel, 300, 48, { fontSize: 8.5, color: '#94a3b8', align: 'right', width: 240 });
        draw(genLabel, 300, 64, { fontSize: 8.5, color: '#94a3b8', align: 'right', width: 240, isNumeric: true });

        let y = 114;

        // --- HOUSEHOLD METADATA BOX ---
        doc.rect(36, y, 523, 65).fillAndStroke('#f8fafc', '#cbd5e1');
        const hhTitle = isBangla ? 'গ্রাহকের বিবরণী (Household Information)' : isBoth ? 'HOUSEHOLD INFORMATION • গ্রাহকের বিবরণী' : 'HOUSEHOLD INFORMATION';
        draw(hhTitle, 48, y + 10, { isBold: true, fontSize: 10.5, color: primaryColor });

        const nameLabel = isBangla ? `গ্রাহক / বাসা: ${data.household.name}` : `Household Name: ${data.household.name}`;
        const accLabel = isBangla ? `হিসাব নম্বর: ${data.household.accountNumber}` : `Account Serial: ${data.household.accountNumber}`;
        const utilLabel = isBangla ? `বিদ্যুৎ বিতরণ সংস্থা: ${data.household.utilityProvider}` : `Utility Provider: ${data.household.utilityProvider}`;
        const loadLabel = isBangla ? `অনুমোদিত লোড: ${data.household.sanctionedLoadKw} kW` : `Sanctioned Capacity: ${data.household.sanctionedLoadKw} kW`;

        draw(nameLabel, 48, y + 28, { fontSize: 9, color: textColor });
        draw(accLabel, 48, y + 42, { fontSize: 9, color: textColor, isNumeric: true });
        draw(utilLabel, 300, y + 28, { fontSize: 9, color: textColor });
        draw(loadLabel, 300, y + 42, { fontSize: 9, color: textColor, isNumeric: true });

        y += 80;

        // --- SECTION 1: EXECUTIVE ENERGY & FINANCIAL SUMMARY ---
        const sec1Title = isBangla
          ? '১. নির্বাহী এনার্জি ও বিলিং সারসংক্ষেপ'
          : isBoth
          ? '1. Executive Energy & Billing Summary (সারসংক্ষেপ)'
          : '1. Executive Energy & Billing Summary';
        draw(sec1Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
        y += 18;

        const summaryBoxWidth = 120;
        const summaryBoxHeight = 50;

        // Box 1: Total Consumption
        doc.rect(36, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        draw(isBangla ? 'মোট ব্যবহার' : 'TOTAL CONSUMPTION', 42, y + 8, { isBold: true, fontSize: 8, color: mutedTextColor });
        draw(`${data.energySummary.totalMonthlyKwh} kWh`, 42, y + 24, { isBold: true, fontSize: 12, color: primaryColor, isNumeric: true });

        // Box 2: Projected Bill
        doc.rect(170, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        draw(isBangla ? 'প্রাক্কলিত বিল (BDT)' : 'PROJECTED BILL (BDT)', 176, y + 8, { isBold: true, fontSize: 8, color: mutedTextColor });
        draw(`৳ ${data.costAnalysis.grossTotalBDT}`, 176, y + 24, { isBold: true, fontSize: 12, color: accentEmerald, isNumeric: true });

        // Box 3: Monthly Budget
        doc.rect(304, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        draw(isBangla ? 'মাসিক বাজেট' : 'MONTHLY BUDGET', 310, y + 8, { isBold: true, fontSize: 8, color: mutedTextColor });
        draw(`৳ ${data.household.monthlyBudgetBDT}`, 310, y + 24, { isBold: true, fontSize: 12, color: '#d97706', isNumeric: true });

        // Box 4: Effective Rate
        doc.rect(438, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        draw(isBangla ? 'কার্যকর রেট' : 'EFFECTIVE RATE', 444, y + 8, { isBold: true, fontSize: 8, color: mutedTextColor });
        draw(`৳ ${data.costAnalysis.effectiveRatePerKwh}/kWh`, 444, y + 24, { isBold: true, fontSize: 11.5, color: textColor, isNumeric: true });

        y += 65;

        // --- SECTION 2: TARIFF SLAB BREAKDOWN ---
        const sec2Title = isBangla
          ? '২. ডেসকো/ডিপিডিসি বিইআরসি স্ল্যাব ধাপভিত্তিক খরচ'
          : isBoth
          ? '2. DESCO/DPDC LT-A Tariff Step Breakdown (স্ল্যাব বিশ্লেষণ)'
          : '2. DESCO/DPDC LT-A Tariff Step Breakdown';
        draw(sec2Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
        y += 18;

        // Table Header
        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        draw(isBangla ? 'স্ল্যাব ধাপ' : 'Slab Tier', 46, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'ব্যবহৃত ইউনিট' : 'kWh in Slab', 200, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'রেট (টাকা/kWh)' : 'Rate (BDT/kWh)', 330, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'ধাপের খরচ (টাকা)' : 'Cost in Slab (BDT)', 440, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        y += 20;

        if (data.costAnalysis.slabBreakdown) {
          data.costAnalysis.slabBreakdown.forEach((slab, i) => {
            if (i % 2 === 1) {
              doc.rect(36, y, 523, 18).fill(tableBgAlt);
            }
            draw(slab.stepName, 46, y + 4, { fontSize: 8.5, color: textColor });
            draw(`${slab.kwhInSlab} kWh`, 200, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
            draw(`৳ ${slab.rate.toFixed(2)}`, 330, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
            draw(`৳ ${slab.costBDT.toFixed(2)}`, 440, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
            y += 18;
          });
        }

        // Bill Charges Row
        y += 5;
        const chargesText = isBangla
          ? `এনার্জি চার্জ: ৳ ${data.costAnalysis.energyCostBDT} | ডিমান্ড চার্জ: ৳ ${data.costAnalysis.demandChargeBDT} | মিটার ভাড়া: ৳ ${data.costAnalysis.meterRentBDT} | ভ্যাট (৫%): ৳ ${data.costAnalysis.vatBDT}`
          : `Energy Charge: BDT ${data.costAnalysis.energyCostBDT} | Demand Charge: BDT ${data.costAnalysis.demandChargeBDT} | Meter Rent: BDT ${data.costAnalysis.meterRentBDT} | VAT (5%): BDT ${data.costAnalysis.vatBDT}`;
        draw(chargesText, 46, y, { fontSize: 8, color: mutedTextColor, isNumeric: true });
        y += 25;

        // --- SECTION 3: APPLIANCE ENERGY AUDIT ---
        const sec3Title = isBangla
          ? '৩. গৃহস্থালি যন্ত্রপাতিভিত্তিক বিদ্যুৎ ব্যবহার'
          : isBoth
          ? '3. Household Appliance Energy Breakdown (যন্ত্রপাতিভিত্তিক ব্যবহার)'
          : '3. Household Appliance Energy Breakdown';
        draw(sec3Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
        y += 18;

        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        draw(isBangla ? 'যন্ত্রের নাম' : 'Appliance', 46, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'রুম/কক্ষ' : 'Room', 180, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'ক্ষমতা (W)' : 'Power (W)', 280, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'মাসিক ইউনিট' : 'Est. Monthly kWh', 370, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'মাসিক খরচ' : 'Est. Cost (BDT)', 470, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        y += 20;

        data.applianceAnalysis.slice(0, 6).forEach((app, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          draw(app.name, 46, y + 4, { fontSize: 8.5, color: textColor });
          draw(app.roomName, 180, y + 4, { fontSize: 8.5, color: textColor });
          draw(`${app.ratedPowerW} W`, 280, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          draw(`${app.estimatedMonthlyKwh} kWh`, 370, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          draw(`৳ ${app.estimatedMonthlyCostBDT}`, 470, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          y += 18;
        });

        y += 20;

        // --- NEW PAGE FOR VAMPIRE POWER & RECOMMENDATIONS ---
        doc.addPage();
        y = 36;

        // Header Banner for Page 2
        doc.rect(36, y, 523, 30).fill(primaryColor);
        const p2Header = isBangla
          ? 'কিলোওয়াট আইকিউ • ভ্যাম্পায়ার অডিট ও এআই অ্যাডভাইজরি'
          : 'KILOWATTIQ • VAMPIRE AUDIT & AI ADVISORY';
        draw(p2Header, 48, y + 10, { isBold: true, fontSize: 10.5, color: '#ffffff' });
        y += 45;

        // --- SECTION 4: VAMPIRE POWER AUDIT ---
        const sec4Title = isBangla
          ? '৪. ভ্যাম্পায়ার / স্ট্যান্ডবাই পাওয়ার অপচয় অডিট'
          : isBoth
          ? '4. Vampire / Standby Power Loss Audit (স্ট্যান্ডবাই অপচয়)'
          : '4. Vampire / Standby Power Loss Audit';
        draw(sec4Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
        y += 18;

        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        draw(isBangla ? 'যন্ত্রের নাম' : 'Appliance', 46, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'রুম' : 'Room', 180, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'স্ট্যান্ডবাই W' : 'Standby W', 270, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'মাসিক অপচয়' : 'Monthly Loss (BDT)', 360, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        draw(isBangla ? 'বাৎসরিক অপচয়' : 'Annual Loss (BDT)', 460, y + 5, { isBold: true, fontSize: 9, color: primaryColor });
        y += 20;

        data.vampirePowerAudit.reports.forEach((v, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          draw(v.applianceName, 46, y + 4, { fontSize: 8.5, color: textColor });
          draw(v.roomName, 180, y + 4, { fontSize: 8.5, color: textColor });
          draw(`${v.standbyWatts} W`, 270, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          draw(`৳ ${v.monthlyWastedBDT}`, 360, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          draw(`৳ ${v.annualWastedBDT}`, 460, y + 4, { fontSize: 8.5, color: textColor, isNumeric: true });
          y += 18;
        });

        y += 10;
        doc.rect(36, y, 523, 22).fillAndStroke('#fef2f2', '#fca5a5');
        const lossSummary = isBangla
          ? `মোট স্ট্যান্ডবাই লোড: ${data.vampirePowerAudit.totalStandbyWatts} W  |  মাসিক অপচয়: ৳ ${data.vampirePowerAudit.totalMonthlyWastedBDT}  |  বাৎসরিক ক্ষতি: ৳ ${data.vampirePowerAudit.totalAnnualWastedBDT}`
          : `Total Standby Waste: ${data.vampirePowerAudit.totalStandbyWatts} W  |  Monthly Loss: BDT ${data.vampirePowerAudit.totalMonthlyWastedBDT}  |  Annual Wasted: BDT ${data.vampirePowerAudit.totalAnnualWastedBDT}`;
        draw(lossSummary, 46, y + 6, { isBold: true, fontSize: 8.5, color: '#b91c1c', isNumeric: true });
        y += 35;

        // --- SECTION 5: RECOMMENDATIONS ---
        const sec5Title = isBangla
          ? '৫. সুনির্দিষ্ট সুপারিশ ও সাশ্রয়ের কৌশল'
          : isBoth
          ? '5. Deterministic Recommendations (বিদ্যুৎ সাশ্রয়ী পদক্ষেপ)'
          : '5. Deterministic Recommendations';
        draw(sec5Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
        y += 18;

        data.recommendations.forEach((rec) => {
          doc.rect(36, y, 523, 36).fillAndStroke(tableBgAlt, '#e2e8f0');
          draw(`[${rec.priority}] ${rec.title}`, 44, y + 6, { isBold: true, fontSize: 9, color: primaryColor });
          draw(`সাশ্রয়: ৳ ${rec.estimatedMonthlySavingsBDT}/মাস`, 360, y + 6, { isBold: true, fontSize: 9, color: accentEmerald, align: 'right', width: 190 });
          draw(rec.actionableStep, 44, y + 21, { fontSize: 8, color: textColor, width: 500 });
          y += 42;
        });

        y += 10;

        // --- SECTION 6: AI ADVISOR INSIGHTS (IF AVAILABLE) ---
        if (data.aiAdvice) {
          const sec6Title = isBangla
            ? '৬. সার্ভার-সাইড জেমিনি এআই এনার্জি অ্যাডভাইজরি'
            : '6. Server-Side Gemini AI Energy Advisory';
          draw(sec6Title, 36, y, { isBold: true, fontSize: 12, color: accentEmerald });
          y += 18;

          doc.rect(36, y, 523, 80).fillAndStroke('#f0fdf4', '#86efac');
          draw(isBangla ? 'জেমিনি এআই এনার্জি অ্যাডভাইজরি সারসংক্ষেপ' : 'Executive AI Advisory Summary', 46, y + 8, { isBold: true, fontSize: 9.5, color: '#166534' });
          draw(data.aiAdvice.summary, 46, y + 22, { fontSize: 8.5, color: textColor, width: 503 });

          y += 90;
        }

        // FOOTER ON ALL PAGES
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const footerText = isBangla
            ? `কিলোওয়াট আইকিউ স্মার্ট এনার্জি ম্যানেজমেন্ট প্ল্যাটফর্ম • বিইআরসি অনুমোদিত স্ল্যাব রেট • পৃষ্ঠা ${i + 1} / ${range.count}`
            : `KilowattIQ Smart Energy Management Platform • Verified DESCO/DPDC Tariff Slabs • Page ${i + 1} of ${range.count}`;
          draw(footerText, 36, 800, { fontSize: 7.5, color: mutedTextColor, align: 'center', width: 523 });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
