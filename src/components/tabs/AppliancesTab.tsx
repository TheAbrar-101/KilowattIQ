import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, Flame, ArrowRightLeft, Plus, Power, CheckCircle2, Sliders, X, Sparkles, AlertCircle } from 'lucide-react';
import { Household, Room, Appliance } from '../../../shared/types/household';
import { VampirePowerEngine } from '../../../backend/engine/VampirePowerEngine';
import { ROICalculator } from '../../../backend/engine/ROICalculator';

interface AppliancesTabProps {
  household: Household;
  rooms: Room[];
  appliances: Appliance[];
  activeApplianceStates?: Record<string, boolean>;
  onToggleAppliance?: (applianceId: string) => void;
  onAddAppliance?: (appliance: Omit<Appliance, 'id'>) => void;
}

export const AppliancesTab: React.FC<AppliancesTabProps> = ({
  household,
  rooms,
  appliances,
  activeApplianceStates = {},
  onToggleAppliance,
  onAddAppliance,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleToggle = (appId: string) => {
    if (!onToggleAppliance) return;
    setTogglingId(appId);
    onToggleAppliance(appId);
    setTimeout(() => setTogglingId(null), 500);
  };

  // New appliance form state
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState(rooms[0]?.id || '');
  const [category, setCategory] = useState<Appliance['category']>('AIR_CONDITIONER');
  const [ratedPowerW, setRatedPowerW] = useState(1200);
  const [isInverterType, setIsInverterType] = useState(true);
  const [standbyPowerW, setStandbyPowerW] = useState(12);

  // ROI Calculator state
  const [currentWatts, setCurrentWatts] = useState<number>(1800);
  const [proposedWatts, setProposedWatts] = useState<number>(1100);
  const [usageHours, setUsageHours] = useState<number>(8);
  const [investmentBDT, setInvestmentBDT] = useState<number>(62000);

  const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);

  const roiResult = ROICalculator.calculateUpgradeROI(
    '1.5 Ton Non-Inverter AC',
    '1.5 Ton 5-Star Inverter AC',
    currentWatts,
    proposedWatts,
    usageHours,
    investmentBDT,
    7.34
  );

  const handleSubmitNewAppliance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !onAddAppliance) return;

    onAddAppliance({
      householdId: household.id,
      roomId: roomId || rooms[0]?.id || 'room_1',
      name,
      category,
      ratedPowerW,
      standbyPowerW,
      averageHoursPerDay: usageHours,
      isInverterType,
      isVampireRisk: standbyPowerW > 5,
    });

    setName('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-5">
      
      {/* Top Section: Room & Appliance Inventory */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Home className="w-4 h-4 text-emerald-400" />
              <span>Room & Appliance Inventory Audit</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Per-room electrical appliances, live power controls, and standby leakage tracking
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-emerald-500/20 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Appliance</span>
          </button>
        </div>

        {/* Room Inventory Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rooms.map((room) => {
            const roomApps = appliances.filter(a => a.roomId === room.id);
            const totalRoomWatts = roomApps.reduce((acc, a) => acc + a.ratedPowerW, 0);

            return (
              <div key={room.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-bold text-xs text-white">{room.name}</span>
                  <span className="text-[11px] font-mono font-bold text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {totalRoomWatts} W Capacity
                  </span>
                </div>

                <div className="space-y-2">
                  {roomApps.map((app) => {
                    const isOn = activeApplianceStates[app.id] ?? true;
                    return (
                      <div
                        key={app.id}
                        className={`flex items-center justify-between text-xs p-2.5 rounded-xl border transition-all ${
                          isOn ? 'bg-slate-900 border-emerald-500/30' : 'bg-slate-900/40 border-slate-800 opacity-70'
                        }`}
                      >
                        <div>
                          <span className="font-bold text-xs text-slate-200 block">{app.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {app.ratedPowerW}W • {app.isInverterType ? 'Inverter ★' : 'Standard'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleToggle(app.id)}
                          disabled={togglingId === app.id}
                          className={`p-1.5 rounded-lg border text-[10px] font-bold font-mono transition-all flex items-center gap-1 cursor-pointer ${
                            isOn
                              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          } ${togglingId === app.id ? 'opacity-50 animate-pulse' : ''}`}
                        >
                          <Power className={`w-3 h-3 ${togglingId === app.id ? 'animate-spin' : ''}`} />
                          <span>{togglingId === app.id ? '...' : isOn ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vampire Power Analysis & Interactive ROI Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Left: Vampire Power Standby Loss Audit */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <Flame className="w-4 h-4 text-rose-400" />
              <span>Phantom / Vampire Load Standby Leakage</span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Identifies continuous standby energy leaking off-hours in main circuits
            </p>
          </div>

          <div className="space-y-2">
            {vampireReports.map((rep) => (
              <div key={rep.applianceId} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">{rep.applianceName} ({rep.roomName})</span>
                  <span className="text-rose-400 font-mono font-bold">~৳{rep.annualWastedBDT} / year</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Standby Power: {rep.standbyWatts}W</span>
                  <span className="text-amber-400 font-mono">৳{rep.monthlyWastedBDT} / month wasted</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Interactive Appliance Inverter Upgrade ROI Calculator */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-wider">
              <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
              <span>Inverter Upgrade ROI & Payback Calculator</span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Calculate payback period in months when upgrading old non-inverter appliances
            </p>
          </div>

          <div className="space-y-3 bg-slate-950 border border-slate-800 p-4 rounded-xl text-xs">
            {/* Slider 1: Current Watts */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>Existing Appliance Wattage</span>
                <span className="text-rose-400 font-mono">{currentWatts} W</span>
              </div>
              <input
                type="range"
                min="500"
                max="3000"
                step="50"
                value={currentWatts}
                onChange={(e) => setCurrentWatts(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>

            {/* Slider 2: Proposed Inverter Watts */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>Proposed Inverter Wattage</span>
                <span className="text-emerald-400 font-mono">{proposedWatts} W</span>
              </div>
              <input
                type="range"
                min="300"
                max="2000"
                step="50"
                value={proposedWatts}
                onChange={(e) => setProposedWatts(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Slider 3: Usage Hours per Day */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>Daily Usage Hours</span>
                <span className="text-amber-400 font-mono">{usageHours} Hours / Day</span>
              </div>
              <input
                type="range"
                min="1"
                max="24"
                value={usageHours}
                onChange={(e) => setUsageHours(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* ROI Results Display */}
            <div className="pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-900 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Monthly Savings</span>
                <span className="text-sm font-bold font-mono text-emerald-400">৳{roiResult.monthlySavingsBDT.toFixed(0)}</span>
              </div>
              <div className="p-2 bg-slate-900 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">Payback Period</span>
                <span className="text-sm font-bold font-mono text-amber-400">{roiResult.paybackPeriodMonths.toFixed(1)} Mo</span>
              </div>
              <div className="p-2 bg-slate-900 rounded-lg">
                <span className="text-[9px] text-slate-500 font-bold uppercase block">5-Yr Net ROI</span>
                <span className="text-sm font-bold font-mono text-emerald-400">৳{roiResult.fiveYearNetSavingsBDT.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Add Appliance Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Register New Household Appliance</span>
                </h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitNewAppliance} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Appliance Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Bedroom Inverter AC"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Room Location</label>
                    <select
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Appliance['category'])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="AIR_CONDITIONER">Air Conditioner</option>
                      <option value="REFRIGERATOR">Refrigerator</option>
                      <option value="TELEVISION">Television</option>
                      <option value="WATER_HEATER">Water Heater / Geyser</option>
                      <option value="MICROWAVE">Microwave</option>
                      <option value="OTHER">Other Load</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Rated Power (Watts)</label>
                    <input
                      type="number"
                      required
                      value={ratedPowerW}
                      onChange={(e) => setRatedPowerW(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 font-bold mb-1">Standby Power (Watts)</label>
                    <input
                      type="number"
                      required
                      value={standbyPowerW}
                      onChange={(e) => setStandbyPowerW(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="inverterCheck"
                    checked={isInverterType}
                    onChange={(e) => setIsInverterType(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0"
                  />
                  <label htmlFor="inverterCheck" className="text-slate-300 font-bold cursor-pointer">
                    Is 5-Star Inverter Appliance
                  </label>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md"
                  >
                    Save Appliance
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
