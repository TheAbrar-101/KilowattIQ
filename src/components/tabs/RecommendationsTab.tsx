import React from 'react';
import { Lightbulb, CheckCircle2, TrendingDown, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { RecommendationItem } from '../../../shared/types/energy';

interface RecommendationsTabProps {
  recommendations: RecommendationItem[];
}

export const RecommendationsTab: React.FC<RecommendationsTabProps> = ({ recommendations }) => {
  const totalPotentialMonthlySavingsBDT = recommendations.reduce(
    (acc, r) => acc + r.estimatedMonthlySavingsBDT,
    0
  );

  return (
    <div className="space-y-4">
      
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <span>AI Energy Saving Diagnostic Engine</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Localized recommendations to prevent stepping into higher cost DESCO slabs
          </p>
        </div>

        <div className="bg-emerald-950/80 border border-emerald-800/80 rounded-xl px-3.5 py-2 text-emerald-300 flex items-center gap-2.5">
          <TrendingDown className="w-5 h-5 text-emerald-400" />
          <div>
            <span className="text-[9px] text-emerald-400 font-bold block uppercase tracking-wider">Potential Total Monthly Savings</span>
            <span className="text-lg font-black font-mono">৳{totalPotentialMonthlySavingsBDT} / Month</span>
          </div>
        </div>
      </div>

      {/* Recommendations Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2.5 flex flex-col justify-between hover:border-slate-700 transition-all"
          >
            <div className="space-y-1.5">
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

            <div className="pt-2 border-t border-slate-800 bg-slate-950/80 -mx-4 -mb-4 p-3 rounded-b-2xl text-xs space-y-0.5">
              <span className="text-[9px] text-emerald-400 font-bold uppercase flex items-center gap-1 tracking-wider">
                <CheckCircle2 className="w-3 h-3" />
                <span>Actionable Step</span>
              </span>
              <p className="text-slate-300 text-[11px] font-medium">{rec.actionableStep}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};
