import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sun,
  CloudSun,
  CloudRain,
  Flame,
  Thermometer,
  TrendingUp,
  Clock,
  Layers,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Droplets,
  Wind,
  CheckCircle2
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import {
  BangladeshCity,
  WeatherEnergyImpactReport,
} from '../../server/weather/types';
import { BANGLADESH_CITIES } from '../../server/weather/weatherService';
import { Household } from '../../../shared/types/household';

interface WeatherImpactCardProps {
  household: Household;
  currentKwh?: number;
  token?: string | null;
}

export const WeatherImpactCard: React.FC<WeatherImpactCardProps> = ({
  household,
  currentKwh = 285,
  token,
}) => {
  // Infer initial city from household address division or default to Dhaka
  const initialCity: BangladeshCity =
    (household.address?.division && BANGLADESH_CITIES[household.address.division as BangladeshCity])
      ? (household.address.division as BangladeshCity)
      : 'Dhaka';

  const [selectedCity, setSelectedCity] = useState<BangladeshCity>(initialCity);
  const [report, setReport] = useState<WeatherEnergyImpactReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showExplainer, setShowExplainer] = useState<boolean>(false);
  const [expandedPointId, setExpandedPointId] = useState<string | null>('cop_degradation');
  const [activeLang, setActiveLang] = useState<'EN' | 'BN'>('EN');

  const fetchWeatherImpact = useCallback(async (isManualRefresh: boolean = false) => {
    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(
        `/api/v1/weather/impact?city=${encodeURIComponent(selectedCity)}&householdId=${encodeURIComponent(
          household.id
        )}&kwh=${currentKwh}`,
        { headers }
      );

      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setReport(json.data);
      }
    } catch (err) {
      console.warn('[WeatherImpactCard] Failed to fetch weather report:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedCity, household.id, currentKwh, token]);

  useEffect(() => {
    fetchWeatherImpact();
  }, [fetchWeatherImpact]);

  const handleCityChange = (city: BangladeshCity) => {
    setSelectedCity(city);
  };

  const handleRefresh = async () => {
    try {
      if (token) {
        await fetch('/api/v1/weather/clear-cache', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {
      // ignore
    }
    fetchWeatherImpact(true);
  };

  if (isLoading && !report) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-48" />
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-28" />
        </div>
        <div className="h-20 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
        <div className="h-44 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
      </div>
    );
  }

  if (!report) return null;

  const { acPrediction, heatwaveImpact, seasonalComparison, coolingDegreeDays, thermodynamicExplainer } = report;

  // Chart data preparing
  const chartData = report.forecast.map(d => ({
    day: d.isToday ? 'Today' : d.dayName,
    date: d.date.slice(5),
    cdd: d.cdd,
    tempMax: d.tempMaxC,
    feelsLike: d.feelsLikeMaxC,
    isToday: d.isToday,
    isPast: d.isPast,
    isHeatwave: d.isHeatwaveDay,
  }));

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors space-y-5">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 dark:text-amber-400">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Weather Impact This Week
              </h3>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                CDD 24°C Base
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
              Meteorological cooling load correlation & heatwave bill forecast for {report.city}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Language Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] font-bold font-display">
            <button
              onClick={() => setActiveLang('EN')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                activeLang === 'EN'
                  ? 'bg-amber-400 text-slate-950 font-extrabold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setActiveLang('BN')}
              className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                activeLang === 'BN'
                  ? 'bg-amber-400 text-slate-950 font-extrabold shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              বাংলা
            </button>
          </div>

          {/* City Selector */}
          <select
            value={selectedCity}
            onChange={e => handleCityChange(e.target.value as BangladeshCity)}
            className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 font-display focus:outline-none cursor-pointer"
          >
            {Object.keys(BANGLADESH_CITIES).map(c => (
              <option key={c} value={c} className="bg-white dark:bg-slate-900">
                {c} Division
              </option>
            ))}
          </select>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh weather telemetry (30 min cache)"
            className="p-1.5 bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-600 dark:text-slate-300 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pre-warning Banner: "Hot week ahead — projected bill +৳Y" */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          heatwaveImpact.isHeatwaveLikely
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200'
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2 rounded-xl mt-0.5 ${
              heatwaveImpact.isHeatwaveLikely
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {heatwaveImpact.isHeatwaveLikely ? <Flame className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider font-display">
                {activeLang === 'BN' ? 'আবহাওয়ার সতর্কবার্তা' : 'Weather Pre-Warning'}
              </span>
              {heatwaveImpact.slabJumpRisk && (
                <span className="text-[10px] font-bold font-mono px-2 py-0.2 rounded bg-rose-600 text-white animate-pulse">
                  SLAB JUMP RISK
                </span>
              )}
            </div>
            <h4 className="text-sm font-extrabold font-display mt-0.5">
              {activeLang === 'BN' ? heatwaveImpact.preWarningBannerBn : heatwaveImpact.preWarningBanner}
            </h4>
            <p className="text-xs opacity-90 font-sans mt-0.5">
              {activeLang === 'BN'
                ? `গড় তাপমাত্রা ${heatwaveImpact.avgForecastTempC}°C। অতিরিক্ত আনুমানিক শীতলীকরণ ব্যবহার: +${heatwaveImpact.projectedExtraKwh} kWh।`
                : `Forecast average temp: ${heatwaveImpact.avgForecastTempC}°C. Incremental cooling load: +${heatwaveImpact.projectedExtraKwh} kWh.`}
              {heatwaveImpact.slabJumpRisk && (
                <span className="font-bold underline ml-1">
                  {activeLang === 'BN'
                    ? `সতর্কতা: এই তাপপ্রবাহের লোড আপনার বর্তমান ${heatwaveImpact.currentSlabName} অতিক্রম করাতে পারে!`
                    : `Caution: Heatwave load risks pushing you out of ${heatwaveImpact.currentSlabName}!`}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          <div className="bg-white/80 dark:bg-slate-900/80 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800 text-right">
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 block font-display">
              {activeLang === 'BN' ? 'বিল বৃদ্ধির আশঙ্কা' : 'Projected Extra Cost'}
            </span>
            <span className="text-base font-bold font-mono text-amber-700 dark:text-amber-300">
              +৳{heatwaveImpact.projectedBillIncreaseBDT}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Main 2-Column Grid: AC Run Prediction & Current Ambient Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: AC Run Prediction Widget */}
        <div className="md:col-span-2 bg-gradient-to-br from-amber-500/10 via-slate-50 dark:via-slate-950 to-white dark:to-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                {activeLang === 'BN' ? 'আজকের এসি রানটাইম পূর্বাভাস' : 'Daily AC Runtime Prediction'}
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
              1.5 Ton AC Reference
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pt-1">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
                  {acPrediction.predictedHoursToday}
                </span>
                <span className="text-sm font-bold text-slate-500 font-sans">
                  {activeLang === 'BN' ? 'ঘণ্টা আজ' : 'hours today'}
                </span>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 font-mono">
                  (+{acPrediction.hoursDelta}h vs {acPrediction.baselineHours}h base)
                </span>
              </div>
              <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 font-display">
                {activeLang === 'BN' ? acPrediction.headlineBn : acPrediction.headline}
              </h5>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-800">
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">
                  {activeLang === 'BN' ? 'আজকের আনুমানিক এসি খরচ' : 'Today\'s Est. AC Cost'}
                </span>
                <span className="text-lg font-black font-mono text-amber-800 dark:text-amber-300">
                  ৳{acPrediction.estimatedCostTodayBDT}
                </span>
                <span className="text-[10px] font-mono text-slate-400 block">
                  ({acPrediction.estimatedCoolingKwhToday} kWh)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/70 dark:bg-slate-950/70 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2 font-sans">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{activeLang === 'BN' ? acPrediction.adviceBn : acPrediction.advice}</span>
          </div>
        </div>

        {/* Card 2: Current Ambient Snapshot & Heat Stress Factor */}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-display">
                {report.city} Live Ambient
              </span>
              <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 font-bold">
                {report.current.condition}
              </span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                {report.current.tempC}°C
              </span>
              <span className="text-xs font-bold text-slate-500 font-mono">
                Feels like {report.current.feelsLikeC}°C
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-sky-500" /> Relative Humidity:
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {report.current.humidityPct}%
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-rose-500" /> Compressor Stress:
              </span>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                +{acPrediction.efficiencyDropPct}% Load
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-500" /> CDD Trend (7-day):
              </span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                {coolingDegreeDays.deltaPercentage >= 0 ? `+${coolingDegreeDays.deltaPercentage}%` : `${coolingDegreeDays.deltaPercentage}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cooling Degree Days (CDD) Chart Section */}
      <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
              Cooling Degree Days (CDD) 14-Day Trajectory
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
              Base Temperature: 24.0°C • Past 7 Days vs. Next 7 Days Forecast
            </p>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-400 dark:bg-slate-600" />
              <span>Past Recorded</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span>Today / Forecast</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
              <span>Heatwave Peak</span>
            </div>
          </div>
        </div>

        {/* Recharts Composed Bar Chart */}
        <div className="h-48 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                unit="°"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs font-mono shadow-xl border border-slate-700">
                        <div className="font-bold text-amber-400 mb-1 font-display">
                          {data.day} ({data.date}) {data.isToday ? '• TODAY' : ''}
                        </div>
                        <div>Max Temp: {data.tempMax}°C</div>
                        <div>Feels Like: {data.feelsLike}°C</div>
                        <div className="text-amber-300 font-bold">CDD (Base 24°C): {data.cdd}°</div>
                        {data.isHeatwave && <div className="text-rose-400 font-bold mt-1">⚠️ Severe Heatwave Day</div>}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="cdd" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => {
                  let fillColor = '#64748b'; // past
                  if (entry.isHeatwave) fillColor = '#f43f5e'; // heatwave rose
                  else if (entry.isToday) fillColor = '#f59e0b'; // amber today
                  else if (!entry.isPast) fillColor = '#fbbf24'; // forecast amber
                  return <Cell key={`cell-${index}`} fill={fillColor} />;
                })}
              </Bar>
              <Line
                type="monotone"
                dataKey="feelsLike"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                name="Feels Like Temp"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-200 dark:border-slate-800">
          <span>Past 7 Days CDD Total: {coolingDegreeDays.past7DaysTotal}°</span>
          <span className="font-bold text-amber-700 dark:text-amber-300">
            Next 7 Days CDD Forecast: {coolingDegreeDays.forecast7DaysTotal}° ({coolingDegreeDays.deltaPercentage >= 0 ? `+${coolingDegreeDays.deltaPercentage}%` : `${coolingDegreeDays.deltaPercentage}%`})
          </span>
        </div>
      </div>

      {/* Rainy Season vs. Summer Load Comparison Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudRain className="w-4 h-4 text-sky-500" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
              {activeLang === 'BN' ? 'বর্ষাকাল বনাম গ্রীষ্মকাল বিদ্যুৎ ব্যবহারের তুলনা' : 'Rainy Season vs. Summer Load Comparison'}
            </h4>
          </div>
          <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
            ~{seasonalComparison.loadDifferencePct}% Lower in Monsoon
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Summer Column */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-900 dark:text-amber-300 font-display">
                {activeLang === 'BN' ? seasonalComparison.summer.nameBn : seasonalComparison.summer.name}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {activeLang === 'BN' ? seasonalComparison.summer.seasonPeriodBn : seasonalComparison.summer.seasonPeriod}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center py-1">
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <span className="text-[9px] text-slate-500 block">Avg Temp</span>
                <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">{seasonalComparison.summer.avgTempC}°C</span>
              </div>
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <span className="text-[9px] text-slate-500 block">AC Run</span>
                <span className="text-xs font-bold font-mono text-amber-700 dark:text-amber-300">{seasonalComparison.summer.acHoursPerDay} hrs/d</span>
              </div>
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                <span className="text-[9px] text-slate-500 block">Monthly Bill</span>
                <span className="text-xs font-black font-mono text-amber-800 dark:text-amber-300">৳{seasonalComparison.summer.monthlyBillBDT}</span>
              </div>
            </div>

            <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
              {activeLang === 'BN' ? seasonalComparison.summer.descriptionBn : seasonalComparison.summer.description}
            </p>
          </div>

          {/* Rainy Season Column */}
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-sky-900 dark:text-sky-300 font-display">
                {activeLang === 'BN' ? seasonalComparison.rainy.nameBn : seasonalComparison.rainy.name}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {activeLang === 'BN' ? seasonalComparison.rainy.seasonPeriodBn : seasonalComparison.rainy.seasonPeriod}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center py-1">
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-sky-200 dark:border-sky-900/50">
                <span className="text-[9px] text-slate-500 block">Avg Temp</span>
                <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">{seasonalComparison.rainy.avgTempC}°C</span>
              </div>
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-sky-200 dark:border-sky-900/50">
                <span className="text-[9px] text-slate-500 block">AC Run</span>
                <span className="text-xs font-bold font-mono text-sky-600 dark:text-sky-400">{seasonalComparison.rainy.acHoursPerDay} hrs/d</span>
              </div>
              <div className="bg-white dark:bg-slate-950 p-2 rounded-lg border border-sky-200 dark:border-sky-900/50">
                <span className="text-[9px] text-slate-500 block">Monthly Bill</span>
                <span className="text-xs font-black font-mono text-sky-700 dark:text-sky-300">৳{seasonalComparison.rainy.monthlyBillBDT}</span>
              </div>
            </div>

            <p className="text-[10.5px] text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
              {activeLang === 'BN' ? seasonalComparison.rainy.descriptionBn : seasonalComparison.rainy.description}
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
          💡 {activeLang === 'BN' ? seasonalComparison.comparisonInsightBn : seasonalComparison.comparisonInsight}
        </div>
      </div>

      {/* Bilingual Thermodynamic Explainer (Collapsible) */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
              {activeLang === 'BN' ? thermodynamicExplainer.titleBn : thermodynamicExplainer.title}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 font-display">
            <span>{showExplainer ? (activeLang === 'BN' ? 'লুকান' : 'Hide Explanations') : (activeLang === 'BN' ? 'বিস্তারিত দেখুন' : 'View Physics & Tips')}</span>
            {showExplainer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        <AnimatePresence>
          {showExplainer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 bg-white dark:bg-slate-900 space-y-3 border-t border-slate-200 dark:border-slate-800"
            >
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                {activeLang === 'BN'
                  ? 'বাইরের আবহাওয়া কীভাবে আপনার এসির কম্প্রেসারের উপর চাপ সৃষ্টি করে এবং বিইআরসি স্ল্যাব কাঠামো অনুযায়ী বিল বহুগুণ বাড়িয়ে দেয় তা নিচে ব্যাখ্যা করা হলো:'
                  : 'An engineering breakdown of how external ambient conditions penalize compressor performance and trigger exponential electricity tariff increases:'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {thermodynamicExplainer.points.map(pt => {
                  const isSelected = expandedPointId === pt.id;
                  return (
                    <div
                      key={pt.id}
                      onClick={() => setExpandedPointId(isSelected ? null : pt.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="text-xs font-bold text-slate-900 dark:text-white font-display">
                          {activeLang === 'BN' ? pt.titleBn : pt.title}
                        </h5>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 font-mono">
                          {isSelected ? '−' : '+'}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-400 font-sans mt-1">
                        {activeLang === 'BN' ? pt.summaryBn : pt.summary}
                      </p>

                      {isSelected && (
                        <div className="mt-2.5 pt-2 border-t border-amber-500/20 text-[11px] space-y-2">
                          <p className="text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                            {activeLang === 'BN' ? pt.engineeringExplanationBn : pt.engineeringExplanation}
                          </p>
                          <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-500/20 text-amber-800 dark:text-amber-300 font-sans flex items-start gap-1.5">
                            <span className="font-bold shrink-0">
                              {activeLang === 'BN' ? 'পরামর্শ:' : 'Tip:'}
                            </span>
                            <span>{activeLang === 'BN' ? pt.actionableTipBn : pt.actionableTip}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
