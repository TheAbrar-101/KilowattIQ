import PDFDocument from 'pdfkit';
import { FullReportData } from '../../shared/types/energy';

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
   * Generates a PDF buffer using PDFKit for official energy report download
   */
  static async generatePDFReport(data: FullReportData): Promise<Buffer> {
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

        const primaryColor = '#0f172a'; // slate-900
        const accentEmerald = '#059669'; // emerald-600
        const textColor = '#1e293b'; // slate-800
        const mutedTextColor = '#64748b'; // slate-500
        const tableBgHeader = '#f1f5f9'; // slate-100
        const tableBgAlt = '#f8fafc'; // slate-50

        // --- HEADER BANNER ---
        doc.rect(36, 36, 523, 60).fill(primaryColor);
        
        doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('KILOWATTIQ', 50, 48);
        doc.fillColor('#10b981').fontSize(11).font('Helvetica-Bold').text('ENERGY AUDIT & ANALYTICS REPORT', 50, 68);

        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text(`Reporting Period: ${data.reportingPeriod}`, 320, 50, { align: 'right', width: 220 });
        doc.text(`Generated: ${data.generatedAt}`, 320, 65, { align: 'right', width: 220 });

        let y = 110;

        // --- HOUSEHOLD METADATA BOX ---
        doc.rect(36, y, 523, 65).fillAndStroke('#f8fafc', '#cbd5e1');
        doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('HOUSEHOLD INFORMATION', 48, y + 10);

        doc.fontSize(9).font('Helvetica').fillColor(textColor);
        doc.text(`Household Name: ${data.household.name}`, 48, y + 28);
        doc.text(`Account Serial: ${data.household.accountNumber}`, 48, y + 42);

        doc.text(`Utility Provider: ${data.household.utilityProvider}`, 300, y + 28);
        doc.text(`Sanctioned Capacity: ${data.household.sanctionedLoadKw} kW`, 300, y + 42);

        y += 80;

        // --- SECTION 1: EXECUTIVE ENERGY & FINANCIAL SUMMARY ---
        doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('1. Executive Energy & Billing Summary', 36, y);
        y += 18;

        const summaryBoxWidth = 120;
        const summaryBoxHeight = 50;

        // Box 1: Total Consumption
        doc.rect(36, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica-Bold').text('TOTAL CONSUMPTION', 42, y + 8);
        doc.fillColor(primaryColor).fontSize(13).font('Helvetica-Bold').text(`${data.energySummary.totalMonthlyKwh} kWh`, 42, y + 24);

        // Box 2: Projected Bill
        doc.rect(170, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica-Bold').text('PROJECTED BILL (BDT)', 176, y + 8);
        doc.fillColor(accentEmerald).fontSize(13).font('Helvetica-Bold').text(`BDT ${data.costAnalysis.grossTotalBDT}`, 176, y + 24);

        // Box 3: Monthly Budget
        doc.rect(304, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica-Bold').text('MONTHLY BUDGET', 310, y + 8);
        doc.fillColor('#d97706').fontSize(13).font('Helvetica-Bold').text(`BDT ${data.household.monthlyBudgetBDT}`, 310, y + 24);

        // Box 4: Effective Rate
        doc.rect(438, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, '#e2e8f0');
        doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica-Bold').text('EFFECTIVE RATE', 444, y + 8);
        doc.fillColor(textColor).fontSize(13).font('Helvetica-Bold').text(`BDT ${data.costAnalysis.effectiveRatePerKwh}/kWh`, 444, y + 24);

        y += 65;

        // --- SECTION 2: TARIFF SLAB BREAKDOWN ---
        doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('2. DESCO/DPDC LT-A Tariff Step Breakdown', 36, y);
        y += 18;

        // Table Header
        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
        doc.text('Slab Tier', 46, y + 5);
        doc.text('kWh in Slab', 200, y + 5);
        doc.text('Rate (BDT/kWh)', 330, y + 5);
        doc.text('Cost in Slab (BDT)', 440, y + 5);
        y += 20;

        if (data.costAnalysis.slabBreakdown) {
          data.costAnalysis.slabBreakdown.forEach((slab, i) => {
            if (i % 2 === 1) {
              doc.rect(36, y, 523, 18).fill(tableBgAlt);
            }
            doc.fillColor(textColor).fontSize(8.5).font('Helvetica');
            doc.text(slab.stepName, 46, y + 4);
            doc.text(`${slab.kwhInSlab} kWh`, 200, y + 4);
            doc.text(`BDT ${slab.rate.toFixed(2)}`, 330, y + 4);
            doc.text(`BDT ${slab.costBDT.toFixed(2)}`, 440, y + 4);
            y += 18;
          });
        }

        // Bill Charges Row
        y += 5;
        doc.fontSize(8.5).font('Helvetica').fillColor(mutedTextColor);
        doc.text(`Energy Charge: BDT ${data.costAnalysis.energyCostBDT} | Demand Charge: BDT ${data.costAnalysis.demandChargeBDT} | Meter Rent: BDT ${data.costAnalysis.meterRentBDT} | VAT (5%): BDT ${data.costAnalysis.vatBDT}`, 46, y);
        y += 25;

        // --- SECTION 3: APPLIANCE ENERGY AUDIT ---
        doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('3. Household Appliance Energy Breakdown', 36, y);
        y += 18;

        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
        doc.text('Appliance', 46, y + 5);
        doc.text('Room', 180, y + 5);
        doc.text('Power (W)', 280, y + 5);
        doc.text('Est. Monthly kWh', 370, y + 5);
        doc.text('Est. Cost (BDT)', 470, y + 5);
        y += 20;

        data.applianceAnalysis.slice(0, 6).forEach((app, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          doc.fillColor(textColor).fontSize(8.5).font('Helvetica');
          doc.text(app.name, 46, y + 4);
          doc.text(app.roomName, 180, y + 4);
          doc.text(`${app.ratedPowerW} W`, 280, y + 4);
          doc.text(`${app.estimatedMonthlyKwh} kWh`, 370, y + 4);
          doc.text(`BDT ${app.estimatedMonthlyCostBDT}`, 470, y + 4);
          y += 18;
        });

        y += 20;

        // --- NEW PAGE FOR VAMPIRE POWER & RECOMMENDATIONS ---
        doc.addPage();
        y = 36;

        // Header Banner for Page 2
        doc.rect(36, y, 523, 30).fill(primaryColor);
        doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('KILOWATTIQ • VAMPIRE AUDIT & AI ADVISORY', 48, y + 10);
        y += 45;

        // --- SECTION 4: VAMPIRE POWER AUDIT ---
        doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('4. Vampire / Standby Power Loss Audit', 36, y);
        y += 18;

        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold');
        doc.text('Appliance', 46, y + 5);
        doc.text('Room', 180, y + 5);
        doc.text('Standby W', 270, y + 5);
        doc.text('Monthly Loss (BDT)', 360, y + 5);
        doc.text('Annual Loss (BDT)', 460, y + 5);
        y += 20;

        data.vampirePowerAudit.reports.forEach((v, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          doc.fillColor(textColor).fontSize(8.5).font('Helvetica');
          doc.text(v.applianceName, 46, y + 4);
          doc.text(v.roomName, 180, y + 4);
          doc.text(`${v.standbyWatts} W`, 270, y + 4);
          doc.text(`BDT ${v.monthlyWastedBDT}`, 360, y + 4);
          doc.text(`BDT ${v.annualWastedBDT}`, 460, y + 4);
          y += 18;
        });

        y += 10;
        doc.rect(36, y, 523, 22).fillAndStroke('#fef2f2', '#fca5a5');
        doc.fillColor('#b91c1c').fontSize(9).font('Helvetica-Bold');
        doc.text(`Total Standby Waste: ${data.vampirePowerAudit.totalStandbyWatts} W  |  Monthly Loss: BDT ${data.vampirePowerAudit.totalMonthlyWastedBDT}  |  Annual Wasted: BDT ${data.vampirePowerAudit.totalAnnualWastedBDT}`, 46, y + 6);
        y += 35;

        // --- SECTION 5: RECOMMENDATIONS ---
        doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('5. Deterministic Recommendations', 36, y);
        y += 18;

        data.recommendations.forEach((rec) => {
          doc.rect(36, y, 523, 35).fillAndStroke(tableBgAlt, '#e2e8f0');
          doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold').text(`[${rec.priority}] ${rec.title}`, 44, y + 6);
          doc.fillColor(accentEmerald).fontSize(9).font('Helvetica-Bold').text(`Save BDT ${rec.estimatedMonthlySavingsBDT}/mo`, 380, y + 6, { align: 'right', width: 170 });
          doc.fillColor(textColor).fontSize(8).font('Helvetica').text(rec.actionableStep, 44, y + 20, { width: 500 });
          y += 40;
        });

        y += 10;

        // --- SECTION 6: AI ADVISOR INSIGHTS (IF AVAILABLE) ---
        if (data.aiAdvice) {
          doc.fillColor(accentEmerald).fontSize(12).font('Helvetica-Bold').text('6. Server-Side Gemini AI Energy Advisory', 36, y);
          y += 18;

          doc.rect(36, y, 523, 80).fillAndStroke('#f0fdf4', '#86efac');
          doc.fillColor('#166534').fontSize(9.5).font('Helvetica-Bold').text('Executive AI Advisory Summary', 46, y + 8);
          doc.fillColor(textColor).fontSize(8.5).font('Helvetica').text(data.aiAdvice.summary, 46, y + 22, { width: 503 });

          y += 90;
        }

        // FOOTER ON ALL PAGES
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).font('Helvetica').fillColor(mutedTextColor);
          doc.text(
            'KilowattIQ Smart Energy Management Platform • Verified DESCO/DPDC Tariff Slabs • Page ' +
              (i + 1) +
              ' of ' +
              range.count,
            36,
            800,
            { align: 'center', width: 523 }
          );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
