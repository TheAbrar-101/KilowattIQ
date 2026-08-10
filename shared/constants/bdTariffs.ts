import { TariffStructure } from '../types/energy';

/**
 * Official Bangladesh Energy Regulatory Commission (BERC) / DESCO / DPDC / BPDB
 * Domestic Residential Category LT-A Tariff Rates (Effective 2024-2026)
 */
export const BD_DEFAULT_SLAB_TARIFF: TariffStructure = {
  id: 'DESCO-LTA-2025',
  utilityName: 'DESCO / DPDC / BPDB (LT-A Residential)',
  tariffType: 'SLAB',
  slabs: [
    { minKwh: 0, maxKwh: 75, ratePerKwh: 5.26, stepName: 'Step 1 (0 - 75 kWh)' },
    { minKwh: 76, maxKwh: 200, ratePerKwh: 7.20, stepName: 'Step 2 (76 - 200 kWh)' },
    { minKwh: 201, maxKwh: 300, ratePerKwh: 7.59, stepName: 'Step 3 (201 - 300 kWh)' },
    { minKwh: 301, maxKwh: 400, ratePerKwh: 8.02, stepName: 'Step 4 (301 - 400 kWh)' },
    { minKwh: 401, maxKwh: 600, ratePerKwh: 12.67, stepName: 'Step 5 (401 - 600 kWh)' },
    { minKwh: 601, maxKwh: null, ratePerKwh: 14.61, stepName: 'Step 6 (Above 600 kWh)' },
  ],
  flatRatePerKwh: 8.95,
  touRates: {
    offPeakRate: 7.05, // 23:00 to 17:00
    peakRate: 12.10,   // 17:00 to 23:00 (Peak hours in BD)
  },
  seasonalMultipliers: {
    summer: 1.15, // Hot summer humidity increases AC/Fan load
    winter: 0.85, // Cooler winter reduces AC load
  },
  demandChargePerKw: 42.0, // BDT 42/kW/month
  meterRent: 40.0,         // BDT 40/month
  vatPercent: 5.0,         // 5% Govt VAT
};

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
