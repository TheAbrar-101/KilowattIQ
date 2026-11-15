import { TariffStructure, TariffVersion } from '../types/energy';
import tariffVersionsSeed from '../data/tariffVersions.json';

/**
 * Configurable statutory & fixed residential tariff charges.
 * Current values are kept unchanged and flagged for regulatory verification.
 */
export const DEFAULT_TARIFF_FIXED_CHARGES = {
  // TODO(verify): Confirm BERC/DESCO/DPDC LT-A demand charge per kW per month
  demandChargePerKw: 42.0,
  // TODO(verify): Confirm single-phase LT-A residential monthly meter rent (BDT)
  meterRent: 40.0,
  // TODO(verify): Confirm statutory government VAT percentage on electricity bills
  vatPercent: 5.0,
};

export function getBuiltInTariffSeedVersions(): TariffVersion[] {
  return (tariffVersionsSeed as TariffVersion[])
    .map(v => ({
      ...v,
      charges_verified: Boolean(v.charges_verified),
      slabs: v.slabs.map(s => ({ ...s })),
    }))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

/**
 * In-memory versioned tariff registry seeded from shared/data/tariffVersions.json.
 * Sorted by effective_from ascending.
 */
let versionedTariffTable: TariffVersion[] = getBuiltInTariffSeedVersions();

/**
 * Normalizes a billing period input (e.g. '2026-06-01', '2026-06', 'June 2026', Date)
 * into an ISO YYYY-MM-DD date string for version matching against effective_from.
 */
export function normalizeBillingPeriodDate(billingPeriod?: string | Date): string {
  if (!billingPeriod) {
    return new Date().toISOString().slice(0, 10);
  }
  if (billingPeriod instanceof Date) {
    return Number.isNaN(billingPeriod.getTime())
      ? new Date().toISOString().slice(0, 10)
      : billingPeriod.toISOString().slice(0, 10);
  }

  const trimmed = billingPeriod.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().slice(0, 10);
}

export function getTariffVersions(): TariffVersion[] {
  return [...versionedTariffTable].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

export function getTariffVersionForBillingPeriod(billingPeriod?: string | Date): TariffVersion {
  const targetDate = normalizeBillingPeriodDate(billingPeriod);
  const sorted = getTariffVersions();
  let matched = sorted[0];

  for (const version of sorted) {
    if (version.effective_from <= targetDate) {
      matched = version;
    }
  }

  return matched;
}

export function upsertTariffVersion(newVersion: TariffVersion): TariffVersion[] {
  const normalized: TariffVersion = {
    ...newVersion,
    version_id: newVersion.version_id.trim(),
    effective_from: normalizeBillingPeriodDate(newVersion.effective_from),
    last_verified_date: newVersion.last_verified_date
      ? normalizeBillingPeriodDate(newVersion.last_verified_date)
      : null,
    demandChargePerKw: newVersion.demandChargePerKw ?? DEFAULT_TARIFF_FIXED_CHARGES.demandChargePerKw,
    meterRent: newVersion.meterRent ?? DEFAULT_TARIFF_FIXED_CHARGES.meterRent,
    vatPercent: newVersion.vatPercent ?? DEFAULT_TARIFF_FIXED_CHARGES.vatPercent,
    charges_verified: Boolean(newVersion.charges_verified),
    slabs: newVersion.slabs.map(s => ({ ...s })),
  };

  const existingIndex = versionedTariffTable.findIndex(v => v.version_id === normalized.version_id);
  if (existingIndex >= 0) {
    versionedTariffTable[existingIndex] = normalized;
  } else {
    versionedTariffTable.push(normalized);
  }

  versionedTariffTable.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  return getTariffVersions();
}

export function setTariffVersions(versions: TariffVersion[]): void {
  if (!Array.isArray(versions) || versions.length === 0) return;
  versionedTariffTable = versions
    .map(v => ({
      ...v,
      charges_verified: Boolean(v.charges_verified),
      slabs: v.slabs.map(s => ({ ...s })),
    }))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

export function toTariffStructure(version: TariffVersion): TariffStructure {
  return {
    id: version.version_id,
    version_id: version.version_id,
    effective_from: version.effective_from,
    source_note: version.source_note,
    last_verified_date: version.last_verified_date ?? null,
    charges_verified: Boolean(version.charges_verified),
    utilityName: 'DESCO / DPDC / BPDB (LT-A Residential)',
    tariffType: 'SLAB',
    slabs: version.slabs.map(s => ({ ...s })),
    flatRatePerKwh: version.flatRatePerKwh ?? 9.85,
    touRates: version.touRates ?? {
      offPeakRate: 7.05,
      peakRate: 12.10,
    },
    seasonalMultipliers: version.seasonalMultipliers ?? {
      summer: 1.15,
      winter: 0.85,
    },
    // TODO(verify): Configurable demand charge, meter rent, and VAT
    demandChargePerKw: version.demandChargePerKw ?? DEFAULT_TARIFF_FIXED_CHARGES.demandChargePerKw,
    meterRent: version.meterRent ?? DEFAULT_TARIFF_FIXED_CHARGES.meterRent,
    vatPercent: version.vatPercent ?? DEFAULT_TARIFF_FIXED_CHARGES.vatPercent,
  };
}

/**
 * Active BERC / DESCO / DPDC Domestic Residential Category LT-A Tariff Structure
 * resolved from the versioned tariff table for the current billing period.
 */
export function getActiveTariffStructure(billingPeriod?: string | Date): TariffStructure {
  return toTariffStructure(getTariffVersionForBillingPeriod(billingPeriod));
}

export const BD_DEFAULT_SLAB_TARIFF: TariffStructure = getActiveTariffStructure();

export const COMMON_BD_APPLIANCES_PRESETS = [
  {
    name: '1.5 Ton Non-Inverter AC',
    category: 'AIR_CONDITIONER' as const,
    ratedPowerW: 1800,
    standbyPowerW: 18,
    averageHoursPerDay: 7,
    isInverterType: false,
    energyRatingStars: 2,
    isVampireRisk: true,
  },
  {
    name: '1.5 Ton 5-Star Inverter AC',
    category: 'AIR_CONDITIONER' as const,
    ratedPowerW: 1100,
    standbyPowerW: 4,
    averageHoursPerDay: 7,
    isInverterType: true,
    energyRatingStars: 5,
    isVampireRisk: false,
  },
  {
    name: 'Frost Refrigerator (250L)',
    category: 'REFRIGERATOR' as const,
    ratedPowerW: 220,
    standbyPowerW: 12,
    averageHoursPerDay: 24,
    isInverterType: false,
    energyRatingStars: 3,
    isVampireRisk: true,
  },
  {
    name: 'Inverter Smart Refrigerator (300L)',
    category: 'REFRIGERATOR' as const,
    ratedPowerW: 110,
    standbyPowerW: 3,
    averageHoursPerDay: 24,
    isInverterType: true,
    energyRatingStars: 5,
    isVampireRisk: false,
  },
  {
    name: 'Ceiling Fan (75W Standard)',
    category: 'FAN' as const,
    ratedPowerW: 75,
    standbyPowerW: 0,
    averageHoursPerDay: 12,
    isInverterType: false,
    energyRatingStars: 3,
    isVampireRisk: false,
  },
  {
    name: 'BLDC Energy Saving Fan (28W)',
    category: 'FAN' as const,
    ratedPowerW: 28,
    standbyPowerW: 1,
    averageHoursPerDay: 12,
    isInverterType: true,
    energyRatingStars: 5,
    isVampireRisk: false,
  },
  {
    name: 'LED Smart TV (55 inch)',
    category: 'TELEVISION' as const,
    ratedPowerW: 110,
    standbyPowerW: 14,
    averageHoursPerDay: 4,
    isInverterType: false,
    energyRatingStars: 4,
    isVampireRisk: true,
  },
  {
    name: 'Geyser Water Heater (2000W)',
    category: 'WATER_HEATER' as const,
    ratedPowerW: 2000,
    standbyPowerW: 25,
    averageHoursPerDay: 1.5,
    isInverterType: false,
    energyRatingStars: 2,
    isVampireRisk: true,
  },
];
