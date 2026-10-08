/**
 * KilowattIQ Bill Verifier Engine
 * 
 * Purpose:
 * Evaluates utility bill claims against deterministic BERC tariff slabs,
 * standard demand charges, and VAT rules using the existing TariffCalculator.
 * Computes line-by-line differences, detects > 5% overcharge discrepancies,
 * generates formal bilateral dispute drafts (English and Bangla), and
 * persists historical verification records for audit trend tracking.
 */

import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import { ExtractedBillData, VerificationResult, ComparisonRow, BillHistoryRecord } from './types';
import { BD_DEFAULT_SLAB_TARIFF } from '../../../shared/constants/bdTariffs';

export class BillVerifier {
  private static instance: BillVerifier;
  private historyMap: Map<string, BillHistoryRecord[]> = new Map();

  public static getInstance(): BillVerifier {
    if (!BillVerifier.instance) {
      BillVerifier.instance = new BillVerifier();
    }
    return BillVerifier.instance;
  }

  /**
   * Evaluates an extracted bill against BERC residential LT-A tariff formulas
   */
  public verifyBill(
    householdId: string,
    billData: ExtractedBillData,
    customSanctionedLoadKw?: number,
    billImageUrl?: string
  ): VerificationResult {
    const sanctionedLoad = customSanctionedLoadKw ?? billData.sanctionedLoadKw ?? 3.0;

    // 1. Recalculate using canonical TariffCalculator (do not duplicate logic!)
    const calculated = TariffCalculator.calculateCost(
      billData.unitsKwh,
      sanctionedLoad,
      'SLAB',
      BD_DEFAULT_SLAB_TARIFF
    );

    // 2. Derive utility line-item values if not itemized on the paper bill
    const utilityGross = billData.totalBdt;
    const kilGross = calculated.grossTotalBDT;
    const diffGross = utilityGross - kilGross;
    const diffGrossPercent = kilGross > 0 ? (diffGross / kilGross) * 100 : 0;

    // Derived or explicit line items
    const utilityEnergy = billData.claimedEnergyCostBdt ?? Math.max(0, utilityGross - calculated.demandChargeBDT - calculated.meterRentBDT - calculated.vatBDT);
    const utilityDemand = billData.claimedDemandChargeBdt ?? calculated.demandChargeBDT;
    const utilityMeterRent = billData.claimedMeterRentBdt ?? calculated.meterRentBDT;
    const utilityVat = billData.claimedVatBdt ?? (utilityGross - (utilityEnergy + utilityDemand + utilityMeterRent));

    // 3. Construct comparison rows
    const createRow = (item: string, itemBn: string, uVal: number, kVal: number): ComparisonRow => {
      const diff = Number((uVal - kVal).toFixed(2));
      const pct = kVal > 0 ? Number(((diff / kVal) * 100).toFixed(2)) : 0;
      let status: 'MATCH' | 'DISCREPANCY' | 'OVERCHARGED' | 'UNDERCHARGED' = 'MATCH';
      if (Math.abs(pct) > 1.0) {
        if (diff > 0) status = 'OVERCHARGED';
        else status = 'UNDERCHARGED';
      }
      return {
        item,
        itemBn,
        utility: Number(uVal.toFixed(2)),
        kilowattiq: Number(kVal.toFixed(2)),
        difference: diff,
        diffPercent: pct,
        status,
      };
    };

    const energyRow = createRow('Energy Charge (BERC Slabs)', 'বিদ্যুৎ শক্তি চার্জ (স্ল্যাব অনুযায়ী)', utilityEnergy, calculated.energyCostBDT);
    const demandRow = createRow('Demand Charge', 'ডিমান্ড চার্জ', utilityDemand, calculated.demandChargeBDT);
    const meterRentRow = createRow('Meter Rent', 'মিটার ভাড়া', utilityMeterRent, calculated.meterRentBDT);
    const vatRow = createRow('Government VAT (5%)', 'সরকারি ভ্যাট (৫%)', utilityVat, calculated.vatBDT);
    const grossRow = createRow('Total Payable Bill', 'সর্বমোট প্রদেয় বিল', utilityGross, kilGross);

    // 4. Discrepancy flag threshold (> 5% difference)
    const hasDiscrepancy = Math.abs(diffGrossPercent) > 5.0;
    const isOvercharged = diffGrossPercent > 5.0;
    const isUndercharged = diffGrossPercent < -5.0;

    const statusLabel: 'VERIFIED_ACCURATE' | 'CHECK_WITH_UTILITY' | 'INCONCLUSIVE' = hasDiscrepancy
      ? 'CHECK_WITH_UTILITY'
      : 'VERIFIED_ACCURATE';

    // 5. Generate copy-ready dispute letters in English and Bangla
    const disputeMessage = this.generateDisputeDrafts(
      billData,
      calculated,
      diffGross,
      diffGrossPercent,
      sanctionedLoad
    );

    const verificationResult: VerificationResult = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      householdId,
      utility: billData.utility,
      month: billData.month,
      unitsKwh: billData.unitsKwh,
      meterReading: billData.meterReading,
      sanctionedLoadKw: sanctionedLoad,
      comparison: {
        energyCost: energyRow,
        demandCharge: demandRow,
        meterRent: meterRentRow,
        vat: vatRow,
        grossTotal: grossRow,
      },
      summary: {
        billedTotalBdt: Number(utilityGross.toFixed(2)),
        calculatedTotalBdt: Number(kilGross.toFixed(2)),
        differenceBdt: Number(diffGross.toFixed(2)),
        differencePercent: Number(diffGrossPercent.toFixed(2)),
        isOvercharged,
        isUndercharged,
        hasDiscrepancy,
        statusLabel,
      },
      disputeMessage,
      slabBreakdown: calculated.slabBreakdown || [],
      verifiedAt: new Date().toISOString(),
      billImageUrl,
    };

    // 6. Save to history
    this.saveToHistory(householdId, {
      id: verificationResult.id,
      householdId,
      month: billData.month,
      utility: billData.utility,
      unitsKwh: billData.unitsKwh,
      billedTotalBdt: Number(utilityGross.toFixed(2)),
      calculatedTotalBdt: Number(kilGross.toFixed(2)),
      differenceBdt: Number(diffGross.toFixed(2)),
      differencePercent: Number(diffGrossPercent.toFixed(2)),
      hasDiscrepancy,
      statusLabel,
      verifiedAt: verificationResult.verifiedAt,
      notes: `${billData.utility} Bill verification for ${billData.unitsKwh} kWh`,
    });

    return verificationResult;
  }

  /**
   * Generates formal English and Bangla dispute messages
   */
  private generateDisputeDrafts(
    bill: ExtractedBillData,
    calc: any,
    diffBdt: number,
    diffPct: number,
    sanctionedLoad: number
  ): { en: string; bn: string } {
    const diffSign = diffBdt > 0 ? `+৳${diffBdt.toFixed(2)}` : `-৳${Math.abs(diffBdt).toFixed(2)}`;
    const slabLinesEn = (calc.slabBreakdown || [])
      .map((s: any) => `  • ${s.stepName}: ${s.kwhInSlab} kWh @ ৳${s.rate}/unit = ৳${s.costBDT}`)
      .join('\n');

    const slabLinesBn = (calc.slabBreakdown || [])
      .map((s: any) => `  • ${s.stepName}: ${s.kwhInSlab} ইউনিট @ ৳${s.rate}/ইউনিট = ৳${s.costBDT}`)
      .join('\n');

    const en = `Subject: Inquiry Regarding Billing Discrepancy for ${bill.month} [Account: ${bill.customerAccount || 'N/A'}]

Dear ${bill.utility} Customer Care & Billing Department,

I am writing regarding my electricity bill for ${bill.month} (Meter No: ${bill.meterNumber || 'N/A'}, Account: ${bill.customerAccount || 'N/A'}).

According to the bill issued, my total billed consumption is ${bill.unitsKwh} kWh, with a total payable amount of ৳${bill.totalBdt.toFixed(2)} BDT.

However, based on the official BERC LT-A residential telescopic tariff schedule and 5% government VAT:
1. Energy Charge (${bill.unitsKwh} kWh across BERC tiers): ৳${calc.energyCostBDT.toFixed(2)} BDT
${slabLinesEn}
2. Demand Charge (${sanctionedLoad} kW @ ৳42/kW): ৳${calc.demandChargeBDT.toFixed(2)} BDT
3. Meter Rent: ৳${calc.meterRentBDT.toFixed(2)} BDT
4. VAT (5%): ৳${calc.vatBDT.toFixed(2)} BDT
--------------------------------------------------
Standard Calculated Total: ৳${calc.grossTotalBDT.toFixed(2)} BDT

This indicates an unexplained variance of ${diffSign} BDT (${diffPct.toFixed(1)}%).

Kindly review this meter reading and billing calculation, and adjust my ledger or credit the overcharged balance in the upcoming billing cycle.

Thank you,
Consumer / Account Holder`;

    const bn = `বিষয়: ${bill.month} মাসের বিদ্যুৎ বিলের গরমিল ও পুনঃনিরীক্ষণ সংক্রান্ত আবেদন [হিসাব নং: ${bill.customerAccount || 'প্রযোজ্য নয়'}]

বরাবর,
বিলিং সুপারভাইজার / গ্রাহক সেবা কেন্দ্র
${bill.utility}

মহোদয়,
আমার বাসার ${bill.month} মাসের বিদ্যুৎ বিলে (মিটার নং: ${bill.meterNumber || 'প্রযোজ্য নয়'}, গ্রাহক হিসাব নং: ${bill.customerAccount || 'প্রযোজ্য নয়'}) একটি উল্লেখযোগ্য গরমিল পরিলক্ষিত হয়েছে।

ইস্যুকৃত বিলে মোট ব্যবহার দেখানো হয়েছে ${bill.unitsKwh} ইউনিট এবং মোট প্রদেয় বিল এসেছে ৳${bill.totalBdt.toFixed(2)} টাকা।

বিইআরসি (BERC) নির্ধারিত আবাসিক এলটি-এ লাইফলাইন ও স্ল্যাবভিত্তিক ট্যারিফ এবং সরকারি ৫% ভ্যাট অনুযায়ী সঠিক হিসাব নিম্নরূপ:
১. বিদ্যুৎ শক্তি চার্জ (${bill.unitsKwh} ইউনিট): ৳${calc.energyCostBDT.toFixed(2)} টাকা
${slabLinesBn}
২. ডিমান্ড চার্জ (${sanctionedLoad} কিলোওয়াট @ ৳৪২/কিও): ৳${calc.demandChargeBDT.toFixed(2)} টাকা
৩. মিটার ভাড়া: ৳${calc.meterRentBDT.toFixed(2)} টাকা
৪. সরকারি ভ্যাট (৫%): ৳${calc.vatBDT.toFixed(2)} টাকা
--------------------------------------------------
প্রকৃত মোট হিসাব: ৳${calc.grossTotalBDT.toFixed(2)} টাকা

প্রদত্ত বিলের সাথে প্রকৃত সরকারি হিসাবের ব্যবধান: ${diffSign} টাকা (${diffPct.toFixed(1)}%)।

অনুরোধ রইল, উক্ত বিলটি পুনঃযাচাই করে অতিরিক্ত ধার্যকৃত টাকা পরবর্তী মাসের বিলের সাথে সমন্বয় করার প্রয়োজনীয় ব্যবস্থা গ্রহণ করবেন।

বিনীত,
গ্রাহক / হিসাবধারী`;

    return { en, bn };
  }

  private saveToHistory(householdId: string, record: BillHistoryRecord): void {
    const list = this.historyMap.get(householdId) || [];
    // Avoid duplicate months
    const filtered = list.filter(r => r.month !== record.month);
    filtered.unshift(record);
    // Keep last 24 entries
    this.historyMap.set(householdId, filtered.slice(0, 24));
  }

  public getHistory(householdId: string): BillHistoryRecord[] {
    const records = this.historyMap.get(householdId);
    if (records && records.length > 0) return records;

    // Seed default historical records for realistic preview
    const defaults: BillHistoryRecord[] = [
      {
        id: 'hist_01',
        householdId,
        month: 'September 2026',
        utility: 'DESCO',
        unitsKwh: 310,
        billedTotalBdt: 2530,
        calculatedTotalBdt: 2515.20,
        differenceBdt: 14.80,
        differencePercent: 0.59,
        hasDiscrepancy: false,
        statusLabel: 'VERIFIED_ACCURATE',
        verifiedAt: '2026-09-28T10:00:00.000Z',
      },
      {
        id: 'hist_02',
        householdId,
        month: 'August 2026',
        utility: 'DESCO',
        unitsKwh: 345,
        billedTotalBdt: 3250,
        calculatedTotalBdt: 2890.45,
        differenceBdt: 359.55,
        differencePercent: 12.44,
        hasDiscrepancy: true,
        statusLabel: 'CHECK_WITH_UTILITY',
        verifiedAt: '2026-08-25T14:30:00.000Z',
      },
      {
        id: 'hist_03',
        householdId,
        month: 'July 2026',
        utility: 'DESCO',
        unitsKwh: 275,
        billedTotalBdt: 2180,
        calculatedTotalBdt: 2174.65,
        differenceBdt: 5.35,
        differencePercent: 0.25,
        hasDiscrepancy: false,
        statusLabel: 'VERIFIED_ACCURATE',
        verifiedAt: '2026-07-27T09:15:00.000Z',
      },
    ];

    this.historyMap.set(householdId, defaults);
    return defaults;
  }

  public deleteHistoryRecord(householdId: string, id: string): boolean {
    const list = this.historyMap.get(householdId) || [];
    const updated = list.filter(r => r.id !== id);
    this.historyMap.set(householdId, updated);
    return true;
  }
}
