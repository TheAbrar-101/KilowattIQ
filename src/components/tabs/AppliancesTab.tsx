import React, { useState } from 'react';
import { Home, Flame, ArrowRightLeft, Plus } from 'lucide-react';
import { Household, Room, Appliance } from '../../../shared/types/household';
import { VampirePowerEngine } from '../../../backend/engine/VampirePowerEngine';
import { ROICalculator } from '../../../backend/engine/ROICalculator';

interface AppliancesTabProps {
  household: Household;
  rooms: Room[];
  appliances: Appliance[];
}

export const AppliancesTab: React.FC<AppliancesTabProps> = ({ household, rooms, appliances }) => {
  // ROI Calculator state
  const [currentWatts, setCurrentWatts] = useState<number>(1800);
  const [proposedWatts, setProposedWatts] = useState<number>(1100);
  const [usageHours, setUsageHours] = useState<number>(7);
  const [investmentBDT, setInvestmentBDT] = useState<number>(62000);

  const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);

  const roiResult = ROICalculator.calculateUpgradeROI(
    '1.5 Ton Non-Inverter AC',
    '1.5 Ton 5-Star Inverter AC',
    currentWatts,
    proposedWatts,
    usageHours,
    investmentBDT,
    8.02
  );

  return (
    <div className="space-y-4">
      
      {/* Top Section: Room & Appliance Inventory */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Home className="w-4 h-4 text-emerald-400" />
              <span>Room & Appliance Inventory Audit</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Per-room electrical appliances and standby power tracking
            </p>
          </div>
          <button className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-emerald-500/20 shadow-md">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Appliance</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rooms.map((room) => {
            const roomApps = appliances.filter(a => a.roomId === room.id);
            const totalRoomWatts = roomApps.reduce((acc, a) => acc + a.ratedPowerW, 0);

            return (
              <div key={room.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-xs text-slate-200">{room.name}</span>
                  <span className="text-[11px] font-mono font-bold text-amber-400">{totalRoomWatts} W Total</span>
                </div>

                <div className="space-y-1.5">
                  {roomApps.map((app) => (
                    <div key={app.id} className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded-lg border border-slate-800/80">
                      <div>
                        <span className="font-bold text-[11px] text-slate-200 block">{app.name}</span>
                        <span className="text-[10px] text-slate-400">
                          {app.ratedPowerW}W | {app.isInverterType ? 'Inverter ✓' : 'Non-Inverter'}
                        </span>
                      </div>
                      {app.isVampireRisk && (
                        <span className="text-[9px] bg-rose-950 text-rose-400 border border-rose-900 px-1.5 py-0.5 rounded font-bold uppercase">
                          Standby {app.standbyPowerW}W
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vampire Power Analysis & ROI Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Left: Vampire Power Standby Loss Audit */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Standby / Vampire Load Audit</span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Identifies continuous phantom loads leaking energy off-hours
            </p>
          </div>

          <div className="space-y-2">
            {vampireReports.map((v) => (
              <div key={v.applianceId} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-[11px] text-slate-200">{v.applianceName}</p>
                  <p className="text-[10px] text-slate-400">{v.roomName} • Continuous Draw: {v.standbyWatts}W</p>
                </div>
                <div className="text-right">
                  <span className="text-rose-400 font-bold font-mono block text-xs">৳{v.monthlyWastedBDT} / mo</span>
                  <span className="text-[9px] text-slate-400">৳{v.annualWastedBDT} / year</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Interactive Appliance Upgrade ROI & Payback Calculator */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
              <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-400" />
              <span>Appliance Replacement ROI & Payback Calculator</span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Simulates financial return on upgrading to energy-efficient models (e.g. Inverter AC)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Old Appliance (W)</label>
              <input
                type="number"
                value={currentWatts}
                onChange={(e) => setCurrentWatts(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Inverter / Efficient (W)</label>
              <input
                type="number"
                value={proposedWatts}
                onChange={(e) => setProposedWatts(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Usage (Hours / Day)</label>
              <input
                type="number"
                value={usageHours}
                onChange={(e) => setUsageHours(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Upgrade Cost (BDT ৳)</label>
              <input
                type="number"
                value={investmentBDT}
                onChange={(e) => setInvestmentBDT(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* ROI Results Box */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[9px] font-bold uppercase block">MONTHLY SAVINGS</span>
                <span className="text-base font-bold text-emerald-400 font-mono">৳{roiResult.monthlySavingsBDT}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[9px] font-bold uppercase block">PAYBACK PERIOD</span>
                <span className="text-base font-bold text-amber-400 font-mono">{roiResult.paybackPeriodMonths} Months</span>
              </div>
              <div>
                <span className="text-slate-400 text-[9px] font-bold uppercase block">ANNUAL SAVINGS</span>
                <span className="text-xs font-bold text-slate-200 font-mono">৳{roiResult.annualSavingsBDT}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[9px] font-bold uppercase block">5-YEAR NET SAVINGS</span>
                <span className="text-xs font-bold text-emerald-400 font-mono">৳{roiResult.fiveYearNetSavingsBDT}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
