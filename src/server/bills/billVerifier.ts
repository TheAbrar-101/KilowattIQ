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
import { BillRoundingMode, CostCalculation, TariffStructure, TariffVersion } from '../../../shared/types/energy';
import {
  getTariffVersions,
  getTariffVersionForBillingPeriod,
  toTariffStructure,
} from '../../../shared/constants/bdTariffs';
import {
  ExtractedBillData,
  VerificationResult,
  ComparisonRow,
  BillHistoryRecord,
  BillLikelyCause,
  LikelyCauseCode,
} from './types';

const EXPLANATION_TOLERANCE_BDT = 5.0;
const CANDIDATE_SANCTIONED_LOADS = [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10];
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBnDigits(val: string | number): string {
  return String(val).replace(/[0-9]/g, d => BN_DIGITS[parseInt(d, 10)]);
}

function formatVersionLabel(ver: TariffVersion): { en: string; bn: string } {
  if (ver.version_id === 'BERC-LTA-2024-03' || ver.effective_from < '2026-06-01') {
    return { en: 'pre-June 2026 rates', bn: 'জুন ২০২৬-পূর্ববর্তী হারে' };
  }
  if (ver.version_id === 'BERC-LTA-2026-06') {
    return { en: 'June 2026+ rates', bn: 'জুন ২০২৬+ হারে' };
  }
  return {
    en: `${ver.version_id} (${ver.effective_from}) rates`,
    bn: `${ver.version_id} (${toBnDigits(ver.effective_from)}) হারে`,
  };
}

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

    // 4b. Hypothesis-tested bill difference diagnosis
    const { differenceSummary, likelyCauses, topExplanation } = this.diagnoseBillDifference(
      billData,
      calculated,
      sanctionedLoad,
      roundingMode
    );

    // 5. Generate short, polite dispute letters ONLY when an explanation favors the customer
    const disputeFavorsCustomer = Boolean(topExplanation?.favorsCustomer);
    const disputeMessage = this.generateDisputeDrafts(
      billData,
      calculated,
      diffGross,
      diffGrossPercent,
      sanctionedLoad,
      topExplanation
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
      topExplanation,
      likelyCauses,
      disputeFavorsCustomer,
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
   * Inverts the tariff calculator for integer kWh units in [0, 50000] to find
   * the unit count that yields `targetTotal` with minimum residual.
   */
  private invertTariffForUnits(
    targetTotal: number,
    sanctionedLoad: number,
    tariffStruct: TariffStructure,
    roundingMode: BillRoundingMode
  ): { impliedKwh: number; recomputedTotal: number; residual: number } | null {
    const minCalc = TariffCalculator.calculateCost(0, sanctionedLoad, 'SLAB', tariffStruct, { roundingMode });
    if (targetTotal < minCalc.grossTotalBDT - EXPLANATION_TOLERANCE_BDT) {
      return null;
    }

    const evalKwh = (k: number) =>
      TariffCalculator.calculateCost(k, sanctionedLoad, 'SLAB', tariffStruct, { roundingMode }).grossTotalBDT;

    const searchRange = (low: number, high: number): { k: number; total: number; res: number } => {
      let lo = low;
      let hi = high;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (evalKwh(mid) < targetTotal) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      let bestK = lo;
      let bestTotal = evalKwh(lo);
      let bestRes = Math.abs(targetTotal - bestTotal);
      for (const cand of [lo - 1, lo, lo + 1]) {
        if (cand >= low && cand <= high) {
          const t = evalKwh(cand);
          const r = Math.abs(targetTotal - t);
          if (r < bestRes) {
            bestK = cand;
            bestTotal = t;
            bestRes = r;
          }
        }
      }
      return { k: bestK, total: bestTotal, res: Number(bestRes.toFixed(2)) };
    };

    // Check Lifeline [0..50] first, then regular slabs [51..upper]
    const lifelineBest = searchRange(0, 50);
    let upper = 2000;
    while (upper < 50000 && evalKwh(upper) < targetTotal) {
      upper *= 2;
    }
    const slabBest = searchRange(51, upper);
    const best = lifelineBest.res <= slabBest.res ? lifelineBest : slabBest;

    return {
      impliedKwh: best.k,
      recomputedTotal: Number(best.total.toFixed(2)),
      residual: best.res,
    };
  }

  /**
   * Hypothesis-tested diagnosis of bill difference.
   *
   * Evaluates:
   *  a. TARIFF_VERSION (other tariff versions)
   *  b. VAT (0% and 5%)
   *  c. DEMAND_CHARGE (omitted or different sanctioned load)
   *  d. METER_READING (tariff inversion to implied integer kWh)
   *  e. ROUNDING (FINAL vs PER_SLAB)
   *  f. Combinations of at most two discrete tariff parameters
   *
   * Only hypotheses with residual <= ৳5 are returned, sorted by smallest residual
   * (preferring 1-factor explanations on ties). If nothing explains it within ৳5,
   * returns UNEXPLAINED.
   */
  public diagnoseBillDifference(
    billData: ExtractedBillData,
    calculated: CostCalculation,
    sanctionedLoad: number,
    roundingMode: BillRoundingMode = DEFAULT_BILL_ROUNDING_MODE
  ): {
    differenceSummary: { en: string; bn: string };
    topExplanation: BillLikelyCause;
    likelyCauses: BillLikelyCause[];
  } {
    const enteredTotal = billData.totalBdt;
    const baseTotal = calculated.grossTotalBDT;
    const diffGross = Number((enteredTotal - baseTotal).toFixed(2));
    const absDiff = Number(Math.abs(diffGross).toFixed(2));
    const diffPct = baseTotal > 0 ? Number(((diffGross / baseTotal) * 100).toFixed(2)) : 0;
    const signedDiff = `${diffGross >= 0 ? '+' : '-'}৳${absDiff.toFixed(2)}`;
    const signedPct = `${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}%`;

    const baseVersion = getTariffVersionForBillingPeriod(billData.month);
    const baseStruct = toTariffStructure(baseVersion);
    const baseVat = baseVersion.vatPercent ?? 5.0;
    const favorsCustomerIfDisputed = diffGross > EXPLANATION_TOLERANCE_BDT;

    // If baseline already matches within ৳5 tolerance, bill is explained as MATCH
    if (absDiff <= EXPLANATION_TOLERANCE_BDT) {
      const matchCause: BillLikelyCause = {
        code: 'MATCH',
        severity: 'INFO',
        titleEn: absDiff < 0.05 ? 'Exact Tariff Match' : `Matches BERC Calculation (residual ৳${absDiff.toFixed(2)})`,
        titleBn:
          absDiff < 0.05
            ? 'ট্যারিফ সম্পূর্ণ মিলেছে'
            : `বিইআরসি হিসাবের সাথে মিলেছে (অবশিষ্ট পার্থক্য ৳${toBnDigits(absDiff.toFixed(2))})`,
        detailEn:
          absDiff < 0.05
            ? `Your entered bill (৳${enteredTotal.toFixed(2)}) matches the BERC LT-A calculation (৳${baseTotal.toFixed(2)}) to the paisa.`
            : `Your entered bill (৳${enteredTotal.toFixed(2)}) matches the BERC LT-A calculation (৳${baseTotal.toFixed(2)}) within the ৳5 tolerance (residual ৳${absDiff.toFixed(2)}).`,
        detailBn:
          absDiff < 0.05
            ? `আপনার প্রদত্ত বিল (৳${toBnDigits(enteredTotal.toFixed(2))}) বিইআরসি এলটি-এ হিসাবের (৳${toBnDigits(baseTotal.toFixed(2))}) সাথে সম্পূর্ণ মিলেছে।`
            : `আপনার প্রদত্ত বিল (৳${toBnDigits(enteredTotal.toFixed(2))}) ৳৫ সীমার মধ্যে বিইআরসি হিসাবের (৳${toBnDigits(baseTotal.toFixed(2))}) সাথে মিলেছে (অবশিষ্ট পার্থক্য ৳${toBnDigits(absDiff.toFixed(2))})।`,
        residualBdt: absDiff,
        recomputedTotalBdt: baseTotal,
        factorCount: 0,
        favorsCustomer: false,
        estimatedImpactBdt: absDiff,
      };

      return {
        differenceSummary: {
          en: matchCause.detailEn,
          bn: matchCause.detailBn,
        },
        topExplanation: matchCause,
        likelyCauses: [matchCause],
      };
    }

    const candidates: BillLikelyCause[] = [];
    const altVersions = getTariffVersions().filter(v => v.version_id !== baseVersion.version_id);
    const vatCandidates = [0, 5].filter(v => Math.abs(v - baseVat) > 0.01);
    const loadCandidates = CANDIDATE_SANCTIONED_LOADS.filter(l => Math.abs(l - sanctionedLoad) > 0.01);
    const altRounding: BillRoundingMode = roundingMode === 'FINAL' ? 'PER_SLAB' : 'FINAL';

    // Track single-factor best residuals so 2-factor combos only qualify if they meaningfully improve fit
    let bestVersionResidual = Infinity;
    let bestVatResidual = Infinity;
    let bestDemandResidual = Infinity;
    let bestRoundingResidual = Infinity;

    // a. TARIFF_VERSION: same units billed under each other tariff version
    for (const otherVer of altVersions) {
      const otherStruct = toTariffStructure(otherVer);
      const resCalc = TariffCalculator.calculateCost(billData.unitsKwh, sanctionedLoad, 'SLAB', otherStruct, {
        roundingMode,
      });
      const residual = Number(Math.abs(enteredTotal - resCalc.grossTotalBDT).toFixed(2));
      if (residual < bestVersionResidual) bestVersionResidual = residual;

      if (residual <= EXPLANATION_TOLERANCE_BDT) {
        const lbl = formatVersionLabel(otherVer);
        candidates.push({
          code: 'TARIFF_VERSION',
          severity: favorsCustomerIfDisputed ? 'HIGH' : 'MEDIUM',
          titleEn: `Matches if billed at the ${lbl.en}, residual ৳${residual.toFixed(2)}`,
          titleBn: `${lbl.bn} বিল করা হলে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))}`,
          detailEn: `Recomputing ${billData.unitsKwh} kWh under ${otherVer.version_id} (${lbl.en}) gives ৳${resCalc.grossTotalBDT.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${residual.toFixed(2)}).`,
          detailBn: `${toBnDigits(billData.unitsKwh)} ইউনিট ${otherVer.version_id} (${lbl.bn}) হিসাব করলে ৳${toBnDigits(resCalc.grossTotalBDT.toFixed(2))} আসে, যা প্রদত্ত ৳${toBnDigits(enteredTotal.toFixed(2))} বিলের সাথে মিলে যায় (অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))})।`,
          residualBdt: residual,
          recomputedTotalBdt: resCalc.grossTotalBDT,
          factorCount: 1,
          factors: ['TARIFF_VERSION'],
          favorsCustomer: favorsCustomerIfDisputed,
          estimatedImpactBdt: Number(Math.abs(resCalc.grossTotalBDT - baseTotal).toFixed(2)),
        });
      }
    }

    // b. VAT: VAT at 0% and 5%
    for (const vatPct of vatCandidates) {
      const vatStruct: TariffStructure = { ...baseStruct, vatPercent: vatPct };
      const resCalc = TariffCalculator.calculateCost(billData.unitsKwh, sanctionedLoad, 'SLAB', vatStruct, {
        roundingMode,
      });
      const residual = Number(Math.abs(enteredTotal - resCalc.grossTotalBDT).toFixed(2));
      if (residual < bestVatResidual) bestVatResidual = residual;

      if (residual <= EXPLANATION_TOLERANCE_BDT) {
        candidates.push({
          code: 'VAT',
          severity: favorsCustomerIfDisputed ? 'HIGH' : 'MEDIUM',
          titleEn: `Matches if billed with ${vatPct}% VAT instead of ${baseVat}%, residual ৳${residual.toFixed(2)}`,
          titleBn: `${toBnDigits(baseVat)}% ভ্যাটের বদলে ${toBnDigits(vatPct)}% ভ্যাট ধরলে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))}`,
          detailEn: `Recomputing with ${vatPct}% VAT gives ৳${resCalc.grossTotalBDT.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${residual.toFixed(2)}).`,
          detailBn: `${toBnDigits(vatPct)}% ভ্যাটসহ হিসাব করলে ৳${toBnDigits(resCalc.grossTotalBDT.toFixed(2))} আসে, যা প্রদত্ত ৳${toBnDigits(enteredTotal.toFixed(2))} বিলের সাথে মিলে যায় (অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))})।`,
          residualBdt: residual,
          recomputedTotalBdt: resCalc.grossTotalBDT,
          factorCount: 1,
          factors: ['VAT'],
          favorsCustomer: favorsCustomerIfDisputed,
          estimatedImpactBdt: Number(Math.abs(resCalc.grossTotalBDT - baseTotal).toFixed(2)),
        });
      }
    }

    // c. DEMAND_CHARGE: omitted (0 kW) or computed with a different sanctioned load
    let bestDemandCandidate: { load: number; total: number; residual: number } | null = null;
    for (const testLoad of loadCandidates) {
      const resCalc = TariffCalculator.calculateCost(billData.unitsKwh, testLoad, 'SLAB', baseStruct, {
        roundingMode,
      });
      const residual = Number(Math.abs(enteredTotal - resCalc.grossTotalBDT).toFixed(2));
      if (residual < bestDemandResidual) bestDemandResidual = residual;
      if (residual <= EXPLANATION_TOLERANCE_BDT && (!bestDemandCandidate || residual < bestDemandCandidate.residual)) {
        bestDemandCandidate = { load: testLoad, total: resCalc.grossTotalBDT, residual };
      }
    }
    if (bestDemandCandidate) {
      const isOmitted = bestDemandCandidate.load === 0;
      candidates.push({
        code: 'DEMAND_CHARGE',
        severity: favorsCustomerIfDisputed ? 'HIGH' : 'MEDIUM',
        titleEn: isOmitted
          ? `Matches if Demand Charge was omitted, residual ৳${bestDemandCandidate.residual.toFixed(2)}`
          : `Matches if Demand Charge used ${bestDemandCandidate.load} kW instead of ${sanctionedLoad} kW, residual ৳${bestDemandCandidate.residual.toFixed(2)}`,
        titleBn: isOmitted
          ? `ডিমান্ড চার্জ বাদ দিলে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(bestDemandCandidate.residual.toFixed(2))}`
          : `${toBnDigits(sanctionedLoad)} কিও-এর বদলে ${toBnDigits(bestDemandCandidate.load)} কিও ডিমান্ড চার্জ ধরলে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(bestDemandCandidate.residual.toFixed(2))}`,
        detailEn: isOmitted
          ? `Omitting the ${sanctionedLoad} kW demand charge gives ৳${bestDemandCandidate.total.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${bestDemandCandidate.residual.toFixed(2)}).`
          : `Recomputing with ${bestDemandCandidate.load} kW sanctioned load gives ৳${bestDemandCandidate.total.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${bestDemandCandidate.residual.toFixed(2)}).`,
        detailBn: isOmitted
          ? `${toBnDigits(sanctionedLoad)} কিও ডিমান্ড চার্জ বাদ দিলে মোট বিল ৳${toBnDigits(bestDemandCandidate.total.toFixed(2))} আসে (অবশিষ্ট পার্থক্য ৳${toBnDigits(bestDemandCandidate.residual.toFixed(2))})।`
          : `${toBnDigits(bestDemandCandidate.load)} কিও অনুমোদিত লোডে ডিমান্ড চার্জ ধরলে মোট বিল ৳${toBnDigits(bestDemandCandidate.total.toFixed(2))} আসে (অবশিষ্ট পার্থক্য ৳${toBnDigits(bestDemandCandidate.residual.toFixed(2))})।`,
        residualBdt: bestDemandCandidate.residual,
        recomputedTotalBdt: bestDemandCandidate.total,
        factorCount: 1,
        factors: ['DEMAND_CHARGE'],
        favorsCustomer: favorsCustomerIfDisputed,
        estimatedImpactBdt: Number(Math.abs(bestDemandCandidate.total - baseTotal).toFixed(2)),
      });
    }

    // d. METER_READING: invert tariff to find unit count yielding enteredTotal
    const inverted = this.invertTariffForUnits(enteredTotal, sanctionedLoad, baseStruct, roundingMode);
    if (
      inverted &&
      inverted.impliedKwh !== Math.round(billData.unitsKwh) &&
      inverted.residual <= EXPLANATION_TOLERANCE_BDT
    ) {
      const unitDiff = inverted.impliedKwh - billData.unitsKwh;
      const unitDiffStr = `${unitDiff > 0 ? '+' : ''}${unitDiff}`;
      candidates.push({
        code: 'METER_READING',
        severity: favorsCustomerIfDisputed ? 'HIGH' : 'MEDIUM',
        titleEn: `Bill implies ${inverted.impliedKwh} kWh vs ${billData.unitsKwh} kWh entered, residual ৳${inverted.residual.toFixed(2)}`,
        titleBn: `বিল অনুযায়ী ${toBnDigits(inverted.impliedKwh)} ইউনিট ধরা হয়েছে বনাম প্রদত্ত ${toBnDigits(billData.unitsKwh)} ইউনিট, অবশিষ্ট পার্থক্য ৳${toBnDigits(inverted.residual.toFixed(2))}`,
        detailEn: `Inverting ${baseVersion.version_id} gives ${inverted.impliedKwh} kWh (${unitDiffStr} kWh, total ৳${inverted.recomputedTotal.toFixed(2)}) vs ${billData.unitsKwh} kWh entered (residual ৳${inverted.residual.toFixed(2)}).`,
        detailBn: `${baseVersion.version_id} ট্যারিফে ${toBnDigits(inverted.impliedKwh)} ইউনিটে (${toBnDigits(unitDiffStr)} ইউনিট ব্যবধান) বিল হয় ৳${toBnDigits(inverted.recomputedTotal.toFixed(2))}, যা প্রদত্ত বিলের সাথে মিলে যায় (অবশিষ্ট পার্থক্য ৳${toBnDigits(inverted.residual.toFixed(2))})।`,
        residualBdt: inverted.residual,
        recomputedTotalBdt: inverted.recomputedTotal,
        factorCount: 1,
        factors: ['METER_READING'],
        favorsCustomer: favorsCustomerIfDisputed,
        estimatedImpactBdt: Number(Math.abs(inverted.recomputedTotal - baseTotal).toFixed(2)),
      });
    }

    // e. ROUNDING: FINAL vs PER_SLAB
    const roundingCalc = TariffCalculator.calculateCost(billData.unitsKwh, sanctionedLoad, 'SLAB', baseStruct, {
      roundingMode: altRounding,
    });
    const roundingResidual = Number(Math.abs(enteredTotal - roundingCalc.grossTotalBDT).toFixed(2));
    bestRoundingResidual = roundingResidual;
    if (roundingResidual <= EXPLANATION_TOLERANCE_BDT && roundingCalc.grossTotalBDT !== baseTotal) {
      candidates.push({
        code: 'ROUNDING',
        severity: 'INFO',
        titleEn: `Matches under ${altRounding} rounding rule, residual ৳${roundingResidual.toFixed(2)}`,
        titleBn: `${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং নিয়মে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(roundingResidual.toFixed(2))}`,
        detailEn: `Using ${altRounding} rounding produces ৳${roundingCalc.grossTotalBDT.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${roundingResidual.toFixed(2)}).`,
        detailBn: `${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং ব্যবহার করলে ৳${toBnDigits(roundingCalc.grossTotalBDT.toFixed(2))} আসে (অবশিষ্ট পার্থক্য ৳${toBnDigits(roundingResidual.toFixed(2))})।`,
        residualBdt: roundingResidual,
        recomputedTotalBdt: roundingCalc.grossTotalBDT,
        factorCount: 1,
        factors: ['ROUNDING'],
        favorsCustomer: favorsCustomerIfDisputed,
        estimatedImpactBdt: Number(Math.abs(roundingCalc.grossTotalBDT - baseTotal).toFixed(2)),
      });
    }

    // f. Combination of at most two discrete tariff parameters
    const tryCombo = (
      factors: [LikelyCauseCode, LikelyCauseCode],
      singleMinResidual: number,
      struct: TariffStructure,
      load: number,
      mode: BillRoundingMode,
      descEn: string,
      descBn: string
    ) => {
      const calc = TariffCalculator.calculateCost(billData.unitsKwh, load, 'SLAB', struct, {
        roundingMode: mode,
      });
      const residual = Number(Math.abs(enteredTotal - calc.grossTotalBDT).toFixed(2));
      // Parsimony guard: only add 2-factor combo when neither single factor already matched cleanly
      // and combining both meaningfully reduces residual (by > ৳0.50).
      if (residual <= EXPLANATION_TOLERANCE_BDT && residual < singleMinResidual - 0.5) {
        candidates.push({
          code: 'COMBINATION',
          severity: favorsCustomerIfDisputed ? 'HIGH' : 'MEDIUM',
          titleEn: `Matches with ${descEn}, residual ৳${residual.toFixed(2)}`,
          titleBn: `${descBn} ধরলে মিলে যায়, অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))}`,
          detailEn: `Combined hypothesis (${factors.join(' + ')}) gives ৳${calc.grossTotalBDT.toFixed(2)} vs ৳${enteredTotal.toFixed(2)} entered (residual ৳${residual.toFixed(2)}).`,
          detailBn: `যৌথ কারণ (${descBn}) অনুযায়ী হিসাব করলে ৳${toBnDigits(calc.grossTotalBDT.toFixed(2))} আসে (অবশিষ্ট পার্থক্য ৳${toBnDigits(residual.toFixed(2))})।`,
          residualBdt: residual,
          recomputedTotalBdt: calc.grossTotalBDT,
          factorCount: 2,
          factors,
          favorsCustomer: favorsCustomerIfDisputed,
          estimatedImpactBdt: Number(Math.abs(calc.grossTotalBDT - baseTotal).toFixed(2)),
        });
      }
    };

    // f1. TARIFF_VERSION + VAT
    for (const otherVer of altVersions) {
      const lbl = formatVersionLabel(otherVer);
      for (const vatPct of vatCandidates) {
        const s: TariffStructure = { ...toTariffStructure(otherVer), vatPercent: vatPct };
        tryCombo(
          ['TARIFF_VERSION', 'VAT'],
          Math.min(bestVersionResidual, bestVatResidual),
          s,
          sanctionedLoad,
          roundingMode,
          `${lbl.en} + ${vatPct}% VAT`,
          `${lbl.bn} এবং ${toBnDigits(vatPct)}% ভ্যাট`
        );
      }
    }

    // f2. TARIFF_VERSION + DEMAND_CHARGE
    for (const otherVer of altVersions) {
      const lbl = formatVersionLabel(otherVer);
      const otherStruct = toTariffStructure(otherVer);
      let bestPair: { load: number; residual: number } | null = null;
      for (const testLoad of loadCandidates) {
        const c = TariffCalculator.calculateCost(billData.unitsKwh, testLoad, 'SLAB', otherStruct, { roundingMode });
        const r = Number(Math.abs(enteredTotal - c.grossTotalBDT).toFixed(2));
        if (r <= EXPLANATION_TOLERANCE_BDT && (!bestPair || r < bestPair.residual)) {
          bestPair = { load: testLoad, residual: r };
        }
      }
      if (bestPair) {
        tryCombo(
          ['TARIFF_VERSION', 'DEMAND_CHARGE'],
          Math.min(bestVersionResidual, bestDemandResidual),
          otherStruct,
          bestPair.load,
          roundingMode,
          bestPair.load === 0 ? `${lbl.en} + demand charge omitted` : `${lbl.en} + ${bestPair.load} kW load`,
          bestPair.load === 0 ? `${lbl.bn} এবং ডিমান্ড চার্জ ছাড়া` : `${lbl.bn} এবং ${toBnDigits(bestPair.load)} কিও লোড`
        );
      }
    }

    // f3. TARIFF_VERSION + ROUNDING
    for (const otherVer of altVersions) {
      const lbl = formatVersionLabel(otherVer);
      tryCombo(
        ['TARIFF_VERSION', 'ROUNDING'],
        Math.min(bestVersionResidual, bestRoundingResidual),
        toTariffStructure(otherVer),
        sanctionedLoad,
        altRounding,
        `${lbl.en} + ${altRounding} rounding`,
        `${lbl.bn} এবং ${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং`
      );
    }

    // f4. VAT + DEMAND_CHARGE
    for (const vatPct of vatCandidates) {
      const vatStruct: TariffStructure = { ...baseStruct, vatPercent: vatPct };
      let bestPair: { load: number; residual: number } | null = null;
      for (const testLoad of loadCandidates) {
        const c = TariffCalculator.calculateCost(billData.unitsKwh, testLoad, 'SLAB', vatStruct, { roundingMode });
        const r = Number(Math.abs(enteredTotal - c.grossTotalBDT).toFixed(2));
        if (r <= EXPLANATION_TOLERANCE_BDT && (!bestPair || r < bestPair.residual)) {
          bestPair = { load: testLoad, residual: r };
        }
      }
      if (bestPair) {
        tryCombo(
          ['VAT', 'DEMAND_CHARGE'],
          Math.min(bestVatResidual, bestDemandResidual),
          vatStruct,
          bestPair.load,
          roundingMode,
          bestPair.load === 0 ? `${vatPct}% VAT + demand charge omitted` : `${vatPct}% VAT + ${bestPair.load} kW load`,
          bestPair.load === 0 ? `${toBnDigits(vatPct)}% ভ্যাট এবং ডিমান্ড চার্জ ছাড়া` : `${toBnDigits(vatPct)}% ভ্যাট এবং ${toBnDigits(bestPair.load)} কিও লোড`
        );
      }
    }

    // f5. VAT + ROUNDING
    for (const vatPct of vatCandidates) {
      const vatStruct: TariffStructure = { ...baseStruct, vatPercent: vatPct };
      tryCombo(
        ['VAT', 'ROUNDING'],
        Math.min(bestVatResidual, bestRoundingResidual),
        vatStruct,
        sanctionedLoad,
        altRounding,
        `${vatPct}% VAT + ${altRounding} rounding`,
        `${toBnDigits(vatPct)}% ভ্যাট এবং ${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং`
      );
    }

    // f6. DEMAND_CHARGE + ROUNDING
    {
      let bestPair: { load: number; residual: number } | null = null;
      for (const testLoad of loadCandidates) {
        const c = TariffCalculator.calculateCost(billData.unitsKwh, testLoad, 'SLAB', baseStruct, {
          roundingMode: altRounding,
        });
        const r = Number(Math.abs(enteredTotal - c.grossTotalBDT).toFixed(2));
        if (r <= EXPLANATION_TOLERANCE_BDT && (!bestPair || r < bestPair.residual)) {
          bestPair = { load: testLoad, residual: r };
        }
      }
      if (bestPair) {
        tryCombo(
          ['DEMAND_CHARGE', 'ROUNDING'],
          Math.min(bestDemandResidual, bestRoundingResidual),
          baseStruct,
          bestPair.load,
          altRounding,
          bestPair.load === 0 ? `demand charge omitted + ${altRounding} rounding` : `${bestPair.load} kW load + ${altRounding} rounding`,
          bestPair.load === 0 ? `ডিমান্ড চার্জ ছাড়া ও ${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং` : `${toBnDigits(bestPair.load)} কিও লোড ও ${altRounding === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'} রাউন্ডিং`
        );
      }
    }

    // Sort qualifying hypotheses by smallest residual, breaking close ties in favor of 1-factor causes
    candidates.sort((a, b) => {
      if (Math.abs(a.residualBdt - b.residualBdt) > 0.01) {
        return a.residualBdt - b.residualBdt;
      }
      return a.factorCount - b.factorCount;
    });

    if (candidates.length === 0) {
      const unexplained: BillLikelyCause = {
        code: 'UNEXPLAINED',
        severity: 'HIGH',
        titleEn: `Unexplained Difference (${signedDiff} / ${signedPct})`,
        titleBn: `অব্যাখ্যাত পার্থক্য (${toBnDigits(signedDiff)} / ${toBnDigits(signedPct)})`,
        detailEn: `We cannot determine the cause within ±৳5.00 from tariff version, VAT, demand charge, meter reading units, or rounding rules. Raw difference: ${signedDiff} (entered ৳${enteredTotal.toFixed(2)} vs calculated ৳${baseTotal.toFixed(2)}).`,
        detailBn: `ট্যারিফ সংস্করণ, ভ্যাট, ডিমান্ড চার্জ, মিটার ইউনিট বা রাউন্ডিং দিয়ে ±৳৫.০০ সীমার মধ্যে কারণ নির্ণয় করা সম্ভব হয়নি। মূল পার্থক্য: ${toBnDigits(signedDiff)} (প্রদত্ত ৳${toBnDigits(enteredTotal.toFixed(2))} বনাম হিসাবকৃত ৳${toBnDigits(baseTotal.toFixed(2))})।`,
        residualBdt: absDiff,
        recomputedTotalBdt: baseTotal,
        factorCount: 0,
        favorsCustomer: false,
        estimatedImpactBdt: absDiff,
      };

      return {
        differenceSummary: {
          en: unexplained.detailEn,
          bn: unexplained.detailBn,
        },
        topExplanation: unexplained,
        likelyCauses: [unexplained],
      };
    }

    const top = candidates[0];
    return {
      differenceSummary: {
        en: `${top.titleEn}. Raw difference: ${signedDiff} (${signedPct}; entered ৳${enteredTotal.toFixed(2)} vs calculated ৳${baseTotal.toFixed(2)}).`,
        bn: `${top.titleBn}। মূল পার্থক্য: ${toBnDigits(signedDiff)} (${toBnDigits(signedPct)}; প্রদত্ত ৳${toBnDigits(enteredTotal.toFixed(2))} বনাম হিসাবকৃত ৳${toBnDigits(baseTotal.toFixed(2))})।`,
      },
      topExplanation: top,
      likelyCauses: candidates,
    };
  }

  /**
   * Generates a short, polite English and Bangla dispute letter with the
   * confirmed explanation and exact numbers filled in.
   */
  private generateDisputeDrafts(
    bill: ExtractedBillData,
    calc: CostCalculation,
    diffBdt: number,
    diffPct: number,
    sanctionedLoad: number,
    topExplanation?: BillLikelyCause
  ): { en: string; bn: string } {
    const absDiff = Math.abs(diffBdt).toFixed(2);
    const diffSign = diffBdt >= 0 ? `+৳${absDiff}` : `-৳${absDiff}`;
    const accountStr = bill.customerAccount || 'N/A';
    const meterStr = bill.meterNumber || 'N/A';
    const accountStrBn = bill.customerAccount || 'প্রযোজ্য নয়';
    const meterStrBn = bill.meterNumber || 'প্রযোজ্য নয়';

    const findingEn = topExplanation
      ? `${topExplanation.titleEn}. (${topExplanation.detailEn})`
      : `Calculated BERC LT-A total is ৳${calc.grossTotalBDT.toFixed(2)} vs ৳${bill.totalBdt.toFixed(2)} billed.`;
    const findingBn = topExplanation
      ? `${topExplanation.titleBn}। (${topExplanation.detailBn})`
      : `বিইআরসি এলটি-এ অনুযায়ী প্রাপ্য বিল ৳${toBnDigits(calc.grossTotalBDT.toFixed(2))} বনাম বিলে ধার্যকৃত ৳${toBnDigits(bill.totalBdt.toFixed(2))}।`;

    const en = `Subject: Inquiry Regarding Billing Discrepancy for ${bill.month} [Account: ${accountStr}]

Dear ${bill.utility} Customer Care,

Could you please review my ${bill.month} electricity bill (Account: ${accountStr}, Meter: ${meterStr})?

- Billed units & load: ${bill.unitsKwh} kWh (${sanctionedLoad} kW)
- Billed total: ৳${bill.totalBdt.toFixed(2)}
- Expected BERC LT-A total (${calc.tariffVersionId || 'LT-A'}): ৳${calc.grossTotalBDT.toFixed(2)} (Energy ৳${calc.energyCostBDT.toFixed(2)}, Demand ৳${calc.demandChargeBDT.toFixed(2)}, Meter ৳${calc.meterRentBDT.toFixed(2)}, VAT ৳${calc.vatBDT.toFixed(2)})
- Difference: ${diffSign} (${diffPct.toFixed(1)}%)

Likely check: ${findingEn}

Kindly verify this calculation and adjust any overcharge on my upcoming bill. Thank you for your help.`;

    const bn = `বিষয়: ${bill.month} মাসের বিদ্যুৎ বিলের গরমিল যাচাইয়ের আবেদন [হিসাব নং: ${accountStrBn}]

বরাবর,
গ্রাহক সেবা কেন্দ্র, ${bill.utility}

মহোদয়,
অনুগ্রহ করে আমার ${bill.month} মাসের বিদ্যুৎ বিলটি (হিসাব নং: ${accountStrBn}, মিটার নং: ${meterStrBn}) পুনরায় যাচাই করার অনুরোধ জানাচ্ছি:

- ব্যবহৃত ইউনিট ও লোড: ${toBnDigits(bill.unitsKwh)} kWh (${toBnDigits(sanctionedLoad)} কিও)
- বিলে প্রদর্শিত মোট টাকা: ৳${toBnDigits(bill.totalBdt.toFixed(2))}
- বিইআরসি এলটি-এ হিসাব (${calc.tariffVersionId || 'LT-A'}): ৳${toBnDigits(calc.grossTotalBDT.toFixed(2))}
- পার্থক্য: ${toBnDigits(diffSign)} (${toBnDigits(diffPct.toFixed(1))}%)

সম্ভাব্য কারণ: ${findingBn}

দয়া করে বিষয়টি যাচাই করে অতিরিক্ত অর্থ পরবর্তী বিলে সমন্বয় করলে কৃতজ্ঞ থাকব। ধন্যবাদ।`;

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
