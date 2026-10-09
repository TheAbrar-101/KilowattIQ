import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CalendarClock,
  Sparkles,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  RefreshCw,
  Cpu,
  Layers,
  TrendingDown,
  Leaf,
  ShieldCheck,
  ChevronRight,
  Info,
  Sliders,
  MoveHorizontal,
  Flame,
  Sun,
  Moon,
  Tv,
  Wind,
  Droplets,
  HelpCircle,
  X,
  PlayCircle,
} from 'lucide-react';
import { Household, Appliance } from '../../../shared/types/household';
import { IoTDevice } from '../../../shared/types/iot';
import {
  ScheduledSlot,
  ScheduleConflict,
  ProjectedBillImpact,
  OptimizationPreferences,
} from '../../server/scheduler/types';
import { ScheduleOptimizer } from '../../server/scheduler/optimizer';

interface ScheduleTabProps {
  household: Household;
  appliances: Appliance[];
  devices?: IoTDevice[];
  token?: string | null;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  household,
  appliances,
  devices = [],
  token,
}) => {
  const [schedule, setSchedule] = useState<ScheduledSlot[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [impact, setImpact] = useState<ProjectedBillImpact | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isApplyingRelays, setIsApplyingRelays] = useState<boolean>(false);
  const [showRelayModal, setShowRelayModal] = useState<boolean>(false);
  const [relaySuccessNotice, setRelaySuccessNotice] = useState<string | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Drag and drop state
  const [draggingApplianceId, setDraggingApplianceId] = useState<string | null>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);

  // Preference filters
  const [preferences, setPreferences] = useState<OptimizationPreferences>({
    preferNightTime: false,
    avoidSleepDisruption: true,
    allowDaytimeOffPeak: true,
  });

  // Calculate connected smart relay devices
  const connectedRelays = useMemo(() => {
    return devices.filter(
      d =>
        d.deviceType === 'SMART_PLUG' ||
        d.deviceType === 'ESP32_PZEM' ||
        d.adapterType === 'TuyaAdapter' ||
        Boolean(d.applianceId)
    );
  }, [devices]);

  // Headers helper
  const authHeaders = useMemo(() => {
    return {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    };
  }, [token]);

  // Recalculate local client-side impact immediately for instant live feedback
  const recalculateClientImpact = useCallback(
    (newSlots: ScheduledSlot[]) => {
      try {
        const localConflicts = ScheduleOptimizer.detectConflicts(newSlots, household, appliances);
        const localImpact = ScheduleOptimizer.calculateBillImpact(newSlots, household, appliances);
        setConflicts(localConflicts);
        setImpact(localImpact);
      } catch (err) {
        console.error('Local impact recalculation failed:', err);
      }
    },
    [household, appliances]
  );

  // Load schedule from backend or generate initial
  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    setErrorNotice(null);
    try {
      const res = await fetch(`/api/v1/scheduler?householdId=${household.id}`, {
        headers: authHeaders,
      });
      const data = await res.json();

      if (data.status === 'success' && data.data) {
        setSchedule(data.data.schedule || []);
        setConflicts(data.data.conflicts || []);
        setImpact(data.data.projectedImpact || null);
      } else {
        // Fallback local heuristic
        const fallback = ScheduleOptimizer.generateHeuristicSchedule(household, appliances, preferences);
        setSchedule(fallback.schedule);
        setConflicts(fallback.conflicts);
        setImpact(fallback.projectedImpact);
      }
    } catch (err) {
      console.warn('Backend fetch failed, using local heuristic scheduler:', err);
      const fallback = ScheduleOptimizer.generateHeuristicSchedule(household, appliances, preferences);
      setSchedule(fallback.schedule);
      setConflicts(fallback.conflicts);
      setImpact(fallback.projectedImpact);
    } finally {
      setIsLoading(false);
    }
  }, [household, appliances, authHeaders, preferences]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Trigger AI Auto-Schedule
  const handleAutoSchedule = async () => {
    setIsOptimizing(true);
    setErrorNotice(null);
    setSaveSuccessNotice(null);

    try {
      const res = await fetch('/api/v1/scheduler/optimize', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          preferences,
        }),
      });
      const data = await res.json();

      if (data.status === 'success' && data.data) {
        setSchedule(data.data.schedule || []);
        setConflicts(data.data.conflicts || []);
        setImpact(data.data.projectedImpact || null);
        setSaveSuccessNotice('AI generated optimal off-peak slots with zero peak hours!');
        setTimeout(() => setSaveSuccessNotice(null), 4000);
      } else {
        // Local fallback
        const heuristic = ScheduleOptimizer.generateHeuristicSchedule(household, appliances, preferences);
        setSchedule(heuristic.schedule);
        setConflicts(heuristic.conflicts);
        setImpact(heuristic.projectedImpact);
      }
    } catch (err: any) {
      console.warn('AI optimize request error, applying local optimizer:', err);
      const heuristic = ScheduleOptimizer.generateHeuristicSchedule(household, appliances, preferences);
      setSchedule(heuristic.schedule);
      setConflicts(heuristic.conflicts);
      setImpact(heuristic.projectedImpact);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Save current schedule
  const handleSaveSchedule = async () => {
    setIsSaving(true);
    setErrorNotice(null);
    try {
      const res = await fetch('/api/v1/scheduler/save', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          slots: schedule,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSaveSuccessNotice('Schedule successfully saved to your household profile.');
        setTimeout(() => setSaveSuccessNotice(null), 4000);
      }
    } catch (err: any) {
      setErrorNotice('Failed to save schedule. Check network connection.');
    } finally {
      setIsSaving(false);
    }
  };

  // Apply to smart relays
  const handleApplyToRelays = async () => {
    setIsApplyingRelays(true);
    try {
      const res = await fetch('/api/v1/scheduler/apply-relays', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          slots: schedule,
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setShowRelayModal(false);
        setRelaySuccessNotice(
          data.data?.appliedCount
            ? `Successfully configured ${data.data.appliedCount} smart relay(s) for automatic switching!`
            : 'Relay timers updated successfully.'
        );
        if (data.data?.schedule) {
          setSchedule(data.data.schedule);
        }
        setTimeout(() => setRelaySuccessNotice(null), 5000);
      } else {
        setErrorNotice(data.message || 'Failed to sync with smart relays.');
      }
    } catch (err: any) {
      setErrorNotice('Network error syncing with smart relays.');
    } finally {
      setIsApplyingRelays(false);
    }
  };

  // Add an appliance to a specific hour slot
  const handleAddApplianceToHour = (app: Appliance, hour: number) => {
    const isOffPeak = ScheduleOptimizer.isHourOffPeak(hour);
    const duration = app.category === 'WATER_HEATER' ? 1.5 : app.category === 'WASHING_MACHINE' ? 2 : 2.5;

    const newSlot: ScheduledSlot = {
      id: `slot_${app.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      applianceId: app.id,
      applianceName: app.name,
      category: app.category,
      roomId: app.roomId,
      startHour: hour,
      durationHours: duration,
      ratedPowerW: app.ratedPowerW,
      isOffPeak,
      deviceId: app.deviceId,
      hasRelay: Boolean(app.deviceId),
      notes: isOffPeak ? 'Scheduled in off-peak window' : 'Warning: Scheduled during peak tariff window',
    };

    const updated = [...schedule, newSlot];
    setSchedule(updated);
    recalculateClientImpact(updated);
  };

  // Remove a scheduled slot
  const handleRemoveSlot = (slotId: string) => {
    const updated = schedule.filter(s => s.id !== slotId);
    setSchedule(updated);
    recalculateClientImpact(updated);
  };

  // Adjust duration of a scheduled slot
  const handleAdjustDuration = (slotId: string, deltaHours: number) => {
    const updated = schedule.map(slot => {
      if (slot.id === slotId) {
        const newDuration = Math.max(0.5, Math.min(8, Number((slot.durationHours + deltaHours).toFixed(1))));
        return {
          ...slot,
          durationHours: newDuration,
          isOffPeak: ScheduleOptimizer.isSlotOffPeak(slot.startHour, newDuration),
        };
      }
      return slot;
    });
    setSchedule(updated);
    recalculateClientImpact(updated);
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, app: Appliance) => {
    e.dataTransfer.setData('text/plain', app.id);
    e.dataTransfer.effectAllowed = 'copyMove';
    setDraggingApplianceId(app.id);
  };

  const handleDragOverHour = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverHour !== hour) {
      setDragOverHour(hour);
    }
  };

  const handleDropOnHour = (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    const applianceId = e.dataTransfer.getData('text/plain') || draggingApplianceId;
    setDragOverHour(null);
    setDraggingApplianceId(null);

    if (!applianceId) return;
    const app = appliances.find(a => a.id === applianceId);
    if (app) {
      handleAddApplianceToHour(app, hour);
    }
  };

  // Helper for category icons
  const getCategoryIcon = (category: Appliance['category']) => {
    switch (category) {
      case 'AIR_CONDITIONER':
        return <Wind className="w-3.5 h-3.5 text-sky-500" />;
      case 'WATER_HEATER':
        return <Flame className="w-3.5 h-3.5 text-amber-500" />;
      case 'WASHING_MACHINE':
        return <Droplets className="w-3.5 h-3.5 text-blue-500" />;
      case 'REFRIGERATOR':
        return <Sun className="w-3.5 h-3.5 text-teal-500" />;
      case 'TELEVISION':
        return <Tv className="w-3.5 h-3.5 text-indigo-500" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  // Hourly power profile for bottom visualization
  const hourlyPowerProfile = useMemo(() => {
    const profile = new Array(24).fill(0);
    for (const slot of schedule) {
      const endHour = slot.startHour + slot.durationHours;
      for (let h = 0; h < 24; h++) {
        const isActive =
          (slot.startHour <= h && h < endHour) ||
          (endHour > 24 && (h >= slot.startHour || h < endHour % 24));
        if (isActive) {
          profile[h] += slot.ratedPowerW;
        }
      }
    }
    return profile;
  }, [schedule]);

  const sanctionedWatts = (household.sanctionedLoadKw || 3.0) * 1000;

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden text-white">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
                <CalendarClock className="w-5 h-5" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight text-white">
                Off-Peak Appliance Scheduler
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                23:00 – 17:00 Off-Peak
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-300 max-w-2xl font-sans">
              Drag heavy appliances into off-peak hours (11:00 PM – 5:00 PM next day). In Bangladesh, off-peak rates are{' '}
              <strong className="text-emerald-400 font-mono font-bold">৳7.05/kWh</strong> vs peak{' '}
              <strong className="text-amber-400 font-mono font-bold">৳12.10/kWh</strong> (+71% higher).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <button
              onClick={handleAutoSchedule}
              disabled={isOptimizing}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold font-display shadow-md hover:shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isOptimizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>AI Optimizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Auto-Schedule with AI</span>
                </>
              )}
            </button>

            {connectedRelays.length > 0 && (
              <button
                onClick={() => setShowRelayModal(true)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold font-display shadow-md hover:shadow-emerald-500/25 transition-all cursor-pointer border border-emerald-400/40"
              >
                <Cpu className="w-4 h-4 text-emerald-200" />
                <span>Apply Automatically</span>
                <span className="px-1.5 py-0.2 bg-emerald-950/60 text-emerald-300 font-mono text-[10px] rounded-md">
                  {connectedRelays.length} Relays
                </span>
              </button>
            )}

            <button
              onClick={handleSaveSchedule}
              disabled={isSaving}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold font-display transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span>Save</span>
            </button>
          </div>
        </div>

        {/* Notices */}
        {saveSuccessNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-3 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{saveSuccessNotice}</span>
          </motion.div>
        )}

        {relaySuccessNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-3 py-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2"
          >
            <Cpu className="w-4 h-4 shrink-0" />
            <span>{relaySuccessNotice}</span>
          </motion.div>
        )}

        {errorNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 px-3 py-2 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-mono flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorNotice}</span>
          </motion.div>
        )}
      </div>

      {/* Live Estimated Savings & Impact Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Estimated Monthly Savings */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-display font-bold uppercase tracking-wider text-[11px]">Estimated Monthly Savings</span>
            <span className="p-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              ৳{impact ? impact.monthlySavingsBDT.toLocaleString() : '---'}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ month</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="text-emerald-500 font-bold">
              ৳{impact ? impact.annualSavingsBDT.toLocaleString() : '---'}
            </span>
            <span>annual projected</span>
          </div>
        </div>

        {/* Card 2: Peak Energy Shifted */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-display font-bold uppercase tracking-wider text-[11px]">Peak Energy Shifted</span>
            <span className="p-1.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg">
              <Zap className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 font-mono">
              {impact ? impact.peakShiftedKwh : '0'}
            </span>
            <span className="text-xs text-slate-400 font-mono">kWh / mo</span>
          </div>
          <div className="mt-2 text-xs font-sans text-slate-500 dark:text-slate-400">
            Moved from peak (17:00–23:00) to off-peak
          </div>
        </div>

        {/* Card 3: BERC Slab Tier Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-display font-bold uppercase tracking-wider text-[11px]">Active BERC Slab Tier</span>
            <span className="p-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="text-base font-bold text-slate-800 dark:text-slate-100 font-display truncate">
            {impact?.currentSlabName || 'Step 3 (201-300 kWh)'}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>Rate: ৳{impact?.currentRateBDT.toFixed(2)}/kWh</span>
            {impact?.nextSlabName && (
              <span className="text-amber-500 font-semibold">{impact.kwhRemainingToBreach} kWh buffer</span>
            )}
          </div>
        </div>

        {/* Card 4: Environmental Impact */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs mb-1">
            <span className="font-display font-bold uppercase tracking-wider text-[11px]">Peaker CO₂ Avoided</span>
            <span className="p-1.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg">
              <Leaf className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-teal-600 dark:text-teal-400 font-mono">
              {impact ? impact.co2SavedKgMonthly : '0'}
            </span>
            <span className="text-xs text-slate-400 font-mono">kg CO₂ / mo</span>
          </div>
          <div className="mt-2 text-xs font-sans text-slate-500 dark:text-slate-400">
            Cuts reliance on quick-rental diesel peakers
          </div>
        </div>
      </div>

      {/* Conflict Warnings Banner (if any) */}
      <AnimatePresence>
        {conflicts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-500/40 rounded-2xl p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-display font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{conflicts.length} Schedule Conflict(s) Detected</span>
            </div>

            <div className="space-y-1.5">
              {conflicts.map((conflict, idx) => (
                <div
                  key={conflict.id || idx}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 bg-white/70 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-sans"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase mt-0.5 ${
                        conflict.severity === 'error'
                          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                          : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {conflict.type}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {conflict.message}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[11px] font-sans mt-0.5">
                        বাংলা: {conflict.messageBn}
                      </div>
                    </div>
                  </div>
                  <span className="text-amber-600 dark:text-amber-400 font-mono text-[11px] shrink-0 font-medium">
                    {conflict.recommendedAction}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Drag-and-Drop Timeline Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-5">
        {/* Timeline Header & Tariff Zone Guide */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold font-display text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span>24-Hour Interactive Timeline</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
              Drop appliances into slots below. Green columns highlight Bangladesh's 23:00–17:00 off-peak window.
            </p>
          </div>

          {/* Color Legend */}
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500" />
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                Off-Peak: 23:00 – 17:00 (৳7.05/kWh)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500/30 border border-amber-500" />
              <span className="text-amber-700 dark:text-amber-400 font-semibold">
                Peak: 17:00 – 23:00 (৳12.10/kWh)
              </span>
            </div>
          </div>
        </div>

        {/* 24-Hour Timeline Grid */}
        <div className="overflow-x-auto pb-4 scrollbar-thin">
          <div className="min-w-[1000px]">
            {/* Timeline Header Hours (JetBrains Mono font) */}
            <div className="grid grid-cols-24 gap-1 mb-2">
              {Array.from({ length: 24 }).map((_, hour) => {
                const isOffPeak = ScheduleOptimizer.isHourOffPeak(hour);
                const isPeak = !isOffPeak;
                return (
                  <div
                    key={`th-${hour}`}
                    className={`text-center py-1.5 rounded-lg text-[11px] font-mono font-bold transition-colors ${
                      isOffPeak
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <span>{hour.toString().padStart(2, '0')}:00</span>
                  </div>
                );
              })}
            </div>

            {/* Drop Columns Row */}
            <div className="grid grid-cols-24 gap-1 min-h-[220px]">
              {Array.from({ length: 24 }).map((_, hour) => {
                const isOffPeak = ScheduleOptimizer.isHourOffPeak(hour);
                const isDropTarget = dragOverHour === hour;

                // Slots starting at this hour
                const slotsStartingHere = schedule.filter(s => s.startHour === hour);

                return (
                  <div
                    key={`slot-col-${hour}`}
                    onDragOver={e => handleDragOverHour(e, hour)}
                    onDrop={e => handleDropOnHour(e, hour)}
                    className={`relative rounded-xl p-1 flex flex-col justify-between transition-all border ${
                      isDropTarget
                        ? 'bg-amber-500/25 border-amber-500 shadow-md ring-2 ring-amber-400'
                        : isOffPeak
                        ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/40'
                        : 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/20 hover:border-amber-500/40'
                    }`}
                  >
                    {/* Top Hour indicator */}
                    <div className="text-[10px] font-mono text-center text-slate-400 dark:text-slate-500 mb-1">
                      {hour}:00
                    </div>

                    {/* Stack of scheduled items starting here */}
                    <div className="space-y-1.5 flex-1">
                      {slotsStartingHere.map(slot => (
                        <motion.div
                          key={slot.id}
                          layout
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                          className={`rounded-lg p-1.5 shadow-sm border text-[11px] relative group ${
                            slot.isOffPeak
                              ? 'bg-emerald-600/90 text-white border-emerald-400/50'
                              : 'bg-amber-600/90 text-white border-amber-400/50 ring-1 ring-amber-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-display font-bold truncate leading-tight">
                              {slot.applianceName}
                            </span>
                            <button
                              onClick={() => handleRemoveSlot(slot.id)}
                              className="text-white/80 hover:text-white p-0.5 rounded cursor-pointer transition-colors"
                              title="Remove slot"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="font-mono text-[9px] text-white/90 flex items-center justify-between">
                            <span>{slot.ratedPowerW}W</span>
                            <span>{slot.durationHours}h</span>
                          </div>

                          {/* Relay badge */}
                          {slot.hasRelay && (
                            <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-white/90 bg-black/20 px-1 py-0.5 rounded">
                              <Cpu className="w-2.5 h-2.5 shrink-0" />
                              <span className="truncate">Relay Synced</span>
                            </div>
                          )}

                          {/* Duration adjustments */}
                          <div className="mt-1.5 pt-1 border-t border-white/20 flex items-center justify-between text-[10px] font-mono">
                            <button
                              onClick={() => handleAdjustDuration(slot.id, -0.5)}
                              className="px-1 py-0.2 bg-black/30 hover:bg-black/50 rounded cursor-pointer"
                              title="Decrease 30 mins"
                            >
                              -30m
                            </button>
                            <span className="text-[9px]">{slot.durationHours}h</span>
                            <button
                              onClick={() => handleAdjustDuration(slot.id, 0.5)}
                              className="px-1 py-0.2 bg-black/30 hover:bg-black/50 rounded cursor-pointer"
                              title="Increase 30 mins"
                            >
                              +30m
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Bottom quick add button */}
                    <div className="mt-1 text-center">
                      <button
                        onClick={() => {
                          const candidate = appliances.find(
                            a => a.category === 'WATER_HEATER' || a.category === 'AIR_CONDITIONER' || a.category === 'WASHING_MACHINE'
                          ) || appliances[0];
                          if (candidate) handleAddApplianceToHour(candidate, hour);
                        }}
                        className="w-full py-1 text-[9px] font-mono text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                        title={`Quick add appliance at ${hour}:00`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Concurrent Power Profile Bar (kW vs Sanctioned Load) */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
                <span className="font-display font-bold text-slate-700 dark:text-slate-300">
                  Concurrent Household Load Profile (kW)
                </span>
                <span className="text-amber-500 font-semibold">
                  Sanctioned Limit: {household.sanctionedLoadKw.toFixed(1)} kW ({sanctionedWatts}W)
                </span>
              </div>

              <div className="grid grid-cols-24 gap-1 items-end h-14 bg-slate-100 dark:bg-slate-950/60 rounded-xl p-1.5 border border-slate-200 dark:border-slate-800 relative">
                {hourlyPowerProfile.map((watts, hour) => {
                  const kw = (watts / 1000).toFixed(1);
                  const isBreach = watts > sanctionedWatts;
                  const heightPct = Math.min(100, Math.max(8, (watts / (sanctionedWatts * 1.4)) * 100));

                  return (
                    <div
                      key={`load-bar-${hour}`}
                      className="h-full flex flex-col justify-end items-center group relative"
                    >
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-xs transition-all ${
                          isBreach
                            ? 'bg-rose-500 animate-pulse'
                            : watts > 0
                            ? 'bg-amber-500 dark:bg-amber-400'
                            : 'bg-slate-300 dark:bg-slate-800'
                        }`}
                      />
                      {/* Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-1 z-20 px-2 py-1 bg-slate-900 text-white rounded text-[10px] font-mono whitespace-nowrap shadow-md">
                        {hour}:00 — {kw} kW {isBreach && '⚠️ OVER LIMIT'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Appliances Dock (Draggable items with Outfit labels) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold font-display text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <MoveHorizontal className="w-4 h-4 text-amber-500" />
              <span>Available Appliances Dock</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
              Drag appliances into the timeline above or click to schedule into recommended off-peak slots.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span>{appliances.length} registered appliances</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {appliances.map(app => {
            const hasRelay = Boolean(
              connectedRelays.find(d => d.applianceId === app.id || d.roomId === app.roomId)
            );
            const isCurrentlyScheduled = schedule.some(s => s.applianceId === app.id);

            return (
              <div
                key={app.id}
                draggable={true}
                onDragStart={e => handleDragStart(e, app)}
                className={`p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none relative group ${
                  isCurrentlyScheduled
                    ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:border-amber-400'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200 dark:border-slate-700">
                      {getCategoryIcon(app.category)}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold font-display text-slate-800 dark:text-slate-100 truncate max-w-[130px]">
                        {app.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-sans">{app.category}</span>
                    </div>
                  </div>

                  {hasRelay && (
                    <span
                      title="Smart Relay connected"
                      className="p-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md"
                    >
                      <Cpu className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                  <span className="font-bold">{app.ratedPowerW} W</span>
                  <span className="text-[11px] text-slate-400">{app.averageHoursPerDay} hrs/day</span>
                </div>

                {/* Quick actions */}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    onClick={() => handleAddApplianceToHour(app, 6)}
                    className="flex-1 py-1 px-2 text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 rounded-lg transition-colors cursor-pointer text-center"
                    title="Add to Morning Off-Peak (06:00)"
                  >
                    + 06:00 AM
                  </button>
                  <button
                    onClick={() => handleAddApplianceToHour(app, 23)}
                    className="flex-1 py-1 px-2 text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 rounded-lg transition-colors cursor-pointer text-center"
                    title="Add to Night Off-Peak (23:00)"
                  >
                    + 11:00 PM
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Reasoning & BERC Optimization Advice Box */}
      {impact?.aiSummary && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-display font-bold text-sm">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>AI Optimization Rationale (DESCO / DPDC Tariffs)</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 font-sans leading-relaxed">
            {impact.aiSummary}
          </p>

          {impact.tips && impact.tips.length > 0 && (
            <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-sans text-slate-400">
              {impact.tips.map((tip, idx) => (
                <div key={idx} className="flex items-start gap-2 bg-slate-850 p-2.5 rounded-xl border border-slate-800">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Smart Relay Automatic Application Modal (Dual Language: Bangla & English) */}
      <AnimatePresence>
        {showRelayModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowRelayModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="p-2.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <Cpu className="w-6 h-6" />
                </span>
                <div>
                  <h3 className="text-lg font-bold font-display text-slate-900 dark:text-white">
                    Apply Schedule to Smart Relays
                  </h3>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                    স্মার্ট রিলেতে শিডিউল প্রয়োগ নিশ্চিতকরণ
                  </p>
                </div>
              </div>

              {/* Dual-Language Plain Description */}
              <div className="space-y-3 mb-5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {/* Bangla Notice */}
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl">
                  <h4 className="font-bold text-emerald-800 dark:text-emerald-300 font-display mb-1 flex items-center gap-1.5">
                    <span>বাংলা বিবরণ:</span>
                  </h4>
                  <p className="leading-relaxed">
                    আপনি কি স্মার্ট রিলেতে এই অফ-পিক শিডিউলটি প্রয়োগ করতে চান? এটি নির্ধারিত সময়সূচি
                    (রাত ১১:০০ – বিকেল ৫:০০) অনুযায়ী আপনার ওয়াটার হিটার, এসি এবং অন্যান্য ভারী যন্ত্রপাতি
                    স্বয়ংক্রিয়ভাবে চালু ও বন্ধ করবে। এর ফলে পিক আওয়ারে (সন্ধ্যা ৫:০০ – রাত ১১:০০)
                    বিদ্যুৎ বিলের অতিরিক্ত খরচ বাঁচবে এবং বাসার অনুমোদিত লোড সুরক্ষিত থাকবে।
                  </p>
                </div>

                {/* English Notice */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 font-display mb-1">
                    English Summary:
                  </h4>
                  <p className="leading-relaxed text-xs">
                    Do you want to apply this off-peak schedule to your connected smart relays? KilowattIQ
                    will automatically switch appliances ON/OFF during optimal off-peak hours (23:00 – 17:00),
                    eliminating peak-hour tariff surcharges and protecting against main breaker trips.
                  </p>
                </div>
              </div>

              {/* List of Affected Connected Relays */}
              <div className="mb-6">
                <h5 className="text-xs font-bold font-display text-slate-700 dark:text-slate-300 mb-2">
                  Connected Relay Devices to be Synchronized ({connectedRelays.length}):
                </h5>
                <div className="max-h-40 overflow-y-auto space-y-1.5 scrollbar-thin">
                  {connectedRelays.map(device => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-800/50 rounded-lg text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">{device.name}</span>
                        <span className="text-[10px] text-slate-400">({device.deviceType})</span>
                      </div>
                      <span className="text-emerald-500 font-semibold text-[11px]">Ready to sync</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowRelayModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold font-display text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel / বাতিল
                </button>
                <button
                  onClick={handleApplyToRelays}
                  disabled={isApplyingRelays}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold font-display bg-emerald-600 hover:bg-emerald-500 text-white shadow-md hover:shadow-emerald-500/25 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isApplyingRelays ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Applying... / প্রয়োগ করা হচ্ছে</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Apply / নিশ্চিত করুন</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
