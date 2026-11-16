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

import { TariffCalculator, DEFAULT_BILL_ROUNDING_MODE } from '../../../backend/engine/TariffCalculator';
import { BillRoundingMode, CostCalculation } from '../../../shared/types/energy';
import {
  ExtractedBillData,
  VerificationResult,
  ComparisonRow,
  BillHistoryRecord,
  BillLikelyCause,
} from './types';

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
    billImageUrl?: string,
    roundingMode: BillRoundingMode = DEFAULT_BILL_ROUNDING_MODE
  ): VerificationResult {
    const sanctionedLoad = customSanctionedLoadKw ?? billData.sanctionedLoadKw ?? 3.0;

    // 1. Recalculate using canonical TariffCalculator resolved for the bill month
    const calculated = TariffCalculator.calculateCost(
      billData.unitsKwh,
      sanctionedLoad,
      'SLAB',
      undefined,
      { billingPeriod: billData.month, roundingMode }
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

    // 4b. Explain exact difference & likely cause(s)
    const { differenceSummary, likelyCauses } = this.diagnoseBillDifference(
      billData,
      calculated,
      sanctionedLoad,
      diffGross,
      diffGrossPercent,
      {
        utilityEnergy,
        utilityDemand,
        utilityMeterRent,
        utilityVat,
      }
    );

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
      roundingMode,
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
      differenceSummary,
      likelyCauses,
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
   * Diagnoses the difference between entered/billed bill and BERC calculated bill
   * and identifies the likely root cause(s): meter reading error, demand charge,
   * VAT mismatch, or wrong slab / tariff tiering.
   */
  private diagnoseBillDifference(
    billData: ExtractedBillData,
    calculated: CostCalculation,
    sanctionedLoad: number,
    diffGross: number,
    diffGrossPercent: number,
    claimed: {
      utilityEnergy: number;
      utilityDemand: number;
      utilityMeterRent: number;
      utilityVat: number;
    }
  ): {
    differenceSummary: { en: string; bn: string };
    likelyCauses: BillLikelyCause[];
  } {
    const causes: BillLikelyCause[] = [];
    const absDiff = Math.abs(diffGross);
    const absPct = Math.abs(diffGrossPercent);
    const signedDiff = `${diffGross >= 0 ? '+' : '-'}৳${absDiff.toFixed(2)}`;
    const signedPct = `${diffGrossPercent >= 0 ? '+' : ''}${diffGrossPercent.toFixed(2)}%`;

    // 1. Meter reading consistency check
    const prevReading = billData.meterReading?.previous;
    const presReading = billData.meterReading?.present;
    if (
      typeof prevReading === 'number' &&
      typeof presReading === 'number' &&
      !Number.isNaN(prevReading) &&
      !Number.isNaN(presReading) &&
      (prevReading > 0 || presReading > 0)
    ) {
      const meterDelta = presReading - prevReading;
      if (meterDelta < 0) {
        causes.push({
          code: 'METER_READING_ERROR',
          severity: 'HIGH',
          titleEn: 'Meter Reading Error (Inverted Readings)',
          titleBn: 'মিটার রিডিং ত্রুটি (উল্টো রিডিং)',
          detailEn: `Present reading (${presReading}) is lower than previous reading (${prevReading}), giving a negative delta (${meterDelta} kWh) vs billed ${billData.unitsKwh} kWh.`,
          detailBn: `বর্তমান রিডিং (${presReading}) পূর্বের রিডিং (${prevReading}) থেকে কম, ফলে নেগেটিভ ব্যবধান (${meterDelta} kWh) দেখাচ্ছে কিন্তু বিল করা হয়েছে ${billData.unitsKwh} ইউনিটে।`,
        });
      } else if (Math.abs(meterDelta - billData.unitsKwh) > 0.5) {
        const impliedDiffUnits = billData.unitsKwh - meterDelta;
        const deltaCalc = TariffCalculator.calculateCost(meterDelta, sanctionedLoad, 'SLAB', undefined, {
          billingPeriod: billData.month,
          roundingMode: calculated.roundingMode,
        });
        const unitImpact = Number((calculated.grossTotalBDT - deltaCalc.grossTotalBDT).toFixed(2));
        causes.push({
          code: 'METER_READING_ERROR',
          severity: 'HIGH',
          titleEn: 'Meter Reading Error (Units Mismatch)',
          titleBn: 'মিটার রিডিং ত্রুটি (ইউনিট অমিল)',
          detailEn: `Meter delta (${presReading} − ${prevReading} = ${meterDelta} kWh) differs from billed units (${billData.unitsKwh} kWh) by ${impliedDiffUnits > 0 ? '+' : ''}${impliedDiffUnits.toFixed(1)} kWh.`,
          detailBn: `মিটারের রিডিং পার্থক্য (${presReading} − ${prevReading} = ${meterDelta} kWh) ও বিলকৃত ইউনিটের (${billData.unitsKwh} kWh) মধ্যে ${impliedDiffUnits > 0 ? '+' : ''}${impliedDiffUnits.toFixed(1)} ইউনিটের অমিল রয়েছে।`,
          estimatedImpactBdt: Math.abs(unitImpact),
        });
      }
    }

    // 2. Demand Charge check (explicit or inferred from kW multiple)
    const demandDiff = Number((claimed.utilityDemand - calculated.demandChargeBDT).toFixed(2));
    if (billData.claimedDemandChargeBdt !== undefined && Math.abs(demandDiff) > 1.0) {
      causes.push({
        code: 'DEMAND_CHARGE',
        severity: Math.abs(demandDiff) > 40 ? 'HIGH' : 'MEDIUM',
        titleEn: 'Demand Charge Mismatch',
        titleBn: 'ডিমান্ড চার্জ অমিল',
        detailEn: `Bill shows ৳${claimed.utilityDemand.toFixed(2)} vs expected ৳${calculated.demandChargeBDT.toFixed(2)} for ${sanctionedLoad} kW sanctioned load (diff: ${demandDiff > 0 ? '+' : '-'}৳${Math.abs(demandDiff).toFixed(2)}). Check kW load or rate per kW.`,
        detailBn: `${sanctionedLoad} কিলোওয়াট লোডের জন্য প্রত্যাশিত ডিমান্ড চার্জ ৳${calculated.demandChargeBDT.toFixed(2)}, কিন্তু বিলে রয়েছে ৳${claimed.utilityDemand.toFixed(2)}। অনুমোদিত লোড বা প্রতি কিও হার যাচাই করুন।`,
        estimatedImpactBdt: Math.abs(demandDiff),
      });
    } else if (billData.claimedDemandChargeBdt === undefined && absDiff >= 38) {
      // Check if total difference with 5% VAT closely corresponds to an integer 1..5 kW load discrepancy at ~৳42/kW
      const ratePerKw = sanctionedLoad > 0 ? calculated.demandChargeBDT / sanctionedLoad : 42;
      const preVatDiff = diffGross / 1.05;
      const impliedExtraKw = preVatDiff / ratePerKw;
      if (Math.abs(impliedExtraKw - Math.round(impliedExtraKw)) <= 0.15 && Math.abs(Math.round(impliedExtraKw)) >= 1) {
        const kwDelta = Math.round(impliedExtraKw);
        causes.push({
          code: 'DEMAND_CHARGE',
          severity: 'MEDIUM',
          titleEn: 'Possible Sanctioned Load / Demand Charge Difference',
          titleBn: 'সম্ভাব্য অনুমোদিত লোড / ডিমান্ড চার্জ পার্থক্য',
          detailEn: `The ৳${absDiff.toFixed(2)} difference matches roughly ${kwDelta > 0 ? '+' : ''}${kwDelta} kW of sanctioned load (at ৳${ratePerKw.toFixed(0)}/kW + 5% VAT). Verify the S.LOAD (kW) printed on your bill.`,
          detailBn: `৳${absDiff.toFixed(2)} ব্যবধানটি প্রায় ${kwDelta > 0 ? '+' : ''}${kwDelta} কিলোওয়াট ডিমান্ড চার্জের সমতুল্য। আপনার কাগজের বিলে S.LOAD (kW) যাচাই করুন।`,
          estimatedImpactBdt: Number((Math.abs(kwDelta) * ratePerKw * 1.05).toFixed(2)),
        });
      }
    }

    // 3. VAT discrepancy check
    const vatDiff = Number((claimed.utilityVat - calculated.vatBDT).toFixed(2));
    if (billData.claimedVatBdt !== undefined && Math.abs(vatDiff) > 1.5) {
      const principal = claimed.utilityEnergy + claimed.utilityDemand + claimed.utilityMeterRent;
      const impliedVatPct = principal > 0 ? (claimed.utilityVat / principal) * 100 : 0;
      causes.push({
        code: 'VAT_MISMATCH',
        severity: Math.abs(vatDiff) > 15 ? 'HIGH' : 'MEDIUM',
        titleEn: 'VAT Calculation Discrepancy',
        titleBn: 'ভ্যাট হিসাবের অমিল',
        detailEn: `Bill VAT is ৳${claimed.utilityVat.toFixed(2)} (~${impliedVatPct.toFixed(1)}%) vs BERC 5% VAT of ৳${calculated.vatBDT.toFixed(2)} (diff: ${vatDiff > 0 ? '+' : '-'}৳${Math.abs(vatDiff).toFixed(2)}). Utilities sometimes round VAT to whole Taka or include arrears.`,
        detailBn: `বিলে ভ্যাট ধরা হয়েছে ৳${claimed.utilityVat.toFixed(2)} (~${impliedVatPct.toFixed(1)}%), যেখানে ৫% ভ্যাট হওয়া উচিত ৳${calculated.vatBDT.toFixed(2)}। বকেয়া বা পূর্ণসংখ্যা রাউন্ডিংয়ের কারণে এমন হতে পারে।`,
        estimatedImpactBdt: Math.abs(vatDiff),
      });
    }

    // 4. Wrong Slab / Tariff Rule mismatch
    const energyDiff = Number((claimed.utilityEnergy - calculated.energyCostBDT).toFixed(2));
    if (
      (billData.claimedEnergyCostBdt !== undefined && Math.abs(energyDiff) > 2.0) ||
      (absPct > 1.0 && (causes.length === 0 || Math.abs(energyDiff) > 10.0))
    ) {
      const nearLifelineBoundary = billData.unitsKwh >= 45 && billData.unitsKwh <= 75;
      causes.push({
        code: 'WRONG_SLAB',
        severity: absPct > 5.0 ? 'HIGH' : 'MEDIUM',
        titleEn: nearLifelineBoundary
          ? 'Possible Wrong Slab or Lifeline Rule Difference'
          : 'Wrong Tariff Slab or Rate Schedule Applied',
        titleBn: nearLifelineBoundary
          ? 'সম্ভাব্য ভুল স্ল্যাব বা লাইফলাইন নিয়মের পার্থক্য'
          : 'ভুল ট্যারিফ স্ল্যাব বা রেট প্রয়োগ',
        detailEn: nearLifelineBoundary
          ? `Energy charge differs by ${energyDiff >= 0 ? '+' : '-'}৳${Math.abs(energyDiff).toFixed(2)}. Crossing 50 kWh removes the Lifeline rate (৳4.63) and bills all 0–75 kWh at Step 1 (৳5.26), or the utility may have applied a flat/higher tier.`
          : `Energy charge differs by ${energyDiff >= 0 ? '+' : '-'}৳${Math.abs(energyDiff).toFixed(2)} (billed ৳${claimed.utilityEnergy.toFixed(2)} vs BERC slab ৳${calculated.energyCostBDT.toFixed(2)}). Utility may have billed on a different tariff version, combined days >30, or applied a higher slab tier.`,
        detailBn: nearLifelineBoundary
          ? `বিদ্যুৎ শক্তি চার্জে ${energyDiff >= 0 ? '+' : '-'}৳${Math.abs(energyDiff).toFixed(2)} পার্থক্য রয়েছে। ৫০ ইউনিট অতিক্রম করলে লাইফলাইন (৳৪.৬৩) বাতিল হয়ে ধাপ ১ (৳৫.২৬) প্রযোজ্য হয়, অথবা ইউটিলিটি ভিন্ন স্ল্যাব ধরেছে।`
          : `স্ল্যাবভিত্তিক বিদ্যুৎ চার্জে ${energyDiff >= 0 ? '+' : '-'}৳${Math.abs(energyDiff).toFixed(2)} পার্থক্য রয়েছে। ভিন্ন ট্যারিফ সংস্করণ, ৩০ দিনের বেশি বিলিং সাইকেল বা উচ্চতর স্ল্যাব প্রয়োগ হয়ে থাকতে পারে।`,
        estimatedImpactBdt: Math.abs(energyDiff),
      });
    }

    // 5. Within 1% tolerance or exact match
    if (causes.length === 0) {
      causes.push({
        code: 'MATCH',
        severity: 'INFO',
        titleEn: absDiff < 0.05 ? 'Exact Tariff Match' : 'Minor Rounding / Paisa Carry-Forward',
        titleBn: absDiff < 0.05 ? 'ট্যারিফ সম্পূর্ণ মিলেছে' : 'সামান্য পয়সা রাউন্ডিং পার্থক্য',
        detailEn:
          absDiff < 0.05
            ? 'Your bill matches the BERC LT-A calculation to the paisa.'
            : `Variance of ${signedDiff} (${signedPct}) is within ±1% tolerance — typically caused by utility whole-Taka rounding or paisa carried to the next bill.`,
        detailBn:
          absDiff < 0.05
            ? 'আপনার বিলটি বিইআরসি এলটি-এ হিসাবের সাথে শতভাগ মিলেছে।'
            : `${signedDiff} (${signedPct}) পার্থক্যটি ±১% সীমার মধ্যে রয়েছে, যা সাধারণত ইউটিলিটির পূর্ণটাকা রাউন্ডিং বা পরবর্তী বিলে পয়সা সমন্বয়ের কারণে হয়।`,
        estimatedImpactBdt: absDiff,
      });
    }

    const differenceSummary =
      absDiff < 0.05
        ? {
            en: `No difference detected: Utility bill (${billData.totalBdt.toFixed(2)} BDT) matches calculated BERC total (${calculated.grossTotalBDT.toFixed(2)} BDT).`,
            bn: `কোনো গরমিল নেই: ইউটিলিটি বিল (৳${billData.totalBdt.toFixed(2)}) ও বিইআরসি হিসাব (৳${calculated.grossTotalBDT.toFixed(2)}) সম্পূর্ণ মিলেছে।`,
          }
        : {
            en: `Difference of ${signedDiff} (${signedPct}): Utility billed ৳${billData.totalBdt.toFixed(2)} vs KilowattIQ calculated ৳${calculated.grossTotalBDT.toFixed(2)}. Primary driver: ${causes[0].titleEn}.`,
            bn: `পার্থক্য ${signedDiff} (${signedPct}): বিলে ৳${billData.totalBdt.toFixed(2)} এবং সঠিক হিসাব ৳${calculated.grossTotalBDT.toFixed(2)}। সম্ভাব্য কারণ: ${causes[0].titleBn}।`,
          };

    return {
      differenceSummary,
      likelyCauses: causes,
    };
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
