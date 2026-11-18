import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Camera,
  Check,
  Clock,
  Copy,
  Layers,
  MessageCircle,
  MessageSquare,
  Plus,
  Share2,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import {
  MonthlyComparisonSummary,
  SlabThresholdAnalysis,
} from '../../../shared/types/energy';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import { MeterUsageMetrics } from '../../server/meters/types';
import { useLanguage, toBengaliNumerals } from '../../context/LanguageContext';

interface SlabPredictionHeroProps {
  household: Household;
  isDemoData: boolean;
  realMetrics: MeterUsageMetrics | null;
  demoUnitsThisMonth?: number;
  demoUnitsLastMonth?: number;
  demoDaysPassed?: number;
  demoTotalDays?: number;
  onQuickAddReading?: () => void;
  onQuickScanMeter?: () => void;
}

export const SlabPredictionHero: React.FC<SlabPredictionHeroProps> = ({
  household,
  isDemoData,
  realMetrics,
  demoUnitsThisMonth = 245,
  demoUnitsLastMonth = 210,
  demoDaysPassed = 18,
  demoTotalDays = 30,
  onQuickAddReading,
  onQuickScanMeter,
}) => {
  const { language, formatCurrency, formatNumber } = useLanguage();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLang, setShareLang] = useState<'en' | 'bn'>(language);
  const [copied, setCopied] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const billingPeriodDate = realMetrics?.cycleStartDate || todayIso;

  const hasRealMtd =
    !isDemoData &&
    realMetrics?.monthToDateKwh !== null &&
    realMetrics?.monthToDateKwh !== undefined;

  const hasAnyUnits = isDemoData || hasRealMtd;
  const unitsThisMonth = isDemoData
    ? demoUnitsThisMonth
    : (realMetrics?.monthToDateKwh ?? 0);

  const daysPassed = isDemoData
    ? demoDaysPassed
    : Math.max(1, realMetrics?.cycleDaysElapsed ?? new Date().getDate());

  const totalDays = isDemoData
    ? demoTotalDays
    : Math.max(daysPassed, realMetrics?.cycleTotalDays ?? 30);

  const analysis: SlabThresholdAnalysis = useMemo(
    () =>
      TariffCalculator.analyzeSlabThreshold(
        unitsThisMonth,
        daysPassed,
        totalDays,
        household.sanctionedLoadKw || 3.0,
        undefined,
        billingPeriodDate
      ),
    [unitsThisMonth, daysPassed, totalDays, household.sanctionedLoadKw, billingPeriodDate]
  );

  const comparison: MonthlyComparisonSummary = useMemo(() => {
    const lastKwh = isDemoData
      ? demoUnitsLastMonth
      : (realMetrics?.previousCycle?.kwhUsed ?? null);

    const prevDateObj = new Date(billingPeriodDate + 'T00:00:00Z');
    prevDateObj.setUTCMonth(prevDateObj.getUTCMonth() - 1);
    const prevBillingPeriod =
      realMetrics?.previousCycle?.cycleStartDate ||
      prevDateObj.toISOString().slice(0, 10);

    return TariffCalculator.compareBillingMonths({
      thisMonthKwh: unitsThisMonth,
      lastMonthKwh: lastKwh,
      sanctionedLoadKw: household.sanctionedLoadKw || 3.0,
      thisBillingPeriod: billingPeriodDate,
      lastBillingPeriod: prevBillingPeriod,
    });
  }, [
    isDemoData,
    demoUnitsLastMonth,
    realMetrics?.previousCycle?.kwhUsed,
    realMetrics?.previousCycle?.cycleStartDate,
    unitsThisMonth,
    household.sanctionedLoadKw,
    billingPeriodDate,
  ]);

  const visibleAlerts = useMemo(
    () =>
      analysis.slabAlerts.filter(
        (al) => !dismissedAlerts.includes(`${al.level}:${al.thresholdKwh}`)
      ),
    [analysis.slabAlerts, dismissedAlerts]
  );

  // Build deterministic WhatsApp / SMS share text (no LLM, no server-side send)
  const shareText = useMemo(() => {
    if (!hasAnyUnits) {
      return shareLang === 'bn'
        ? `KilowattIQ (${household.name}): প্রকৃত মিটার রিডিং যোগ করে চলতি মাসের BERC স্ল্যাব পূর্বাভাস দেখুন।`
        : `KilowattIQ (${household.name}): Add 2+ meter readings to calculate this month's BERC slab prediction and projected bill.`;
    }

    const paceDaysTextEn =
      analysis.thresholdKwh === null
        ? 'No upper limit (top tier)'
        : analysis.daysUntilBreach !== null
          ? `${analysis.daysUntilBreach} days left at current pace (${analysis.burnRateKwhPerDay} kWh/day)`
          : '0 kWh/day pace';

    const paceDaysTextBn =
      analysis.thresholdKwh === null
        ? 'সর্বোচ্চ ধাপে আছেন'
        : analysis.daysUntilBreach !== null
          ? `বর্তমান হারে (${toBengaliNumerals(analysis.burnRateKwhPerDay)} kWh/দিন) আর ${toBengaliNumerals(analysis.daysUntilBreach)} দিন বাকি`
          : 'বর্তমান হার ০ kWh/দিন';

    const capTextEn =
      analysis.thresholdKwh !== null
        ? `${analysis.maxDailyKwhToStayInSlab} kWh/day max to stay in ${analysis.currentSlabName}${
            analysis.avoidableMonthlySurchargeBDT > 0
              ? ` (avoids ~৳${Math.round(analysis.avoidableMonthlySurchargeBDT)} extra cost)`
              : ''
          }`
        : 'Top tier active';

    const capTextBn =
      analysis.thresholdKwh !== null
        ? `${analysis.currentSlabName}-এ থাকতে দৈনিক সর্বোচ্চ ${toBengaliNumerals(analysis.maxDailyKwhToStayInSlab)} kWh${
            analysis.avoidableMonthlySurchargeBDT > 0
              ? ` (বাঁচবে ~৳${toBengaliNumerals(Math.round(analysis.avoidableMonthlySurchargeBDT))})`
              : ''
          }`
        : 'সর্বোচ্চ ধাপ সক্রিয়';

    if (shareLang === 'bn') {
      return [
        `⚡ KilowattIQ স্ল্যাব পূর্বাভাস — ${household.name}${isDemoData ? ' (ডেমো)' : ''}`,
        `• বর্তমান স্ল্যাব: ${analysis.currentSlabName} (৳${toBengaliNumerals(analysis.currentRateBDT.toFixed(2))}/ইউনিট)`,
        `• চলতি মাসে ব্যবহার: ${toBengaliNumerals(analysis.unitsUsedThisMonth)} kWh`,
        `• পরবর্তী স্ল্যাবের আগে বাকি: ${analysis.thresholdKwh !== null ? `${toBengaliNumerals(analysis.kwhRemainingToBreach)} kWh` : 'সীমা নেই'}`,
        `• সময় বাকি: ${paceDaysTextBn}`,
        `• দৈনিক সীমা: ${capTextBn}`,
        `• মাস শেষে সম্ভাব্য বিল: ৳${toBengaliNumerals(Math.round(analysis.projectedBillBDT))} (${toBengaliNumerals(analysis.projectedMonthEndKwh)} kWh)`,
      ].join('\n');
    }

    return [
      `⚡ KilowattIQ Slab Prediction — ${household.name}${isDemoData ? ' (Demo)' : ''}`,
      `• Current slab: ${analysis.currentSlabName} (৳${analysis.currentRateBDT.toFixed(2)}/kWh)`,
      `• Used this month: ${analysis.unitsUsedThisMonth} kWh (Day ${analysis.daysPassed}/${analysis.totalDaysInCycle})`,
      `• Left before next slab: ${analysis.thresholdKwh !== null ? `${analysis.kwhRemainingToBreach} kWh` : 'Top tier'}`,
      `• Pace forecast: ${paceDaysTextEn}`,
      `• Daily cap: ${capTextEn}`,
      `• Projected bill: ৳${Math.round(analysis.projectedBillBDT)} (~${analysis.projectedMonthEndKwh} kWh)`,
    ].join('\n');
  }, [hasAnyUnits, shareLang, household.name, isDemoData, analysis]);

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const smsHref = `sms:?body=${encodeURIComponent(shareText)}`;

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard?.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked in some embedded contexts
    }
  };

  const progressWidthPct = Math.min(100, Math.max(0, analysis.slabUtilizationPercent));
  const isAmberState =
    hasAnyUnits &&
    (analysis.projectedBreachOccurs ||
      analysis.slabUtilizationPercent >= 80 ||
      analysis.slabAlerts.length > 0);

  return (
    <section
      aria-label={language === 'bn' ? 'বিইআরসি স্ল্যাব পূর্বাভাস হিরো কার্ড' : 'BERC Slab Prediction Overview'}
      className={`rounded-2xl border p-5 shadow-xs space-y-5 transition-colors font-['Plus_Jakarta_Sans'] ${
        isAmberState
          ? 'bg-gradient-to-br from-white via-amber-50/40 to-white dark:from-slate-900 dark:via-amber-950/15 dark:to-slate-950 border-amber-400/50'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header Row + Share Summary CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isAmberState
                ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400 border border-amber-400/40'
                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}
          >
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-['Outfit']">
                {language === 'bn' ? 'স্ল্যাব পূর্বাভাস ও বিল নিয়ন্ত্রণ' : 'Slab Prediction & Bill Guard'}
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono uppercase tracking-wider border ${
                  isAmberState
                    ? 'bg-amber-400/15 border-amber-400/50 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {!hasAnyUnits
                  ? language === 'bn'
                    ? 'রিডিং প্রয়োজন'
                    : 'NEEDS READINGS'
                  : analysis.projectedBreachOccurs
                    ? language === 'bn'
                      ? 'স্ল্যাব বৃদ্ধির ঝুঁকি'
                      : 'SLAB JUMP WATCH'
                    : language === 'bn'
                      ? 'নিরাপদ গতি'
                      : 'ON SAFE PACE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              {household.utilityProvider} • {analysis.tariffVersionId} •{' '}
              {analysis.lastVerifiedDate
                ? `${language === 'bn' ? 'যাচাই:' : 'Verified:'} ${analysis.lastVerifiedDate}`
                : language === 'bn'
                  ? 'Not verified (যাচাইকৃত নয়)'
                  : 'Not verified'}{' '}
              • {language === 'bn' ? `দিন ${formatNumber(daysPassed)}/${formatNumber(totalDays)}` : `Day ${daysPassed}/${totalDays}`}
              {isDemoData ? (language === 'bn' ? ' • ডেমো ডেটা' : ' • Demo baseline') : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setShareLang(language);
            setShareOpen((prev) => !prev);
          }}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <Share2 className="w-4 h-4" />
          <span>{language === 'bn' ? 'সারাংশ শেয়ার করুন' : 'Share summary'}</span>
        </button>
      </div>

      {/* Share Summary Drawer (Client-side wa.me / sms: links only) */}
      {shareOpen && (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/25 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
              {language === 'bn'
                ? 'হোয়াটসঅ্যাপ বা এসএমএসে পাঠানোর জন্য প্রস্তুত বার্তা'
                : 'Ready-to-Send WhatsApp / SMS Summary'}
            </span>
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShareLang('en')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-['Outfit'] font-semibold cursor-pointer ${
                  shareLang === 'en'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setShareLang('bn')}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-['Outfit'] font-semibold cursor-pointer ${
                  shareLang === 'bn'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>

          <pre className="whitespace-pre-wrap text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-slate-800 dark:text-slate-200 leading-relaxed">
            {shareText}
          </pre>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-['Outfit'] font-semibold text-xs inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{language === 'bn' ? 'হোয়াটসঅ্যাপে খুলুন' : 'Open in WhatsApp'}</span>
            </a>

            <a
              href={smsHref}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-['Outfit'] font-semibold text-xs inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{language === 'bn' ? 'এসএমএস অ্যাপে খুলুন' : 'Send via SMS'}</span>
            </a>

            <button
              type="button"
              onClick={handleCopySummary}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-['Outfit'] font-semibold text-xs inline-flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              <span>
                {copied
                  ? language === 'bn'
                    ? 'কপি হয়েছে'
                    : 'Copied'
                  : language === 'bn'
                    ? 'টেক্সট কপি করুন'
                    : 'Copy text'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Real Mode Empty Reading Guard */}
      {!hasAnyUnits ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-50/70 dark:bg-amber-950/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
              {language === 'bn'
                ? 'স্ল্যাব পূর্বাভাস দেখতে অন্তত ২টি মিটার রিডিং দিন'
                : 'Log 2+ Meter Readings to Unlock Your Live Slab Prediction'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {language === 'bn'
                ? 'আপনার প্রকৃত মিটার রিডিং থেকে বর্তমান স্ল্যাব, অবশিষ্ট ইউনিট, দৈনিক সীমা এবং মাস শেষে সম্ভাব্য বিল হিসাব করা হবে।'
                : 'Your current BERC slab, remaining buffer, daily kWh cap, and projected month-end bill will calculate deterministically from your real readings.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onQuickAddReading && (
              <button
                type="button"
                onClick={onQuickAddReading}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'bn' ? 'রিডিং যোগ' : 'Add reading'}</span>
              </button>
            )}
            {onQuickScanMeter && (
              <button
                type="button"
                onClick={onQuickScanMeter}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-['Outfit'] font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-amber-500" />
                <span>{language === 'bn' ? 'মিটার স্ক্যান' : 'Scan meter'}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 1. HERO 5-METRIC GRID: Current slab, Units used, Units left, Days left at pace, Projected bill */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* 1. Current Slab */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
                {language === 'bn' ? 'বর্তমান স্ল্যাব' : 'Current Slab'}
              </span>
              <div className="my-1.5">
                <div className="text-base font-extrabold text-slate-900 dark:text-white font-['Outfit'] leading-snug">
                  {analysis.currentSlabName}
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold">
                {formatCurrency(analysis.currentRateBDT, { showDecimals: true })}/kWh
              </div>
            </div>

            {/* 2. Units Used This Month */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
                {language === 'bn' ? 'এই মাসে ব্যবহৃত' : 'Used This Month'}
              </span>
              <div className="my-1.5">
                <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums">
                  {formatNumber(analysis.unitsUsedThisMonth.toFixed(1))}
                </span>{' '}
                <span className="text-xs font-semibold text-slate-500 font-mono">kWh</span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {language === 'bn'
                  ? `দৈনিক গড় ${formatNumber(analysis.burnRateKwhPerDay.toFixed(1))} kWh/দিন`
                  : `Pace: ${analysis.burnRateKwhPerDay.toFixed(1)} kWh/day`}
              </div>
            </div>

            {/* 3. Units Left Before Next Slab */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
                {language === 'bn' ? 'পরবর্তী স্ল্যাবের বাকি' : 'Left Before Next Slab'}
              </span>
              <div className="my-1.5">
                <span
                  className={`text-2xl font-black font-mono tabular-nums ${
                    analysis.thresholdKwh !== null && analysis.slabUtilizationPercent >= 80
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {analysis.thresholdKwh !== null
                    ? formatNumber(analysis.kwhRemainingToBreach.toFixed(1))
                    : '—'}
                </span>{' '}
                {analysis.thresholdKwh !== null && (
                  <span className="text-xs font-semibold text-slate-500 font-mono">kWh</span>
                )}
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {analysis.thresholdKwh !== null && analysis.nextSlabName
                  ? language === 'bn'
                    ? `সীমা ${formatNumber(analysis.thresholdKwh)} kWh (${formatNumber(analysis.slabUtilizationPercent)}%)`
                    : `Cap ${analysis.thresholdKwh} kWh (${analysis.slabUtilizationPercent}%)`
                  : language === 'bn'
                    ? 'সর্বোচ্চ ধাপে আছেন'
                    : 'Top slab active'}
              </div>
            </div>

            {/* 4. Days Left at Current Pace */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit'] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>{language === 'bn' ? 'বর্তমান হারে বাকি দিন' : 'Days Left at Pace'}</span>
              </span>
              <div className="my-1.5">
                <span
                  className={`text-2xl font-black font-mono tabular-nums ${
                    analysis.daysUntilBreach !== null && analysis.projectedBreachOccurs
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {analysis.thresholdKwh === null
                    ? '—'
                    : analysis.daysUntilBreach !== null
                      ? formatNumber(analysis.daysUntilBreach.toFixed(1))
                      : '—'}
                </span>{' '}
                {analysis.thresholdKwh !== null && analysis.daysUntilBreach !== null && (
                  <span className="text-xs font-semibold text-slate-500 font-['Outfit']">
                    {language === 'bn' ? 'দিন' : 'days'}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {analysis.thresholdKwh === null
                  ? language === 'bn'
                    ? 'কোনো উচ্চ সীমা নেই'
                    : 'No ceiling above 600+'
                  : analysis.projectedBreachOccurs
                    ? language === 'bn'
                      ? `চক্রের আরও ${formatNumber(analysis.daysLeftInCycle)} দিন বাকি`
                      : `${analysis.daysLeftInCycle}d left in billing cycle`
                    : language === 'bn'
                      ? 'বিলিং দিন পর্যন্ত নিরাপদ'
                      : 'Safe through billing day'}
              </div>
            </div>

            {/* 5. Projected Bill */}
            <div className="rounded-xl bg-amber-400/10 dark:bg-amber-950/30 border border-amber-400/40 p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 font-['Outfit'] flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                <span>{language === 'bn' ? 'সম্ভাব্য মাসিক বিল' : 'Projected Bill'}</span>
              </span>
              <div className="my-1.5">
                <span className="text-2xl font-black text-amber-700 dark:text-amber-300 font-mono tabular-nums">
                  {formatCurrency(analysis.projectedBillBDT)}
                </span>
              </div>
              <div className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {language === 'bn'
                  ? `~${formatNumber(analysis.projectedMonthEndKwh)} kWh সম্ভাব্য (বর্তমান: ${formatCurrency(analysis.currentBillBDT)})`
                  : `~${analysis.projectedMonthEndKwh} kWh est. (Now: ${formatCurrency(analysis.currentBillBDT)})`}
              </div>
            </div>
          </div>

          {/* Slab Progress Bar toward 80% / 100% Cap */}
          {analysis.thresholdKwh !== null && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>
                  {language === 'bn'
                    ? `${analysis.currentSlabName} ব্যবহারের অগ্রগতি`
                    : `${analysis.currentSlabName} Ceiling Progress`}
                </span>
                <span>
                  {formatNumber(analysis.unitsUsedThisMonth.toFixed(1))} / {formatNumber(analysis.thresholdKwh)} kWh (
                  {formatNumber(analysis.slabUtilizationPercent)}%)
                </span>
              </div>
              <div className="relative w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isAmberState ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progressWidthPct}%` }}
                />
                {/* 80% threshold marker */}
                <div
                  aria-hidden="true"
                  title="80% Slab Alert Threshold"
                  className="absolute top-0 bottom-0 w-0.5 bg-slate-700/60 dark:bg-slate-200/70"
                  style={{ left: '80%' }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500">
                <span>0%</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {language === 'bn' ? '৮০% সতর্কতা সীমা' : '80% alert line'}
                </span>
                <span>
                  100% ({formatNumber(analysis.thresholdKwh)} kWh)
                </span>
              </div>
            </div>
          )}

          {/* 3. IN-APP 80% AND 100% SLAB LIMIT ALERTS (Calm Amber Only, Never Red) */}
          {visibleAlerts.length > 0 && (
            <div className="space-y-2.5" role="region" aria-label="In-app slab threshold alerts">
              {visibleAlerts.map((alert) => {
                const key = `${alert.level}:${alert.thresholdKwh}`;
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-amber-400/60 bg-amber-50 dark:bg-amber-950/35 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-400/30 text-amber-900 dark:text-amber-200 uppercase">
                            {alert.level === '100_PERCENT'
                              ? language === 'bn'
                                ? '১০০% স্ল্যাব সীমা'
                                : '100% SLAB LIMIT'
                              : language === 'bn'
                                ? '৮০% স্ল্যাব সতর্কতা'
                                : '80% SLAB ALERT'}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-amber-100 font-['Outfit']">
                            {language === 'bn' ? alert.titleBn : alert.titleEn}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-amber-200/90">
                          {language === 'bn' ? alert.messageBn : alert.messageEn}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDismissedAlerts((prev) => [...prev, key])}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/80 hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-xs font-['Outfit'] font-semibold cursor-pointer self-end sm:self-center shrink-0"
                    >
                      {language === 'bn' ? 'বুঝেছি' : 'Acknowledge'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. DAILY CAP SUGGESTION & AVOIDABLE EXTRA COST + 5. MONTHLY "WHAT CHANGED" SUMMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Cap Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-['Outfit'] flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-amber-500" />
                  <span>{language === 'bn' ? 'দৈনিক ব্যবহারের সীমা (Daily Cap)' : 'Daily Cap Suggestion'}</span>
                </span>
                {analysis.nextRateBDT && (
                  <span className="text-[11px] font-mono tabular-nums text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    {language === 'bn'
                      ? `পরের ধাপ +${formatNumber(analysis.rateJumpPercentage)}%`
                      : `Next tier +${analysis.rateJumpPercentage}%`}
                  </span>
                )}
              </div>

              {analysis.thresholdKwh !== null ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <span className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatNumber(analysis.maxDailyKwhToStayInSlab.toFixed(1))} kWh/day
                      </span>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {language === 'bn'
                          ? `বিলিং দিন পর্যন্ত (আর ${formatNumber(analysis.daysLeftInCycle)} দিন) ${analysis.currentSlabName}-এ থাকতে দৈনিক সর্বোচ্চ ব্যবহার।`
                          : `Max daily use to stay within ${analysis.currentSlabName} (≤ ${analysis.thresholdKwh} kWh) over the remaining ${analysis.daysLeftInCycle} days.`}
                      </p>
                    </div>

                    <div className="text-left sm:text-right bg-amber-400/15 border border-amber-400/40 rounded-xl px-3 py-2">
                      <span className="text-[10px] font-bold uppercase text-amber-900 dark:text-amber-300 block font-['Outfit']">
                        {language === 'bn' ? 'অতিরিক্ত এড়ানো যাবে' : 'Avoidable Extra Cost'}
                      </span>
                      <span className="text-lg font-black font-mono tabular-nums text-amber-700 dark:text-amber-300">
                        {formatCurrency(analysis.avoidableMonthlySurchargeBDT)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {analysis.avoidableMonthlySurchargeBDT > 0
                      ? language === 'bn'
                        ? `বর্তমান গতিতে (${formatNumber(analysis.burnRateKwhPerDay.toFixed(1))} kWh/দিন) চললে আপনি স্ল্যাব অতিক্রম করবেন; দৈনিক সীমা মেনে চললে ${analysis.tariffVersionId} অনুযায়ী ~${formatCurrency(analysis.avoidableMonthlySurchargeBDT)} বাঁচবে।`
                        : `At your current ${analysis.burnRateKwhPerDay.toFixed(1)} kWh/day pace, staying under ${analysis.maxDailyKwhToStayInSlab.toFixed(1)} kWh/day avoids ${formatCurrency(analysis.avoidableMonthlySurchargeBDT)} under ${analysis.tariffVersionId}.`
                      : analysis.nextRateBDT
                        ? language === 'bn'
                          ? `বর্তমান গতি নিরাপদ। তবে দৈনিক সীমা ছাড়ালে পরবর্তী ইউনিটে ৳${toBengaliNumerals((analysis.nextRateBDT - analysis.currentRateBDT).toFixed(2))}/kWh বেশি লাগবে।`
                          : `Your current pace stays inside the cap. Exceeding it raises marginal energy cost by +৳${(analysis.nextRateBDT - analysis.currentRateBDT).toFixed(2)}/kWh (${analysis.nextSlabName}).`
                        : null}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    {language === 'bn'
                      ? 'আপনি সর্বোচ্চ স্ল্যাবে (৬০০+ kWh @ ৳১৭.৩৫) পৌঁছেছেন। প্রতি ১ kWh কমালে সরাসরি ভ্যাটসহ ~৳১৮.২২ সাশ্রয় হবে।'
                      : 'You are in the top BERC slab (600+ kWh). Every 1 kWh trimmed directly saves the top marginal rate plus 5% VAT.'}
                  </span>
                </div>
              )}
            </div>

            {/* Monthly "What Changed" Summary Card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white font-['Outfit'] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span>{language === 'bn' ? 'গত মাসের তুলনায় কী বদলেছে' : 'What Changed vs Last Month'}</span>
                </span>
                {comparison.hasComparison && comparison.billDeltaBDT !== null && (
                  <span
                    className={`text-xs font-mono tabular-nums font-bold px-2 py-0.5 rounded border ${
                      comparison.billDeltaBDT > 1
                        ? 'bg-amber-400/15 border-amber-400/40 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {comparison.billDeltaBDT >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(comparison.billDeltaBDT))}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                {language === 'bn' ? comparison.summaryBn : comparison.summaryEn}
              </p>

              {comparison.hasComparison && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'গত মাস:' : 'Last month:'}{' '}
                    {formatNumber((comparison.lastMonthKwh ?? 0).toFixed(1))} kWh (
                    {formatCurrency(comparison.lastMonthBillBDT ?? 0)})
                  </span>
                  <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'এই মাস:' : 'This month:'}{' '}
                    {formatNumber(comparison.thisMonthKwh.toFixed(1))} kWh (
                    {formatCurrency(comparison.thisMonthBillBDT)})
                  </span>
                  {comparison.drivers.map((drv) => (
                    <span
                      key={drv.key}
                      className="text-[11px] px-2 py-0.5 rounded bg-amber-400/15 border border-amber-400/30 text-amber-900 dark:text-amber-200"
                    >
                      {language === 'bn' ? drv.labelBn : drv.labelEn}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
