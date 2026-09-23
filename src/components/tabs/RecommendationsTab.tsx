import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, CheckCircle2, TrendingDown, Sparkles, Filter, Check, Cpu, RefreshCw, AlertTriangle, Globe, Zap, FileText } from 'lucide-react';
import { RecommendationItem, AiAdvisorResult } from '../../../shared/types/energy';
import { Household } from '../../../shared/types/household';

interface RecommendationsTabProps {
  household?: Household;
  token?: string | null;
  recommendations: RecommendationItem[];
  onResolve?: (id: string) => void;
}

export const RecommendationsTab: React.FC<RecommendationsTabProps> = ({
  household,
  token,
  recommendations,
  onResolve,
}) => {
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  // AI Advisor State
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAdvisorResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleResolveAction = (id: string) => {
    setResolvedIds(prev => new Set(prev).add(id));
    if (onResolve) onResolve(id);
  };

  const handleRunAiAdvisor = async (targetLang?: 'en' | 'bn') => {
    const selectedLang = targetLang || language;
    setIsAnalyzing(true);
    setAiError(null);

    try {
      const res = await fetch('/api/v1/recommendations/ai-advisor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          householdId: household?.id || '11111111-1111-4111-a111-111111111111',
          language: selectedLang,
        }),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setAiResult(json.data);
      } else {
        setAiError(json.message || 'Failed to generate AI advisory');
      }
    } catch (err: any) {
      setAiError(err.message || 'Network communication error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredRecs = recommendations.filter(r => {
    if (filterPriority === 'ALL') return true;
    return r.priority === filterPriority;
  });

  const totalPotentialMonthlySavingsBDT = recommendations.reduce(
    (acc, r) => acc + r.estimatedMonthlySavingsBDT,
    0
  );

  const activeSavingsBDT = recommendations
    .filter(r => !resolvedIds.has(r.id) && r.status !== 'resolved')
    .reduce((acc, r) => acc + r.estimatedMonthlySavingsBDT, 0);

  const resolvedSavingsBDT = totalPotentialMonthlySavingsBDT - activeSavingsBDT;

  return (
    <div className="space-y-6">

      {/* AI Energy Advisor Section */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {language === 'bn' ? 'এআই এনার্জি অ্যাডভাইজর' : 'SERVER-SIDE AI ENERGY ADVISOR'}
                </h3>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                  Gemini 2.0 Flash
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {language === 'bn'
                  ? 'কিলোভোল্টআইকিউ এর নির্ভরযোগ্য গণনা দ্বারা পরিচালিত স্মার্ট এনার্জি ব্যাখ্যা'
                  : 'Natural-language explanations grounded strictly on KilowattIQ deterministic calculation engine'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {/* Language Selector Toggle */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
              <Globe className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
              <button
                onClick={() => {
                  setLanguage('en');
                  if (aiResult) handleRunAiAdvisor('en');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                English
              </button>
              <button
                onClick={() => {
                  setLanguage('bn');
                  if (aiResult) handleRunAiAdvisor('bn');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  language === 'bn'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                বাংলা
              </button>
            </div>

            {/* Analyze Button */}
            <button
              onClick={() => handleRunAiAdvisor()}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{language === 'bn' ? 'বিশ্লেষণ করা হচ্ছে...' : 'Analyzing Energy...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                  <span>{language === 'bn' ? 'এনার্জি অ্যানালাইসিস করুন' : 'Analyze My Energy'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* AI Output / States */}
        <AnimatePresence mode="wait">
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-6 bg-slate-950/80 border border-slate-800 rounded-xl text-center space-y-3"
            >
              <div className="flex justify-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
              <p className="text-xs font-bold text-slate-200">
                {language === 'bn'
                  ? 'আপনার গৃহস্থালি লোড ও ডেসকো ট্যারিফ স্ল্যাব বিশ্লেষণ করা হচ্ছে...'
                  : 'Evaluating household telemetry, DESCO tariff slabs & budget thresholds...'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                Running deterministic engine checks → Requesting Gemini advisory layer
              </p>
            </motion.div>
          )}

          {!isAnalyzing && aiError && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-start gap-3 text-rose-300 text-xs"
            >
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">
                  {language === 'bn' ? 'এআই অ্যাডভাইজর সাময়িক সমস্যা' : 'AI Advisor Communication Error'}
                </span>
                <span>{aiError}</span>
              </div>
            </motion.div>
          )}

          {!isAnalyzing && aiResult && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Fallback Warning Notice if Gemini Unavailable */}
              {!aiResult.available && (
                <div className="p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-start gap-2.5 text-amber-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">
                      {language === 'bn' ? 'ডিটারমিনেস্টিক ফলব্যাক মোড সক্রিয়' : 'AI Advisor Fallback Mode Active'}
                    </span>
                    <span>
                      {aiResult.fallbackReason ||
                        'AI advisor is temporarily unavailable. Deterministic rule calculations remain fully operational.'}
                    </span>
                  </div>
                </div>
              )}

              {/* AI Advice Output */}
              {aiResult.aiAdvice && (
                <div className="space-y-4">
                  {/* Executive Summary Card */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'সামারি রিপোর্ট' : 'Executive Energy Summary'}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-medium">
                      {aiResult.aiAdvice.summary}
                    </p>
                  </div>

                  {/* Priority Actions */}
                  {aiResult.aiAdvice.priorityActions && aiResult.aiAdvice.priorityActions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>{language === 'bn' ? 'প্রধান প্রয়োজনীয় পদক্ষেপসমূহ' : 'Priority Action Items'}</span>
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {aiResult.aiAdvice.priorityActions.map((act, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5 flex flex-col justify-between"
                          >
                            <div className="space-y-1">
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase font-mono tracking-wider inline-block ${
                                  act.impact === 'high'
                                    ? 'bg-rose-950 text-rose-400 border-rose-900'
                                    : act.impact === 'medium'
                                    ? 'bg-amber-950 text-amber-400 border-amber-900'
                                    : 'bg-emerald-950 text-emerald-400 border-emerald-900'
                                }`}
                              >
                                {act.impact} IMPACT
                              </span>
                              <h5 className="text-xs font-bold text-white leading-snug">{act.title}</h5>
                            </div>
                            <p className="text-[11px] text-slate-300">{act.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed Explanation */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? 'বিস্তারিত তথ্য ও কারণসমূহ' : 'Detailed Tariff & Energy Breakdown'}</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {aiResult.aiAdvice.explanation}
                    </p>
                  </div>
                </div>
              )}

              {/* Data Transparency & Source Verification Bar */}
              {aiResult.sourceMetrics && (
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-2">
                  <div className="flex items-center justify-between text-slate-400 font-bold border-b border-slate-800/60 pb-1.5">
                    <span className="flex items-center gap-1 text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {language === 'bn' ? 'কিলোভোল্টআইকিউ ডিটারমিনেস্টিক ইনপুট ডাটা' : 'Grounded Backend Engine Metrics (Source of Truth)'}
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Verified Calculations
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[10px] font-mono pt-1">
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Current Load</span>
                      <span className="text-white font-bold">{aiResult.sourceMetrics.currentLoadW} W</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Projected Bill</span>
                      <span className="text-emerald-400 font-bold">৳{aiResult.sourceMetrics.projectedBillBDT}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Monthly Budget</span>
                      <span className="text-amber-400 font-bold">৳{aiResult.sourceMetrics.monthlyBudgetBDT}</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Vampire Power Waste</span>
                      <span className="text-rose-400 font-bold">৳{aiResult.sourceMetrics.vampireWasteBDT}/mo</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Sanctioned Load</span>
                      <span className="text-slate-200 font-bold">{aiResult.sourceMetrics.sanctionedLoadKw} kW</span>
                    </div>
                    <div className="bg-slate-900/80 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 block">Tariff Step</span>
                      <span className="text-slate-300 font-bold truncate">{aiResult.sourceMetrics.tariffSlabName}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {!isAnalyzing && !aiResult && !aiError && (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 text-center text-xs text-slate-400">
              <p>
                {language === 'bn'
                  ? 'আপনার লাইভ কস্টিং ও লোড প্রোফাইলের ওপর ভিত্তি করে এআই অ্যাডভাইজরি পেতে "এনার্জি অ্যানালাইসিস করুন" বাটনে ক্লিক করুন।'
                  : 'Click "Analyze My Energy" above to generate a real-time Gemini AI explanation based on your active household telemetry and DESCO tariff structure.'}
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Potential Savings Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-4.5 h-4.5 text-amber-400" />
            <span>Deterministic Rule Diagnostics</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Localized rule checks to prevent stepping into higher cost DESCO LT-A slabs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-slate-200 flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Unlocked Monthly Savings</span>
              <span className="text-base font-black font-mono text-emerald-400">৳{resolvedSavingsBDT} / Month</span>
            </div>
          </div>

          <div className="bg-emerald-950/80 border border-emerald-800/80 rounded-xl px-3.5 py-2 text-emerald-300 flex items-center gap-3">
            <TrendingDown className="w-4.5 h-4.5 text-emerald-400" />
            <div>
              <span className="text-[9px] text-emerald-400 font-bold block uppercase tracking-wider">Potential Total Savings</span>
              <span className="text-base font-black font-mono">৳{totalPotentialMonthlySavingsBDT} / Month</span>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Filter Bar */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <Filter className="w-3.5 h-3.5 text-emerald-400" />
          <span>Filter Diagnostics:</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1 rounded-lg font-bold font-mono text-[11px] transition-all cursor-pointer ${
                filterPriority === p
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredRecs.map((rec) => {
          const isResolved = resolvedIds.has(rec.id) || rec.status === 'resolved';

          return (
            <motion.div
              layout
              key={rec.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`border rounded-2xl p-5 shadow-sm space-y-3 flex flex-col justify-between transition-all ${
                isResolved
                  ? 'bg-slate-950/50 border-emerald-500/30 opacity-75'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase font-mono tracking-wider ${
                    rec.priority === 'HIGH'
                      ? 'bg-rose-950 text-rose-400 border-rose-900'
                      : rec.priority === 'MEDIUM'
                      ? 'bg-amber-950 text-amber-400 border-amber-900'
                      : 'bg-emerald-950 text-emerald-400 border-emerald-900'
                  }`}>
                    {rec.priority} PRIORITY
                  </span>

                  <span className="text-xs font-bold font-mono text-emerald-400">
                    Save ~৳{rec.estimatedMonthlySavingsBDT} / mo
                  </span>
                </div>

                <h4 className="text-xs font-bold text-white leading-snug">{rec.title}</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">{rec.description}</p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <div className="text-[10px] text-slate-400">
                  <span className="text-emerald-400 font-bold block flex items-center gap-1 uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> Actionable Step
                  </span>
                  <span className="text-slate-300 font-medium">{rec.actionableStep}</span>
                </div>

                <button
                  onClick={() => handleResolveAction(rec.id)}
                  disabled={isResolved}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isResolved
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md'
                  }`}
                >
                  {isResolved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Resolved</span>
                    </>
                  ) : (
                    <span>Apply Rule</span>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
};

