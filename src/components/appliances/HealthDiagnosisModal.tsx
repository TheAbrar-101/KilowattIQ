import React from 'react';
import { motion } from 'motion/react';
import {
  X,
  Activity,
  AlertTriangle,
  ArrowRight,
  Zap,
  Gauge,
  Clock,
  RotateCcw,
  ShieldCheck,
  Wrench,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { ApplianceHealthReport } from '../../server/health/types';
import { HealthRing } from './HealthRing';

interface HealthDiagnosisModalProps {
  report: ApplianceHealthReport;
  onClose: () => void;
  onOpenRoi: (report: ApplianceHealthReport) => void;
}

export const HealthDiagnosisModal: React.FC<HealthDiagnosisModalProps> = ({
  report,
  onClose,
  onOpenRoi,
}) => {
  const { healthScore, status, recommendation, recommendationBn, signals, findings } = report;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl relative overflow-hidden text-slate-200"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-5 pb-4 border-b border-slate-800">
          <HealthRing score={healthScore} size={54} strokeWidth={4.5} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold font-display text-white">
                {report.applianceName}
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase border ${
                  status === 'HEALTHY'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : status === 'NEEDS_SERVICE'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                {status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Power signature telemetry diagnostic report ({healthScore}/100)
            </p>
          </div>
        </div>

        {/* Primary Alert Banner */}
        <div
          className={`p-3.5 rounded-xl border mb-5 text-xs font-sans flex items-start gap-3 ${
            healthScore < 40
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              : healthScore < 70
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          }`}
        >
          {healthScore < 40 ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : healthScore < 70 ? (
            <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}

          <div className="flex-1">
            <div className="font-bold text-sm text-white">{recommendation}</div>
            <div className="text-[11px] text-slate-300 mt-0.5">বাংলা: {recommendationBn}</div>
            {report.estimatedMonthlyWasteBDT > 0 && (
              <div className="mt-1.5 text-[11px] font-mono text-amber-400">
                Estimated electrical waste: ~৳{report.estimatedMonthlyWasteBDT}/month from degradation
              </div>
            )}
          </div>
        </div>

        {/* The 4 Monitored Electrical Signature Signals */}
        <div className="mb-5">
          <h4 className="text-xs font-bold font-display uppercase tracking-wider text-slate-400 mb-2.5">
            Monitored Power Signature Signals
          </h4>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {/* Signal 1: Standby Power */}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Standby Power</span>
                </span>
                <span>Base: {signals.standbyBaselineW}W</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-white">{signals.standbyPowerW} W</span>
                <span
                  className={`text-[10px] ${
                    signals.standbyPowerW > signals.standbyBaselineW * 1.4
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }`}
                >
                  {signals.standbyPowerW > signals.standbyBaselineW
                    ? `+${Math.round(((signals.standbyPowerW - signals.standbyBaselineW) / signals.standbyBaselineW) * 100)}%`
                    : 'Normal'}
                </span>
              </div>
            </div>

            {/* Signal 2: Compressor Inrush Current */}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-sky-400" />
                  <span>Inrush Surge</span>
                </span>
                <span>Base: {signals.inrushBaselineA}A</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-white">{signals.inrushCurrentA} A</span>
                <span
                  className={`text-[10px] ${
                    signals.inrushCurrentA > signals.inrushBaselineA * 1.35
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }`}
                >
                  {signals.inrushCurrentA > signals.inrushBaselineA
                    ? `+${Math.round(((signals.inrushCurrentA - signals.inrushBaselineA) / signals.inrushBaselineA) * 100)}%`
                    : 'Normal'}
                </span>
              </div>
            </div>

            {/* Signal 3: Power Factor Drift */}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-teal-400" />
                  <span>Power Factor</span>
                </span>
                <span>Base: {signals.powerFactorBaseline.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-white">{signals.powerFactor.toFixed(2)}</span>
                <span
                  className={`text-[10px] ${
                    signals.powerFactorBaseline - signals.powerFactor > 0.08
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }`}
                >
                  {signals.powerFactor < signals.powerFactorBaseline
                    ? `-${Math.round(((signals.powerFactorBaseline - signals.powerFactor) / signals.powerFactorBaseline) * 100)}%`
                    : 'Unity'}
                </span>
              </div>
            </div>

            {/* Signal 4: Runtime Creep */}
            <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-purple-400" />
                  <span>Cycle Runtime</span>
                </span>
                <span>Base: {signals.runtimeBaselineMinutes}m</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-white">{signals.runtimeMinutesPerCycle} min</span>
                <span
                  className={`text-[10px] ${
                    signals.runtimeMinutesPerCycle > signals.runtimeBaselineMinutes * 1.3
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }`}
                >
                  {signals.runtimeMinutesPerCycle > signals.runtimeBaselineMinutes
                    ? `+${Math.round(((signals.runtimeMinutesPerCycle - signals.runtimeBaselineMinutes) / signals.runtimeBaselineMinutes) * 100)}%`
                    : 'Optimal'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Findings (if any) */}
        {findings.length > 0 && (
          <div className="mb-5 space-y-2 max-h-36 overflow-y-auto scrollbar-thin">
            {findings.map((f, idx) => (
              <div
                key={idx}
                className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800 text-xs font-sans space-y-1"
              >
                <div className="flex items-center justify-between font-bold text-white">
                  <span>{f.label}</span>
                  <span className="text-rose-400 font-mono text-[11px]">{f.currentValue}</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">{f.diagnosis}</p>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold font-display cursor-pointer transition-colors"
          >
            Close
          </button>

          {report.linkToRoi && (
            <button
              onClick={() => {
                onClose();
                onOpenRoi(report);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 rounded-xl text-xs font-black font-display shadow-md cursor-pointer transition-all"
            >
              <span>Calculate Upgrade ROI</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
