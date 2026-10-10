/**
 * Weather & Meteorological Energy Impact - Types
 * 
 * Bangladeshi Power & Weather Ecosystem:
 * - Cooling Degree Days (CDD): base temperature 24°C (ASHRAE / BERC indoor comfort benchmark)
 * - Divisional Meteorological Centers: Dhaka, Chattogram, Sylhet, Rajshahi, Khulna, Barishal, Rangpur, Mymensingh
 * - Impact on BERC progressive slab tariffs & heatwave surcharge risk
 */

export type BangladeshCity =
  | 'Dhaka'
  | 'Chattogram'
  | 'Sylhet'
  | 'Rajshahi'
  | 'Khulna'
  | 'Barishal'
  | 'Rangpur'
  | 'Mymensingh';

export interface CityCoordinates {
  city: BangladeshCity;
  division: string;
  lat: number;
  lon: number;
}

export interface DailyWeatherForecast {
  date: string;
  dayName: string;
  dayNameBn: string;
  tempMaxC: number;
  tempMinC: number;
  tempMeanC: number;
  feelsLikeMaxC: number;
  humidityPct: number;
  cdd: number; // Cooling Degree Days above 24°C
  precipitationMm: number;
  condition: string;
  conditionBn: string;
  isPast: boolean;
  isToday: boolean;
  isHeatwaveDay: boolean;
}

export interface ACRunPrediction {
  predictedHoursToday: number;
  baselineHours: number;
  hoursDelta: number;
  estimatedCoolingKwhToday: number;
  estimatedCostTodayBDT: number;
  ambientFactor: number;
  efficiencyDropPct: number;
  headline: string;
  headlineBn: string;
  advice: string;
  adviceBn: string;
}

export interface HeatwaveBillImpact {
  isHeatwaveLikely: boolean;
  heatwaveSeverity: 'NONE' | 'MODERATE' | 'SEVERE';
  consecutiveHotDays: number;
  avgForecastTempC: number;
  projectedBillIncreaseBDT: number;
  projectedExtraKwh: number;
  slabJumpRisk: boolean;
  currentSlabName?: string;
  projectedSlabName?: string;
  preWarningBanner: string;
  preWarningBannerBn: string;
}

export interface SeasonalLoadMetrics {
  name: string;
  nameBn: string;
  seasonPeriod: string;
  seasonPeriodBn: string;
  avgTempC: number;
  avgHumidityPct: number;
  avgDailyCdd: number;
  acHoursPerDay: number;
  dailyKwh: number;
  monthlyKwh: number;
  monthlyBillBDT: number;
  description: string;
  descriptionBn: string;
}

export interface SeasonalComparison {
  summer: SeasonalLoadMetrics;
  rainy: SeasonalLoadMetrics;
  loadDifferencePct: number;
  kwhDifferenceMonthly: number;
  billDifferenceBDT: number;
  comparisonInsight: string;
  comparisonInsightBn: string;
}

export interface ThermodynamicPoint {
  id: string;
  title: string;
  titleBn: string;
  summary: string;
  summaryBn: string;
  engineeringExplanation: string;
  engineeringExplanationBn: string;
  actionableTip: string;
  actionableTipBn: string;
}

export interface WeatherEnergyImpactReport {
  city: BangladeshCity;
  division: string;
  coordinates: { lat: number; lon: number };
  current: {
    tempC: number;
    feelsLikeC: number;
    humidityPct: number;
    windKph: number;
    condition: string;
    conditionBn: string;
  };
  forecast: DailyWeatherForecast[];
  coolingDegreeDays: {
    baseTempC: number;
    past7DaysTotal: number;
    forecast7DaysTotal: number;
    deltaPercentage: number;
  };
  acPrediction: ACRunPrediction;
  heatwaveImpact: HeatwaveBillImpact;
  seasonalComparison: SeasonalComparison;
  thermodynamicExplainer: {
    title: string;
    titleBn: string;
    points: ThermodynamicPoint[];
  };
  cachedAt: string;
  expiresAt: string;
  dataSource: 'OPEN_METEO' | 'OPENWEATHER' | 'MOCK_METEOROLOGY';
}
