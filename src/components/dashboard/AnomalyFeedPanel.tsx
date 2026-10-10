import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Activity,
  Gauge,
  HelpCircle,
  Wrench,
  Sparkles,
  RefreshCw,
  BellRing,
  Check,
  Flame,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { AnomalyRecord, AnomalyType, AnomalySeverity } from '../../server/anomaly/types';

interface AnomalyFeedPanelProps {
  householdId: string;
  token?: string | null;
  onRefreshTelemetry?: () => void;
}

export const AnomalyFeedPanel: React.FC<AnomalyFeedPanelProps> = ({
  householdId,
  token,
  onRefreshTelemetry,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };

  // Fetch anomalies from backend
  const fetchAnomalies = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/anomalies?householdId=${householdId}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.status === 'success' && data.data?.anomalies) {
        setAnomalies(data.data.anomalies);
      }
    } catch (err) {
      console.warn('Failed to fetch anomalies:', err);
    } finally {
      setIsLoading(false);
    }
  }, [householdId, token]);

  useEffect(() => {
    fetchAnomalies();
    // Poll every 12 seconds for fresh anomaly events
    const interval = setInterval(fetchAnomalies, 12000);
    return () => clearInterval(interval);
  }, [fetchAnomalies]);

  // Mark anomaly as resolved
  const handleResolve = async (anomalyId: string) => {
    setResolvingId(anomalyId);
    try {
      const res = await fetch(`/api/v1/anomalies/${anomalyId}/resolve`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ householdId }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setAnomalies(prev =>
          prev.map(a => (a.id === anomalyId ? { ...a, status: 'RESOLVED', resolvedAt: new Date().toISOString() } : a))
        );
        setFeedbackNotice('Anomaly marked as resolved.');
        setTimeout(() => setFeedbackNotice(null), 3000);
      }
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
    } finally {
      setResolvingId(null);
    }
  };

  // Simulate an anomaly for testing and verification
  const handleSimulate = async (type: AnomalyType) => {
    setIsSimulating(true);
    try {
      const res = await fetch('/api/v1/anomalies/simulate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ householdId, type }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setAnomalies(prev => [data.data, ...prev]);
        setFeedbackNotice(`Injected test anomaly: ${data.data.title}`);
        setTimeout(() => setFeedbackNotice(null), 4000);
        if (onRefreshTelemetry) onRefreshTelemetry();
      }
    } catch (err) {
      console.error('Failed to simulate anomaly:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const activeCount = anomalies.filter(a => a.status === 'ACTIVE').length;
  const highSeverityCount = anomalies.filter(a => a.status === 'ACTIVE' && a.severity === 'HIGH').length;

  const filteredAnomalies = anomalies.filter(a => {
    if (filter === 'ACTIVE') return a.status === 'ACTIVE';
    if (filter === 'RESOLVED') return a.status === 'RESOLVED';
    return true;
  });

  const getSeverityBadge = (severity: AnomalySeverity) => {
    switch (severity) {
      case 'HIGH':
        return {
          bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
          label: 'CRITICAL',
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />,
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
          label: 'WARNING',
          icon: <Activity className="w-3.5 h-3.5 text-amber-500" />,
        };
      default:
        return {
          bg: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
          label: 'INFO',
          icon: <HelpCircle className="w-3.5 h-3.5 text-sky-400" />,
        };
    }
  };

  const getAnomalyTypeIcon = (type: AnomalyType) => {
    switch (type) {
      case 'POWER_DRAW_ALL_OFF':
        return <Flame className="w-4 h-4 text-rose-500" />;
      case 'VOLTAGE_DROP_HIGH_LOAD':
        return <Zap className="w-4 h-4 text-amber-500" />;
      case 'NEUTRAL_CURRENT_IMBALANCE':
        return <Activity className="w-4 h-4 text-purple-500" />;
      case 'SUDDEN_UNTRACKED_STEP':
        return <Sparkles className="w-4 h-4 text-orange-500" />;
      case 'SUSTAINED_FREQUENCY_DEVIATION':
        return <Gauge className="w-4 h-4 text-teal-500" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-all">
      {/* Collapsible Panel Header */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className={`p-2 rounded-xl transition-colors ${
            highSeverityCount > 0
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30'
              : activeCount > 0
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          }`}>
            <ShieldAlert className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                Theft, Leakage & Faulty Wiring Diagnostics
              </h3>
              {activeCount > 0 ? (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  highSeverityCount > 0
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 animate-pulse'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
                }`}>
                  {activeCount} Active {activeCount === 1 ? 'Notice' : 'Notices'}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  Normal Line Status
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              Automated power signature monitoring for line leakage, undersized wiring, neutral imbalance & unauthorized taps
            </p>
          </div>
        </div>

        {/* Action Controls & Simulation Menu */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Quick Simulation Dropdown / Button */}
          <div className="relative group/sim">
            <button
              disabled={isSimulating}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Inject test anomaly signal for demonstration"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Simulate Anomaly</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Dropdown menu */}
            <div className="hidden group-hover/sim:block absolute right-0 top-full pt-1 z-30 w-56">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 text-xs font-sans space-y-0.5">
                <button
                  onClick={() => handleSimulate('POWER_DRAW_ALL_OFF')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer flex items-center gap-2"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Power Draw (All Off: 340W)</span>
                </button>
                <button
                  onClick={() => handleSimulate('VOLTAGE_DROP_HIGH_LOAD')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer flex items-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>Voltage Sag (18.2V Drop)</span>
                </button>
                <button
                  onClick={() => handleSimulate('NEUTRAL_CURRENT_IMBALANCE')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer flex items-center gap-2"
                >
                  <Activity className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span>Neutral Imbalance (2.8A)</span>
                </button>
                <button
                  onClick={() => handleSimulate('SUDDEN_UNTRACKED_STEP')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>Untracked Step (+1,250W)</span>
                </button>
                <button
                  onClick={() => handleSimulate('SUSTAINED_FREQUENCY_DEVIATION')}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer flex items-center gap-2"
                >
                  <Gauge className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span>Frequency Drift (49.12 Hz)</span>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
            title={isOpen ? 'Collapse panel' : 'Expand panel'}
          >
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedbackNotice && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="px-4 py-2 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-mono flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackNotice}</span>
        </motion.div>
      )}

      {/* Collapsible Content Area */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 sm:p-5 space-y-4"
          >
            {/* Filter Pills */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilter('ACTIVE')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filter === 'ACTIVE'
                      ? 'bg-amber-500 text-slate-950 font-extrabold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Active ({anomalies.filter(a => a.status === 'ACTIVE').length})
                </button>
                <button
                  onClick={() => setFilter('RESOLVED')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filter === 'RESOLVED'
                      ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  Resolved ({anomalies.filter(a => a.status === 'RESOLVED').length})
                </button>
                <button
                  onClick={() => setFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    filter === 'ALL'
                      ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-950 font-extrabold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All ({anomalies.length})
                </button>
              </div>

              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Tone: Helpful, non-accusatory electrical guidance
              </span>
            </div>

            {/* Anomalies List */}
            {filteredAnomalies.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-bold font-display text-slate-800 dark:text-slate-200">
                  No {filter.toLowerCase()} electrical anomalies detected
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-1 max-w-md mx-auto">
                  Line currents, neutral return balance, and grid voltage levels are operating within standard BERC tolerances.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAnomalies.map(anomaly => {
                  const severityConfig = getSeverityBadge(anomaly.severity);
                  const isResolved = anomaly.status === 'RESOLVED';

                  return (
                    <motion.div
                      key={anomaly.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className={`p-4 rounded-xl border transition-all ${
                        isResolved
                          ? 'bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/80 opacity-70'
                          : anomaly.severity === 'HIGH'
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50 shadow-xs'
                          : 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 shadow-xs'
                      }`}
                    >
                      {/* Top Row: Type, Severity, Timestamp */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200 dark:border-slate-700">
                            {getAnomalyTypeIcon(anomaly.type)}
                          </span>
                          <div>
                            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white font-display">
                              {anomaly.title}
                            </span>
                            <span className="text-[10px] text-slate-400 font-sans block sm:inline sm:ml-2">
                              বাংলা: {anomaly.titleBn}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1 ${severityConfig.bg}`}
                          >
                            {severityConfig.icon}
                            <span>{severityConfig.label}</span>
                          </span>

                          {anomaly.alertTriggered && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1"
                              title="High-severity alert dispatched to AlertEngine (SMS/Email/Push)"
                            >
                              <BellRing className="w-3 h-3" />
                              <span>Alert Dispatched</span>
                            </span>
                          )}

                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(anomaly.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {/* Plain-Language Helpful Explanation */}
                      <div className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-relaxed mb-3">
                        <p>{anomaly.explanation}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-1">
                          বাংলা: {anomaly.explanationBn}
                        </p>
                      </div>

                      {/* Suggested Action Box & Resolve Button */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/50 p-2.5 rounded-lg">
                        <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <Wrench className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Here's what to check:
                            </span>{' '}
                            <span>{anomaly.suggestedAction}</span>
                          </div>
                        </div>

                        {/* Action: Mark as Resolved */}
                        {isResolved ? (
                          <span className="px-3 py-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold rounded-lg flex items-center gap-1 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            <span>Resolved</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolve(anomaly.id)}
                            disabled={resolvingId === anomaly.id}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 font-display text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                          >
                            {resolvingId === anomaly.id ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Resolving...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Mark as Resolved</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
