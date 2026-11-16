import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Calculator,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Sliders,
  DollarSign,
  Layers,
  PieChart,
  ShieldAlert,
  Clock,
  Target,
  ArrowUpRight,
  Zap,
  Calendar
} from 'lucide-react';
import {
  TariffType,
  CostCalculation,
  BudgetStatus,
  SlabThresholdAnalysis,
  TariffVersion,
  BillRoundingMode,
} from '../../../shared/types/energy';
import { Household } from '../../../shared/types/household';
import { TariffCalculator, DEFAULT_BILL_ROUNDING_MODE } from '../../../backend/engine/TariffCalculator';
import { BudgetEngine } from '../../../backend/engine/BudgetEngine';
import {
  getTariffVersions,
  getTariffVersionForBillingPeriod,
  setTariffVersions,
} from '../../../shared/constants/bdTariffs';
import { VerifyBillSection } from '../bills/VerifyBillSection';
import { WeatherImpactCard } from '../cost/WeatherImpactCard';
import { useLanguage, toBengaliNumerals } from '../../context/LanguageContext';

interface CostAnalysisTabProps {
  household: Household;
  token?: string | null;
}

export const CostAnalysisTab: React.FC<CostAnalysisTabProps> = ({ household, token }) => {
  const { language, formatCurrency, formatNumber } = useLanguage();
  const [activeSection, setActiveSection] = useState<'VERIFY' | 'SIMULATOR'>('SIMULATOR');
  const [kwhInput, setKwhInput] = useState<number>(285);
  const [selectedTariffType, setSelectedTariffType] = useState<TariffType>('SLAB');
  const [daysPassedInput, setDaysPassedInput] = useState<number>(18);
  const currentBillingMonth = new Date().toISOString().slice(0, 7);
  const [billingPeriod, setBillingPeriod] = useState<string>(`${currentBillingMonth}-01`);
  const [showAdvancedPeriod, setShowAdvancedPeriod] = useState<boolean>(false);
  const [roundingMode, setRoundingMode] = useState<BillRoundingMode>(DEFAULT_BILL_ROUNDING_MODE);
  const [versions, setVersionsState] = useState<TariffVersion[]>(() => getTariffVersions());
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [realMtdKwh, setRealMtdKwh] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadVersions = async () => {
      try {
        const res = await fetch('/api/v1/tariffs/versions', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          if (!cancelled) setUsingFallback(true);
          return;
        }
        const json = await res.json();
        if (!cancelled && json.status === 'success' && Array.isArray(json.data?.versions)) {
          setTariffVersions(json.data.versions);
          setVersionsState(json.data.versions);
          setUsingFallback(Boolean(json.data?.usingFallback));
        }
      } catch {
        // Retain local seeded registry if offline
        if (!cancelled) setUsingFallback(true);
      }
    };
    loadVersions();

    // Also check if household has real Month-to-Date kWh from logged meter readings
    fetch(`/api/v1/meters/readings?householdId=${encodeURIComponent(household.id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const mtd = json?.data?.metrics?.monthToDateKwh;
        if (!cancelled && typeof mtd === 'number' && mtd > 0) {
          setRealMtdKwh(mtd);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token, household.id]);

  const activeTariffVersion = getTariffVersionForBillingPeriod(billingPeriod);

  // Compute live cost calculation for the selected billing period and rounding rule
  const costCalc: CostCalculation = TariffCalculator.calculateCost(
    kwhInput,
    household.sanctionedLoadKw,
    selectedTariffType,
    undefined,
    { billingPeriod, roundingMode }
  );

  // Compute live budget status
  const budgetStatus: BudgetStatus = BudgetEngine.evaluateBudget(
    household.id,
    household.monthlyBudgetBDT,
    kwhInput,
    daysPassedInput,
    30,
    household.sanctionedLoadKw,
    selectedTariffType,
    billingPeriod
  );

  // Compute predictive BERC slab threshold risk analysis
  const slabAnalysis: SlabThresholdAnalysis = TariffCalculator.analyzeSlabThreshold(
    kwhInput,
    daysPassedInput,
    30,
    household.sanctionedLoadKw,
    undefined,
    billingPeriod
  );

  return (
    <div className="space-y-5">
      {/* Primary Section Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-xs transition-colors">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveSection('VERIFY')}
            aria-label="Verify My Bill (OCR & Dispute)"
            className={`min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold font-['Outfit'] transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400 ${
              activeSection === 'VERIFY'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>{language === 'bn' ? 'বিল যাচাই ও ডিসপিউট' : 'Verify My Bill (OCR & Dispute)'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-white dark:bg-amber-400 dark:text-slate-950 font-bold font-mono">
              NEW
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('SIMULATOR')}
            aria-label="Tariff Simulator & Slabs"
            className={`min-h-[44px] flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold font-['Outfit'] transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400 ${
              activeSection === 'SIMULATOR'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>{language === 'bn' ? 'ট্যারিফ সিমুলেটর ও স্ল্যাব' : 'Tariff Simulator & Slabs'}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-2 sm:pr-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          <span>
            {(() => {
              const verId = costCalc.tariffVersionId || activeTariffVersion.version_id;
              const verifiedDate =
                costCalc.lastVerifiedDate !== undefined
                  ? costCalc.lastVerifiedDate
                  : activeTariffVersion.last_verified_date;
              const verifiedLabel = verifiedDate
                ? verifiedDate
                : (language === 'bn' ? 'Not verified (যাচাইকৃত নয়)' : 'Not verified');
              return language === 'bn'
                ? `ট্যারিফ সংস্করণ: ${verId}, সর্বশেষ যাচাই: ${verifiedLabel}`
                : `Tariff version: ${verId}, last verified: ${verifiedLabel}`;
            })()}
          </span>
        </div>
      </div>

      {usingFallback && (
        <div
          role="status"
          className="bg-amber-50 dark:bg-amber-950/40 border border-amber-400/50 rounded-2xl px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-['Plus_Jakarta_Sans']"
        >
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <span>
            {language === 'bn'
              ? 'Using built-in tariff data — ডাটাবেস সংযোগ না থাকায় বিল্ট-ইন ট্যারিফ ডেটা ব্যবহৃত হচ্ছে।'
              : 'Using built-in tariff data (read-only fallback while database is unavailable).'}
          </span>
        </div>
      )}

      {activeSection === 'VERIFY' ? (
        <VerifyBillSection household={household} />
      ) : (
        <>
          {/* Weather Impact This Week: CDD, AC Prediction & Heatwave Projections */}
          <WeatherImpactCard household={household} currentKwh={kwhInput} token={token} />

          {/* Top Controller Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
              <Calculator className="w-4.5 h-4.5 text-amber-500 dark:text-amber-400" />
              <span>Bangladeshi Electricity Tariff Engine & Simulator</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
              BERC / DESCO / DPDC LT-A Residential Tariff Engine with dynamic slab calculations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 rounded-xl">
              {[
                { label: '120 kWh', val: 120 },
                { label: '285 kWh', val: 285 },
                { label: '420 kWh', val: 420 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => setKwhInput(preset.val)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-display transition-all cursor-pointer ${
                    kwhInput === preset.val
                      ? 'bg-amber-400 text-slate-950 font-extrabold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase font-display">Tariff Model:</span>
              <select
                value={selectedTariffType}
                onChange={(e) => setSelectedTariffType(e.target.value as TariffType)}
                className="bg-transparent text-amber-600 dark:text-amber-400 font-extrabold font-display focus:outline-none cursor-pointer text-xs"
              >
                <option value="SLAB" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 font-bold">Slab / Tiered (Standard BD)</option>
                <option value="FLAT" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 font-bold">Flat Rate Tariff</option>
                <option value="TOU" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 font-bold">Time-Of-Use (Peak / Off-Peak)</option>
                <option value="SEASONAL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200 font-bold">Seasonal Adjusted</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase font-['Outfit']">
                {language === 'bn' ? 'মাস:' : 'Month:'}
              </span>
              <span className="text-slate-900 dark:text-white font-mono font-bold text-xs tabular-nums">
                {billingPeriod.slice(0, 7)}
              </span>
              <button
                type="button"
                onClick={() => setShowAdvancedPeriod(prev => !prev)}
                aria-expanded={showAdvancedPeriod}
                aria-label="Toggle Advanced billing period selector"
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] font-semibold font-['Outfit'] text-amber-600 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              >
                {language === 'bn' ? 'অ্যাডভান্সড' : 'Advanced'}
              </button>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase font-display">Consumption:</span>
              <input
                type="number"
                min="0"
                max="1500"
                aria-label="Monthly Consumption kWh"
                value={kwhInput}
                onChange={(e) => setKwhInput(Math.max(0, Number(e.target.value)))}
                className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-slate-900 dark:text-white font-mono font-bold text-xs focus:border-amber-500 focus:outline-none"
              />
              <span className="text-slate-500 dark:text-slate-400 font-mono font-bold">kWh</span>
            </div>

            {realMtdKwh !== null && (
              <button
                type="button"
                onClick={() => setKwhInput(Math.round(realMtdKwh))}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-['Outfit'] font-semibold text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {language === 'bn'
                  ? `আমার মিটার (${formatNumber(realMtdKwh.toFixed(1))} kWh)`
                  : `Use My Data (${realMtdKwh.toFixed(1)} kWh)`}
              </button>
            )}
          </div>
        </div>

        {showAdvancedPeriod && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
                <Calendar className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase font-['Outfit']">
                  {language === 'bn' ? 'বিলিং তারিখ:' : 'Billing Period:'}
                </span>
                <input
                  type="date"
                  aria-label="Billing Period Date"
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value || `${currentBillingMonth}-01`)}
                  className="bg-transparent text-slate-900 dark:text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase font-['Outfit']">
                  {language === 'bn' ? 'রাউন্ডিং নিয়ম:' : 'Rounding:'}
                </span>
                <select
                  aria-label="Bill Rounding Rule"
                  value={roundingMode}
                  onChange={(e) => setRoundingMode(e.target.value as BillRoundingMode)}
                  className="bg-transparent text-amber-600 dark:text-amber-400 font-bold font-['Outfit'] text-xs focus:outline-none cursor-pointer"
                >
                  <option value="FINAL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                    {language === 'bn' ? 'চূড়ান্ত রাউন্ডিং (ডিফল্ট)' : 'Final Total (Default)'}
                  </option>
                  <option value="PER_SLAB" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                    {language === 'bn' ? 'প্রতি-স্ল্যাব রাউন্ডিং' : 'Per-Slab Rounding'}
                  </option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 rounded-xl">
              {versions.slice(0, 4).map((ver) => (
                <button
                  key={ver.version_id}
                  type="button"
                  onClick={() => setBillingPeriod(ver.effective_from)}
                  aria-label={`Select tariff version ${ver.version_id}`}
                  className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[10px] font-semibold font-['Outfit'] transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400 ${
                    activeTariffVersion.version_id === ver.version_id
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {ver.version_id} ({ver.effective_from})
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBillingPeriod(`${currentBillingMonth}-01`)}
                aria-label="Reset to current billing month"
                className="min-h-[36px] px-2.5 py-1 rounded-lg text-[10px] font-semibold font-['Outfit'] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                {language === 'bn' ? 'বর্তমান মাস' : 'Current Month'}
              </button>
            </div>
          </div>
        )}

        {/* Interactive Sliders for Consumption & Month Days */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
          
          {/* Slider 1: kWh Consumption */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase font-display">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                Monthly kWh Consumption Slider
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">{kwhInput} kWh</span>
            </div>
            <input
              type="range"
              min="10"
              max="1000"
              step="5"
              value={kwhInput}
              onChange={(e) => setKwhInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Slider 2: Days Passed in Billing Cycle */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase font-display">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                Billing Cycle Progress ({daysPassedInput} / 30 Days)
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">{((daysPassedInput / 30) * 100).toFixed(0)}% Complete</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={daysPassedInput}
              onChange={(e) => setDaysPassedInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

        </div>
      </div>

      {/* Bill Cost Summary & Slab Step Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left 2 Cols: Cost Breakdown & Slab Items */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">Electricity Bill Detailed Breakdown</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                Sanctioned Load: {household.sanctionedLoadKw} kW | Meter Rent: {formatCurrency(costCalc.meterRentBDT)} | Demand Charge: {formatCurrency(costCalc.demandChargeBDT)}
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono mt-0.5">
                {(() => {
                  const verId = costCalc.tariffVersionId || activeTariffVersion.version_id;
                  const verifiedDate =
                    costCalc.lastVerifiedDate !== undefined
                      ? costCalc.lastVerifiedDate
                      : activeTariffVersion.last_verified_date;
                  const verifiedLabel = verifiedDate
                    ? verifiedDate
                    : (language === 'bn' ? 'Not verified (যাচাইকৃত নয়)' : 'Not verified');
                  return language === 'bn'
                    ? `ট্যারিফ সংস্করণ: ${verId}, সর্বশেষ যাচাই: ${verifiedLabel} (${activeTariffVersion.source_note})`
                    : `Tariff version: ${verId}, last verified: ${verifiedLabel} (${activeTariffVersion.source_note})`;
                })()}
              </p>
            </div>
            <div className="text-right">
              <motion.span
                key={costCalc.grossTotalBDT}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="text-3xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400"
              >
                {formatCurrency(costCalc.grossTotalBDT)}
              </motion.span>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold font-['Plus_Jakarta_Sans']">
                {language === 'bn' ? 'মোট বিল (৫% ভ্যাটসহ)' : 'Gross Total (Inc 5% VAT)'}
              </p>
            </div>
          </div>

          {/* Itemized Bill Breakdown Panel (units × rate = amount, then fixed charges, VAT, total) */}
          <div className="space-y-3" data-testid="bill-breakdown-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 font-['Outfit']">
                <Layers className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>
                  {language === 'bn'
                    ? `বিল বিশ্লেষণ (${formatNumber(kwhInput)} ইউনিট)`
                    : `Bill Breakdown (${formatNumber(kwhInput)} kWh)`}
                </span>
              </h5>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {language === 'bn'
                  ? `রাউন্ডিং: ${roundingMode === 'PER_SLAB' ? 'প্রতি-স্ল্যাব' : 'চূড়ান্ত'}`
                  : `Rounding: ${roundingMode === 'PER_SLAB' ? 'Per-Slab' : 'Final'}`}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950">
              <table className="w-full text-xs">
                <thead className="bg-slate-100/80 dark:bg-slate-900/90 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 font-['Outfit'] border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-left">
                      {language === 'bn' ? 'ধাপ / খাত' : 'Slab / Line Item'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {language === 'bn' ? 'ইউনিট (kWh)' : 'Units'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {language === 'bn' ? 'হার (৳/kWh)' : 'Rate'}
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      {language === 'bn' ? 'পরিমাণ (৳)' : 'Amount'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 font-['Plus_Jakarta_Sans']">
                  {(costCalc.slabBreakdown && costCalc.slabBreakdown.length > 0) ? (
                    costCalc.slabBreakdown.map((s, idx) => {
                      const unitsStr = language === 'bn'
                        ? toBengaliNumerals(s.kwhInSlab.toFixed(s.kwhInSlab % 1 === 0 ? 0 : 2))
                        : s.kwhInSlab.toFixed(s.kwhInSlab % 1 === 0 ? 0 : 2);
                      return (
                        <tr key={idx} className="hover:bg-white/60 dark:hover:bg-slate-900/50 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                            <span className="font-['Outfit'] font-semibold">{s.stepName}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {unitsStr}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            × {formatCurrency(s.rate, { showDecimals: true })}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            {formatCurrency(s.costBDT, { showDecimals: true })}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {language === 'bn' ? `বিদ্যুৎ চার্জ (${selectedTariffType})` : `Energy Charge (${selectedTariffType})`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatNumber(costCalc.totalKwh)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        —
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatCurrency(costCalc.energyCostBDT, { showDecimals: true })}
                      </td>
                    </tr>
                  )}

                  {/* Energy Subtotal */}
                  <tr className="bg-slate-100/60 dark:bg-slate-900/50">
                    <td colSpan={3} className="py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 font-['Outfit']">
                      {language === 'bn' ? 'মোট বিদ্যুৎ শক্তি চার্জ' : 'Electricity Energy Charge'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                      {formatCurrency(costCalc.energyCostBDT, { showDecimals: true })}
                    </td>
                  </tr>

                  {/* Demand Charge */}
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {language === 'bn'
                        ? `ডিমান্ড চার্জ (${toBengaliNumerals(household.sanctionedLoadKw)} কিও × ${formatCurrency(activeTariffVersion.demandChargePerKw ?? 42, { showDecimals: false })})`
                        : `Demand Charge (${household.sanctionedLoadKw} kW × ${formatCurrency(activeTariffVersion.demandChargePerKw ?? 42, { showDecimals: false })})`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {formatCurrency(costCalc.demandChargeBDT, { showDecimals: true })}
                    </td>
                  </tr>

                  {/* Meter Rent */}
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {language === 'bn' ? 'মিটার ভাড়া' : 'Meter Rent'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {formatCurrency(costCalc.meterRentBDT, { showDecimals: true })}
                    </td>
                  </tr>

                  {/* Subtotal */}
                  <tr className="bg-slate-100/60 dark:bg-slate-900/50">
                    <td colSpan={3} className="py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 font-['Outfit']">
                      {language === 'bn' ? 'উপমোট (ভ্যাট পূর্বে)' : 'Principal / Subtotal'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(
                        costCalc.subtotalBDT ?? (costCalc.energyCostBDT + costCalc.demandChargeBDT + costCalc.meterRentBDT),
                        { showDecimals: true }
                      )}
                    </td>
                  </tr>

                  {/* VAT */}
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-xs text-slate-600 dark:text-slate-300">
                      {language === 'bn'
                        ? `সরকারি ভ্যাট (${toBengaliNumerals(activeTariffVersion.vatPercent ?? 5)}%)`
                        : `Government VAT (${activeTariffVersion.vatPercent ?? 5}%)`}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                      {formatCurrency(costCalc.vatBDT, { showDecimals: true })}
                    </td>
                  </tr>

                  {/* Gross Total */}
                  <tr className="bg-amber-500/10 dark:bg-amber-500/15 border-t-2 border-amber-500/30">
                    <td colSpan={3} className="py-3 px-3 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white font-['Outfit']">
                      {language === 'bn' ? 'সর্বমোট প্রদেয় বিল' : 'Total Payable Bill'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-base font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(costCalc.grossTotalBDT, { showDecimals: true })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {selectedTariffType === 'SLAB' && (
              <p
                className={`text-[11px] rounded-xl px-3 py-2 border font-['Plus_Jakarta_Sans'] ${
                  kwhInput >= 45 && kwhInput <= 60
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400/50 text-amber-800 dark:text-amber-300 font-medium'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                }`}
              >
                {language === 'bn'
                  ? 'নোট (৫০–৫১ ইউনিট নিয়ম): মাসিক ব্যবহার ৫০ kWh অতিক্রম করলে লাইফলাইন হার (৳৪.৬৩) আর প্রযোজ্য থাকে না; তখন ১ম ইউনিট থেকেই ধাপ ১ (০–৭৫ kWh @ ৳৫.২৬) হিসেবে বিল গণনা হয়।'
                  : '50–51 kWh Lifeline note: Crossing 50 kWh removes the Lifeline rate (৳4.63/kWh); all units from 0–75 kWh are billed at Step 1 (৳5.26/kWh).'}
              </p>
            )}
          </div>

          {/* Fixed Charges Summary Cards */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block font-['Outfit']">
                {language === 'bn' ? 'বিদ্যুৎ চার্জ' : 'Energy Cost'}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {formatCurrency(costCalc.energyCostBDT, { showDecimals: true })}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block font-['Outfit']">
                {language === 'bn' ? 'ডিমান্ড ও মিটার' : 'Demand & Meter'}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {formatCurrency(costCalc.demandChargeBDT + costCalc.meterRentBDT, { showDecimals: true })}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block font-['Outfit']">
                {language === 'bn' ? 'ভ্যাট (৫%)' : 'VAT (5%)'}
              </span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                {formatCurrency(costCalc.vatBDT, { showDecimals: true })}
              </span>
            </div>
          </div>

        </div>

        {/* Right Col: Budget & Burn Rate Predictor */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 font-['Outfit']">
                <PieChart className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>Monthly Budget Engine</span>
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                budgetStatus.isOverageLikely
                  ? 'bg-amber-500/10 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-400/40'
                  : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
              }`}>
                {budgetStatus.isOverageLikely ? 'BUDGET PACE WARNING' : 'ON TRACK'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block font-['Outfit']">Monthly Budget Cap</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">{formatCurrency(household.monthlyBudgetBDT)}</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block font-['Outfit']">Projected End-Of-Month Bill</span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">{formatCurrency(budgetStatus.projectedCostBDT)}</span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>Spent So Far: {formatCurrency(budgetStatus.currentSpentBDT)}</span>
                  <span>Day {daysPassedInput} / 30</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      budgetStatus.isOverageLikely ? 'bg-amber-400' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (budgetStatus.currentSpentBDT / household.monthlyBudgetBDT) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Actionable Advice */}
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase block flex items-center gap-1 font-['Outfit']">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Budget Insight
                </span>
                <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed font-['Plus_Jakarta_Sans']">
                  {budgetStatus.isOverageLikely
                    ? `Projected to exceed budget by ${budgetStatus.overagePercentage.toFixed(0)}%. Consider shifting AC usage during peak hours.`
                    : `Current usage pattern is within safe budget limits. Estimated savings vs cap: ${formatCurrency(Math.max(0, household.monthlyBudgetBDT - budgetStatus.projectedCostBDT))}.`}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 text-center font-mono">
            KilowattIQ Tariff Engine • BERC Ordinance LT-A 2026
          </div>
        </div>

      </div>

      {/* Predictive BERC Slab Threshold Risk Monitor */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              slabAnalysis.projectedBreachOccurs ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            }`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 font-['Outfit']">
                <span>BERC Progressive Slab Threshold Risk Monitor</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                  slabAnalysis.projectedBreachOccurs
                    ? 'bg-amber-500/10 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-400/40'
                    : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                }`}>
                  {slabAnalysis.projectedBreachOccurs ? 'Step Jump Hazard' : 'Safe Tier Profile'}
                </span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-['Plus_Jakarta_Sans']">
                Predictive slab transition tracking to protect households against steep marginal unit rate jumps
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase block font-mono">Current Active Tier</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {slabAnalysis.currentSlabName} (৳{slabAnalysis.currentRateBDT}/unit)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Metric 1: Next Slab Jump */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1 font-['Outfit']">
              <ArrowUpRight className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              Next Step Margin
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                {slabAnalysis.nextRateBDT ? `৳${slabAnalysis.nextRateBDT}` : 'Max Tier'}
              </span>
              {slabAnalysis.rateJumpPercentage > 0 && (
                <span className="text-[11px] font-bold text-amber-500 dark:text-amber-400 font-mono">
                  (+{slabAnalysis.rateJumpPercentage}%)
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-['Plus_Jakarta_Sans']">
              {slabAnalysis.nextSlabName || 'Top BERC step reached'}
            </p>
          </div>

          {/* Metric 2: Breach Countdown */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1 font-['Outfit']">
              <Clock className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Breach Countdown
            </span>
            <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
              {slabAnalysis.daysUntilBreach !== null
                ? `${slabAnalysis.daysUntilBreach} Days`
                : 'No Limit'}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-['Plus_Jakarta_Sans']">
              {slabAnalysis.kwhRemainingToBreach > 0
                ? `${slabAnalysis.kwhRemainingToBreach} kWh buffer remaining`
                : 'Already in top tier'}
            </p>
          </div>

          {/* Metric 3: Target Daily Cap */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1 font-['Outfit']">
              <Target className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Target Daily Cap
            </span>
            <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {slabAnalysis.maxDailyKwhToStayInSlab > 0
                ? `${slabAnalysis.maxDailyKwhToStayInSlab} kWh/day`
                : 'Slab Exceeded'}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-['Plus_Jakarta_Sans']">
              Limit to maintain {slabAnalysis.currentSlabName.split(' ')[0]} {slabAnalysis.currentSlabName.split(' ')[1]}
            </p>
          </div>

          {/* Metric 4: Avoidable Penalty */}
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1 font-['Outfit']">
              <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              Avoidable Surcharge
            </span>
            <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
              {formatCurrency(slabAnalysis.avoidableMonthlySurchargeBDT)}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
              Savings if breach is averted
            </p>
          </div>
        </div>
      </div>
        </>
      )}

    </div>
  );
};
