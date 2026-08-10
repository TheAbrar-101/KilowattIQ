import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, CheckCircle2, TrendingDown, ShieldAlert, ArrowUpRight, Sparkles, Filter, Check } from 'lucide-react';
import { RecommendationItem } from '../../../shared/types/energy';

interface RecommendationsTabProps {
  recommendations: RecommendationItem[];
  onResolve?: (id: string) => void;
}

export const RecommendationsTab: React.FC<RecommendationsTabProps> = ({
  recommendations,
  onResolve,
}) => {
  const [filterPriority, setFilterPriority] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const handleResolveAction = (id: string) => {
    setResolvedIds(prev => new Set(prev).add(id));
    if (onResolve) onResolve(id);
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
    <div className="space-y-5">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-4.5 h-4.5 text-amber-400" />
            <span>AI Energy Saving Diagnostic Engine</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Localized recommendations to prevent stepping into higher cost DESCO LT-A slabs
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
