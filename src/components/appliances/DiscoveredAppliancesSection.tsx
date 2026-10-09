import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Zap,
  HelpCircle,
  CheckCircle2,
  GitMerge,
  Edit2,
  RefreshCw,
  Plus,
  Activity,
  Flame,
  Tv,
  Fan,
  Radio,
  Server,
  X,
  Play,
  ArrowRight
} from 'lucide-react';
import { Room, Appliance } from '../../../shared/types/household';
import { DiscoveredAppliance } from '../../server/nilm/types';

interface DiscoveredAppliancesSectionProps {
  householdId: string;
  rooms: Room[];
  registeredAppliances: Appliance[];
  token?: string | null;
  onApplianceConfirmed?: (appliance: Appliance) => void;
}

export const DiscoveredAppliancesSection: React.FC<DiscoveredAppliancesSectionProps> = ({
  householdId,
  rooms,
  registeredAppliances,
  token,
  onApplianceConfirmed,
}) => {
  const [discoveredList, setDiscoveredList] = useState<DiscoveredAppliance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Modals state
  const [confirmingItem, setConfirmingItem] = useState<DiscoveredAppliance | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(rooms[0]?.id || '');
  const [customName, setCustomName] = useState<string>('');

  const [renamingItem, setRenamingItem] = useState<DiscoveredAppliance | null>(null);
  const [newName, setNewName] = useState<string>('');

  const [mergingItem, setMergingItem] = useState<DiscoveredAppliance | null>(null);
  const [mergeTargetApplianceId, setMergeTargetApplianceId] = useState<string>('');

  const showToast = (type: 'success' | 'info' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchDiscovered = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-demo-mode'] = 'true';
      }

      const res = await fetch(`/api/v1/nilm/discovered?householdId=${encodeURIComponent(householdId)}`, {
        headers,
      });
      const json = await res.json();
      if (json.status === 'success' && Array.isArray(json.data)) {
        setDiscoveredList(json.data);
      }
    } catch (err) {
      console.warn('[DiscoveredAppliancesSection] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [householdId, token]);

  useEffect(() => {
    fetchDiscovered();
  }, [fetchDiscovered]);

  // User Action: Confirm Appliance
  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingItem) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-demo-mode'] = 'true';
      }

      const res = await fetch('/api/v1/nilm/confirm', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          householdId,
          discoveryId: confirmingItem.id,
          roomId: selectedRoomId || rooms[0]?.id || 'room_default',
          customName: customName.trim() || confirmingItem.name,
        }),
      });

      const json = await res.json();
      if (json.status === 'success') {
        showToast('success', `"${confirmingItem.name}" confirmed into appliance inventory!`);
        if (json.data?.appliance && onApplianceConfirmed) {
          onApplianceConfirmed(json.data.appliance);
        }
        setConfirmingItem(null);
        fetchDiscovered();
      } else {
        showToast('error', json.message || 'Failed to confirm appliance.');
      }
    } catch (err) {
      console.error('Confirm error:', err);
      showToast('error', 'Error confirming appliance.');
    }
  };

  // User Action: Rename Appliance
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !newName.trim()) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-demo-mode'] = 'true';
      }

      const res = await fetch('/api/v1/nilm/rename', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          householdId,
          discoveryId: renamingItem.id,
          newName: newName.trim(),
        }),
      });

      const json = await res.json();
      if (json.status === 'success') {
        showToast('success', `Renamed to "${newName.trim()}".`);
        setRenamingItem(null);
        fetchDiscovered();
      } else {
        showToast('error', json.message || 'Failed to rename.');
      }
    } catch (err) {
      console.error('Rename error:', err);
      showToast('error', 'Error renaming appliance.');
    }
  };

  // User Action: Merge Appliance
  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergingItem || !mergeTargetApplianceId) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-demo-mode'] = 'true';
      }

      const res = await fetch('/api/v1/nilm/merge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          householdId,
          discoveryId: mergingItem.id,
          targetApplianceId: mergeTargetApplianceId,
        }),
      });

      const json = await res.json();
      if (json.status === 'success') {
        showToast('success', `Merged detection with "${json.data?.name || 'appliance'}".`);
        setMergingItem(null);
        fetchDiscovered();
      } else {
        showToast('error', json.message || 'Failed to merge.');
      }
    } catch (err) {
      console.error('Merge error:', err);
      showToast('error', 'Error merging detection.');
    }
  };

  // Trigger 1 Hz Step Telemetry Simulation
  const handleSimulate = async (scenario: 'ac_on' | 'geyser_on' | 'pump_on' | 'microwave_on' | 'ac_off') => {
    setIsSimulating(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        headers['x-demo-mode'] = 'true';
      }

      const res = await fetch('/api/v1/nilm/simulate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ householdId, scenario }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        const step = json.data?.step;
        const deltaW = step ? step.deltaActiveW : 0;
        showToast(
          'info',
          `Step event simulated: ${deltaW > 0 ? '+' : ''}${deltaW}W (PF ${step?.apparentPowerFactor || '0.92'})`
        );
        fetchDiscovered();
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'AIR_CONDITIONER':
        return <Activity className="w-5 h-5 text-cyan-400" />;
      case 'WATER_HEATER':
        return <Flame className="w-5 h-5 text-amber-400" />;
      case 'REFRIGERATOR':
        return <Server className="w-5 h-5 text-blue-400" />;
      case 'TELEVISION':
        return <Tv className="w-5 h-5 text-purple-400" />;
      case 'FAN':
        return <Fan className="w-5 h-5 text-emerald-400" />;
      case 'ROUTER':
        return <Radio className="w-5 h-5 text-teal-400" />;
      default:
        return <Zap className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden space-y-6">
      
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black font-display text-white tracking-wide">
              Discovered Appliances
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              1 Hz NILM Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl font-sans">
            Automatic Non-Intrusive Load Monitoring disaggregating aggregate mains telemetry via active (ΔP) & reactive (ΔQ) power signatures and Gemini Vision identification.
          </p>
        </div>

        {/* Action Controls & Simulation Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Simulation dropdown quick actions */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
            <span className="text-slate-400 text-[11px] font-bold px-2 flex items-center gap-1">
              <Play className="w-3 h-3 text-cyan-400" /> Pulse:
            </span>
            <button
              type="button"
              disabled={isSimulating}
              onClick={() => handleSimulate('ac_on')}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Simulate 1.5T AC startup step (+1650W)"
            >
              +1.5T AC
            </button>
            <button
              type="button"
              disabled={isSimulating}
              onClick={() => handleSimulate('geyser_on')}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Simulate Geyser resistive step (+2100W)"
            >
              +Geyser
            </button>
            <button
              type="button"
              disabled={isSimulating}
              onClick={() => handleSimulate('pump_on')}
              className="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 border border-amber-800/40"
              title="Simulate Unknown Pump step (+780W, 640 VAR) -> Tests 'Maybe:' label"
            >
              +Pump (Maybe)
            </button>
          </div>

          <button
            type="button"
            onClick={fetchDiscovered}
            disabled={isLoading}
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            title="Refresh Discovered Appliances"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              toastMsg.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : toastMsg.type === 'error'
                ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                : 'bg-cyan-950/60 border-cyan-800 text-cyan-300'
            }`}
          >
            <span>{toastMsg.text}</span>
            <button onClick={() => setToastMsg(null)} className="cursor-pointer ml-3 opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discovered Appliances Grid */}
      {discoveredList.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
          <Activity className="w-10 h-10 text-slate-600 mx-auto mb-3 animate-pulse" />
          <h3 className="text-white font-bold text-sm">Listening for Step Signatures</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Turn on appliances or click one of the simulation pulse buttons above to feed 1 Hz step transitions into the disaggregator.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {discoveredList.map((item) => {
            const isHighConfidence = item.confidence >= 60;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-slate-950/80 rounded-xl p-4 border transition-all duration-200 flex flex-col justify-between ${
                  item.isConfirmed
                    ? 'border-emerald-800/40 bg-emerald-950/10'
                    : isHighConfidence
                    ? 'border-slate-800 hover:border-slate-700'
                    : 'border-amber-800/40 bg-amber-950/10 hover:border-amber-700/60'
                }`}
              >
                <div>
                  {/* Card Header: Icon, State, Confidence Badge */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg">
                        {getCategoryIcon(item.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-white text-sm line-clamp-1 font-display">
                            {item.name}
                          </h4>
                          {item.isAiLabeled && (
                            <span title="Labeled by Gemini Vision/Signature Model">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.category.replace('_', ' ')}
                          </span>
                          <span className="text-slate-600 text-[10px]">•</span>
                          {item.state === 'RUNNING' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Running
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">Standby / Off</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Strict Honest Confidence Badge:
                        Keep it honest: if confidence < 60%, show "Maybe:" not "Detected:" */}
                    <div className="shrink-0">
                      {isHighConfidence ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Detected: {item.confidence}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <HelpCircle className="w-3 h-3 text-amber-400" />
                          Maybe: {item.confidence}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Electrical Characteristics */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-900/80 border border-slate-800/80 rounded-lg p-2.5 my-3 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Step Active</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">
                        +{item.ratedPowerW} W
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Reactive</div>
                      <div className="text-xs font-mono font-bold text-cyan-300 mt-0.5">
                        {item.reactivePowerVAR} VAR
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium">Power Factor</div>
                      <div className="text-xs font-mono font-bold text-slate-300 mt-0.5">
                        {item.powerFactor}
                      </div>
                    </div>
                  </div>

                  {/* AI Explanation / Reasoning */}
                  {item.aiLabelReasoning && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-900/40 rounded-lg p-2 border border-slate-800/40 mb-3 leading-relaxed">
                      "{item.aiLabelReasoning}"
                    </p>
                  )}

                  {/* Duty Cycle and Estimated Usage */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5 pb-2">
                    <span>Est. Daily Usage:</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      ~{item.dailyEstimatedKwh} kWh / day
                    </span>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-2">
                  {item.isConfirmed ? (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Confirmed in Inventory</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingItem(item);
                        setCustomName(item.name);
                        setSelectedRoomId(rooms[0]?.id || '');
                      }}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-display text-xs rounded-lg transition-transform active:scale-95 cursor-pointer flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Confirm
                    </button>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingItem(item);
                        setNewName(item.name);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Rename Detection"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMergingItem(item);
                        setMergeTargetApplianceId(registeredAppliances[0]?.id || '');
                      }}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Merge into Registered Appliance"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Confirm Appliance into Household Inventory */}
      <AnimatePresence>
        {confirmingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold font-display text-white text-base">
                      Confirm Discovered Appliance
                    </h3>
                    <p className="text-xs text-slate-400">Add to your household inventory</p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmingItem(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmSubmit} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Appliance Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Assign to Room
                  </label>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Disaggregated Power:</span>
                    <span className="font-mono text-white font-bold">{confirmingItem.ratedPowerW} W</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Reactive Displacement:</span>
                    <span className="font-mono text-cyan-300 font-bold">{confirmingItem.reactivePowerVAR} VAR</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Confidence Score:</span>
                    <span className="font-mono text-emerald-400 font-bold">{confirmingItem.confidence}%</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingItem(null)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-display rounded-xl text-xs shadow-md cursor-pointer active:scale-95"
                  >
                    Confirm & Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Rename Discovered Appliance */}
      <AnimatePresence>
        {renamingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Edit2 className="w-5 h-5" />
                  </span>
                  <h3 className="font-bold font-display text-white text-base">
                    Rename Detection
                  </h3>
                </div>
                <button
                  onClick={() => setRenamingItem(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRenameSubmit} className="space-y-4 pt-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    New Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g. Master Bedroom Inverter AC"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRenamingItem(null)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-display rounded-xl text-xs shadow-md cursor-pointer active:scale-95"
                  >
                    Save Name
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Merge Detection with Existing Registered Appliance */}
      <AnimatePresence>
        {mergingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                    <GitMerge className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-bold font-display text-white text-base">
                      Merge Detection
                    </h3>
                    <p className="text-xs text-slate-400">Link signature to an existing appliance</p>
                  </div>
                </div>
                <button
                  onClick={() => setMergingItem(null)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleMergeSubmit} className="space-y-4 pt-4">
                <div className="text-xs text-slate-300">
                  Select which registered household appliance corresponds to this transient step event:
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Target Registered Appliance
                  </label>
                  <select
                    value={mergeTargetApplianceId}
                    onChange={(e) => setMergeTargetApplianceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                  >
                    {registeredAppliances.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name} ({app.ratedPowerW} W • {app.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setMergingItem(null)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-purple-500 hover:bg-purple-400 text-white font-bold font-display rounded-xl text-xs shadow-md cursor-pointer active:scale-95"
                  >
                    Confirm Merge
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
