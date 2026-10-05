/**
 * KilowattIQ Energy Constants & BERC LT-A Residential Tariff Specifications
 * 
 * Defines standard Bangladesh electrical grid baseline metrics (voltage, frequency,
 * power factor, standby power), carbon emission factors, and official BERC 6-tier
 * residential progressive tariff slabs.
 */

export interface ElectricalRange {
  min: number;
  max: number;
  unit: string;
}

export interface VoltageSpecification {
  nominal: number;
  min: number;
  max: number;
  tolerancePercent: number;
  unit: string;
}

export interface FrequencySpecification {
  nominal: number;
  min: number;
  max: number;
  tolerancePercent: number;
  unit: string;
}

export interface BercSlabTier {
  step: number;
  minKwh: number;
  maxKwh: number | null;
  ratePerKwh: number;
  stepName: string;
  stepCapacity: number | null;
}

/**
 * Nominal RMS Single-Phase Grid Voltage in Bangladesh (220 V)
 */
export const VOLTAGE_NOMINAL: number = 220;

/**
 * RMS Grid Voltage Allowed Operating Window: 220 V ± 10% (195 V to 245 V)
 */
export const VOLTAGE_RANGE: VoltageSpecification = {
  nominal: 220,
  min: 195,
  max: 245,
  tolerancePercent: 10,
  unit: 'V',
} as const;

/**
 * Bangladesh National Grid Nominal Line Frequency: 50 Hz ± 1% (49.5 Hz to 50.5 Hz)
 */
export const FREQUENCY: FrequencySpecification = {
  nominal: 50,
  min: 49.5,
  max: 50.5,
  tolerancePercent: 1,
  unit: 'Hz',
} as const;

/**
 * Typical Residential Power Factor (cos φ) Range: 0.85 to 0.99
 */
export const PF_RANGE: ElectricalRange = {
  min: 0.85,
  max: 0.99,
  unit: 'cosφ',
} as const;

/**
 * Active Live Power Load Operating Range: 0 W to 6,500 W (Single Phase Mains)
 */
export const LIVE_WATTAGE_RANGE: ElectricalRange = {
  min: 0,
  max: 6500,
  unit: 'W',
} as const;

/**
 * Standby / Vampire Phantom Power Draw per Device: 0.5 W to 15.0 W
 */
export const STANDBY_RANGE: ElectricalRange = {
  min: 0.5,
  max: 15.0,
  unit: 'W',
} as const;

/**
 * Slab Jump Penalty - Step 3 (201-300 kWh) to Step 4 (301-400 kWh): ৳1.10 / kWh
 */
export const SLAB_JUMP_3_4: number = 1.10;

/**
 * Slab Jump Penalty - Step 4 (301-400 kWh) to Step 5 (401-600 kWh): ৳1.35 / kWh
 */
export const SLAB_JUMP_4_5: number = 1.35;

/**
 * Bangladesh National Electrical Grid Carbon Intensity Factor: 0.62 kg CO₂ per kWh
 */
export const CARBON_FACTOR_BD: number = 0.62;

/**
 * Official BERC LT-A Domestic Residential 6-Step Progressive Tariff Slabs
 * Applied across DESCO, DPDC, BPDB, and WZPDCL jurisdictions
 */
export const BERC_LTA_6_SLABS: readonly BercSlabTier[] = [
  {
    step: 1,
    minKwh: 0,
    maxKwh: 75,
    ratePerKwh: 5.26,
    stepName: 'Step 1 (0 - 75 kWh)',
    stepCapacity: 75,
  },
  {
    step: 2,
    minKwh: 76,
    maxKwh: 200,
    ratePerKwh: 7.20,
    stepName: 'Step 2 (76 - 200 kWh)',
    stepCapacity: 125,
  },
  {
    step: 3,
    minKwh: 201,
    maxKwh: 300,
    ratePerKwh: 7.59,
    stepName: 'Step 3 (201 - 300 kWh)',
    stepCapacity: 100,
  },
  {
    step: 4,
    minKwh: 301,
    maxKwh: 400,
    ratePerKwh: 8.02,
    stepName: 'Step 4 (301 - 400 kWh)',
    stepCapacity: 100,
  },
  {
    step: 5,
    minKwh: 401,
    maxKwh: 600,
    ratePerKwh: 12.67,
    stepName: 'Step 5 (401 - 600 kWh)',
    stepCapacity: 200,
  },
  {
    step: 6,
    minKwh: 601,
    maxKwh: null,
    ratePerKwh: 14.61,
    stepName: 'Step 6 (Above 600 kWh)',
    stepCapacity: null,
  },
] as const;

/**
 * Canonical alias for the 6-slab array
 */
export const BERC_LTA_SLABS = BERC_LTA_6_SLABS;

export default {
  VOLTAGE_NOMINAL,
  VOLTAGE_RANGE,
  FREQUENCY,
  PF_RANGE,
  LIVE_WATTAGE_RANGE,
  STANDBY_RANGE,
  SLAB_JUMP_3_4,
  SLAB_JUMP_4_5,
  CARBON_FACTOR_BD,
  BERC_LTA_6_SLABS,
  BERC_LTA_SLABS,
};
