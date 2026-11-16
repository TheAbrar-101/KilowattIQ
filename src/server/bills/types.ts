/**
 * Types & Schemas for Bill Verification & OCR Subsystem
 */

import { BillRoundingMode } from '../../../shared/types/energy';

export interface ExtractedBillData {
  utility: 'DESCO' | 'DPDC' | 'BPDB' | 'WZPDCL' | 'BREB' | 'NESCO' | 'UNKNOWN';
  customerAccount?: string;
  meterNumber?: string;
  month: string;                // e.g. "October 2026" or "2026-10"
  unitsKwh: number;             // Total billed kWh
  totalBdt: number;             // Total bill in BDT as charged by utility
  meterReading: {
    previous?: number;
    present?: number;
    difference?: number;
  };
  sanctionedLoadKw?: number;    // e.g. 3.0 kW
  claimedEnergyCostBdt?: number;
  claimedDemandChargeBdt?: number;
  claimedVatBdt?: number;
  claimedMeterRentBdt?: number;
  confidence: number;           // 0.0 to 1.0
  notes?: string;
}

export interface ComparisonRow {
  item: string;
  itemBn: string;
  utility: number;
  kilowattiq: number;
  difference: number;
  diffPercent: number;
  status: 'MATCH' | 'DISCREPANCY' | 'OVERCHARGED' | 'UNDERCHARGED';
}

export type LikelyCauseCode =
  | 'TARIFF_VERSION'
  | 'VAT'
  | 'DEMAND_CHARGE'
  | 'METER_READING'
  | 'ROUNDING'
  | 'COMBINATION'
  | 'MATCH'
  | 'UNEXPLAINED';

export interface BillLikelyCause {
  code: LikelyCauseCode;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  titleEn: string;
  titleBn: string;
  detailEn: string;
  detailBn: string;
  residualBdt: number;
  recomputedTotalBdt: number;
  factorCount: number;
  factors?: LikelyCauseCode[];
  favorsCustomer: boolean;
  estimatedImpactBdt?: number;
}

export interface VerificationResult {
  id: string;
  householdId: string;
  utility: string;
  month: string;
  unitsKwh: number;
  meterReading: {
    previous?: number;
    present?: number;
    difference?: number;
  };
  sanctionedLoadKw: number;
  roundingMode?: BillRoundingMode;
  comparison: {
    energyCost: ComparisonRow;
    demandCharge: ComparisonRow;
    meterRent: ComparisonRow;
    vat: ComparisonRow;
    grossTotal: ComparisonRow;
  };
  summary: {
    billedTotalBdt: number;
    calculatedTotalBdt: number;
    differenceBdt: number;
    differencePercent: number;
    isOvercharged: boolean;
    isUndercharged: boolean;
    hasDiscrepancy: boolean; // true if Math.abs(differencePercent) > 5.0
    statusLabel: 'VERIFIED_ACCURATE' | 'CHECK_WITH_UTILITY' | 'INCONCLUSIVE';
  };
  differenceSummary: {
    en: string;
    bn: string;
  };
  topExplanation?: BillLikelyCause;
  likelyCauses: BillLikelyCause[];
  disputeFavorsCustomer: boolean;
  disputeMessage: {
    en: string;
    bn: string;
  };
  slabBreakdown: Array<{
    stepName: string;
    kwhInSlab: number;
    rate: number;
    costBDT: number;
  }>;
  verifiedAt: string;
  billImageUrl?: string;
}

export interface BillHistoryRecord {
  id: string;
  householdId: string;
  month: string;
  utility: string;
  unitsKwh: number;
  billedTotalBdt: number;
  calculatedTotalBdt: number;
  differenceBdt: number;
  differencePercent: number;
  hasDiscrepancy: boolean;
  statusLabel: 'VERIFIED_ACCURATE' | 'CHECK_WITH_UTILITY' | 'INCONCLUSIVE';
  verifiedAt: string;
  notes?: string;
}
