import React from 'react';
import { Zap, Gauge, Flame, Radio, TrendingUp, Cpu, Tv, Refrigerator, Wind } from 'lucide-react';
import { PowerReading } from '../../../shared/types/energy';
import { Household, Appliance } from '../../../shared/types/household';

interface LiveDashboardTabProps {
  household: Household;
  liveReadings: PowerReading[];
  appliances: Appliance[];
  totalActiveWatts: number;
}

export const LiveDashboardTab: React.FC<LiveDashboardTabProps> = ({
  household,
  liveReadings,
  appliances,
  totalActiveWatts,
}) => {
  const currentKw = totalActiveWatts / 1000;
  const loadPercentage = Math.min(100, (currentKw / household.sanctionedLoadKw) * 100);

  // Calculate estimated daily cost based on current power load (BDT)
  const currentHourlyCostBDT = currentKw * 8.02; // Average step 4 rate
  const estimatedTodayCostBDT = currentHourlyCostBDT * 12;
  const estimatedMonthlyCostBDT = currentKw * 24 * 30 * 6.34;

  // Mock bar height percentages for 12 hours load distribution
  const loadProfileBars = [30, 25, 35, 60, 80, 95, 75, 40, 45, 90, 50, 30];

  return (
    <div className="space-y-4">
      {/* Overview Top Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Live Power Draw */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Live Power Draw</p>
            <h2 className="text-3xl font-black text-white tracking-tighter">
              {currentKw.toFixed(2)} <span className="text-sm font-medium text-slate-500">kW</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 mt-2">
            <Zap className="w-3.5 h-3.5 fill-emerald-500 text-emerald-500" />
            <span>{totalActiveWatts.toFixed(0)} W • 12% Efficiency Gain</span>
          </div>
        </div>

        {/* Current Month Cost */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Month Cost</p>
            <h2 className="text-3xl font-black text-white tracking-tighter">
              ৳{estimatedTodayCostBDT.toFixed(0)} <span className="text-sm font-medium text-slate-500">BDT</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-amber-500 mt-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Target Cap: ৳{household.monthlyBudgetBDT} BDT</span>
          </div>
        </div>

        {/* Predicted Bill */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Predicted Bill</p>
            <h2 className="text-3xl font-black text-white tracking-tighter">
              ৳{estimatedMonthlyCostBDT.toFixed(0)} <span className="text-sm font-medium text-slate-500">EST</span>
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Based on DESCO Slab 4 rates</p>
        </div>

        {/* Vampire Load */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Vampire Load</p>
            <h2 className="text-3xl font-black text-emerald-400 tracking-tighter">
              42 <span className="text-sm font-medium text-slate-500 uppercase">Watts</span>
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Standby devices in Main Circuit</p>
        </div>

      </div>

      {/* Main Load Distribution Chart & Slab Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Real-time Load Distribution (24h) Chart */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Real-time Load Distribution (24h)</h3>
              <div className="flex gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Baseline
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Predicted
                </span>
              </div>
            </div>

            {/* Bar Chart Container */}
            <div className="relative flex items-end justify-between h-40 gap-1.5 pt-8 px-2 border-b border-slate-800 pb-2">
              {loadProfileBars.map((height, idx) => (
                <div
                  key={idx}
                  className={`flex-1 rounded-t-sm transition-all duration-300 ${
                    idx >= 4 && idx <= 9
                      ? 'bg-emerald-500/30 border-t-2 border-emerald-500'
                      : 'bg-slate-800 opacity-40'
                  }`}
                  style={{ height: `${height}%` }}
                />
              ))}
              <div className="absolute inset-x-0 top-0 border-b border-slate-800 border-dashed" />
              <div className="absolute inset-x-0 top-1/2 border-b border-slate-800 border-dashed" />
            </div>
          </div>

          {/* Quick Metrics Cards Below Chart */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Peak Load</p>
              <p className="text-base font-bold text-white font-mono">
                {(household.sanctionedLoadKw * 0.9).toFixed(1)} kW <span className="text-[9px] text-slate-400 font-normal">7:12 PM</span>
              </p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Daily Avg</p>
              <p className="text-base font-bold text-white font-mono">{currentKw.toFixed(2)} kW</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Devices On</p>
              <p className="text-base font-bold text-white font-mono">{appliances.length} / {appliances.length + 3}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Savings Potential</p>
              <p className="text-base font-bold text-emerald-400 font-mono">৳450 / mo</p>
            </div>
          </div>
        </div>

        {/* Slab Calculator Panel */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-sm font-bold text-white mb-3">Slab Tariff Steps (DESCO LT-A)</h3>
            <div className="space-y-1.5 text-xs">
              
              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Slab 1 (0-75)</span>
                  <span className="text-xs font-mono text-emerald-400">৳4.63 / kWh</span>
                </div>
                <div className="w-10 h-1.5 bg-emerald-500 rounded-full" />
              </div>

              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Slab 2 (76-200)</span>
                  <span className="text-xs font-mono text-emerald-400">৳5.26 / kWh</span>
                </div>
                <div className="w-10 h-1.5 bg-emerald-500 rounded-full" />
              </div>

              <div className="p-2 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Slab 3 (201-300)</span>
                  <span className="text-xs font-mono text-emerald-400">৳7.20 / kWh</span>
                </div>
                <div className="w-10 h-1.5 bg-emerald-500 rounded-full" />
              </div>

              <div className="p-2 bg-slate-800/40 rounded-lg border border-emerald-500/40 flex items-center justify-between ring-1 ring-emerald-500/20">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">Current (301-400)</span>
                  <span className="text-xs font-mono text-emerald-400">৳8.02 / kWh</span>
                </div>
                <div className="w-10 h-1.5 bg-emerald-500 rounded-full relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1/2 h-full bg-emerald-400" />
                </div>
              </div>

              <div className="p-2 bg-slate-950/50 rounded-lg border border-slate-800/50 flex items-center justify-between opacity-50">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Next (401-600)</span>
                  <span className="text-xs font-mono text-slate-400">৳12.67 / kWh</span>
                </div>
              </div>

            </div>
          </div>

          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs">
            <p className="text-[10px] leading-tight text-emerald-300 font-medium">
              Maintain current consumption level to avoid Slab 5 jump (+58% cost per unit).
            </p>
          </div>
        </div>

      </div>

      {/* Connected IoT Device Telemetry Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
            <span>Active Connected Appliances & Adapters</span>
            <span className="text-xs font-normal text-slate-500">({liveReadings.length} Feeds Active)</span>
          </h3>
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">
            Voltage: 221.4V • 50.0Hz
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {appliances.map((app) => (
            <div key={app.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col items-center text-center gap-1">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg mb-1">
                <Zap className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-bold text-white truncate w-full">{app.name}</span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">{app.ratedPowerW} W</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
