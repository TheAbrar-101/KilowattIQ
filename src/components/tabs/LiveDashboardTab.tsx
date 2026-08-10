import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  Flame,
  TrendingUp,
  AlertTriangle,
  Sliders,
  Play,
  RotateCcw,
  Sparkles,
  Layers,
  Power,
  Tv,
  Refrigerator,
  Wind,
  Droplets,
  Microwave,
  Info
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PowerReading } from '../../../shared/types/energy';
import { Household, Appliance } from '../../../shared/types/household';

interface LiveDashboardTabProps {
  household: Household;
  liveReadings: PowerReading[];
  appliances: Appliance[];
  totalActiveWatts: number;
  activeApplianceStates?: Record<string, boolean>;
  onToggleAppliance?: (applianceId: string) => void;
  onSetTotalWatts?: (watts: number) => void;
}

export const LiveDashboardTab: React.FC<LiveDashboardTabProps> = ({
  household,
  liveReadings,
  appliances,
  totalActiveWatts,
  activeApplianceStates = {},
  onToggleAppliance,
  onSetTotalWatts,
}) => {
  const [timeRange, setTimeRange] = useState<'1H' | '12H' | '24H'>('12H');
  const [isSimulatingSurge, setIsSimulatingSurge] = useState(false);

  const currentKw = totalActiveWatts / 1000;
  const maxKw = household.sanctionedLoadKw || 4.5;
  const loadPercentage = Math.min(100, (currentKw / maxKw) * 100);

  // Dynamic status color calculation
  const getStatusColor = () => {
    if (loadPercentage > 85) return { text: 'text-rose-400', bg: 'bg-rose-500', border: 'border-rose-500/30', glow: 'shadow-rose-500/20' };
    if (loadPercentage > 60) return { text: 'text-amber-400', bg: 'bg-amber-500', border: 'border-amber-500/30', glow: 'shadow-amber-500/20' };
    return { text: 'text-emerald-400', bg: 'bg-emerald-500', border: 'border-emerald-500/30', glow: 'shadow-emerald-500/20' };
  };

  const statusStyle = getStatusColor();

  // BDT Cost estimation
  const currentHourlyCostBDT = currentKw * 7.34; // DESCO LT-A Step 4 rate
  const estimatedDailyCostBDT = currentHourlyCostBDT * 14;
  const estimatedMonthlyCostBDT = currentKw * 18 * 30 * 6.95;

  // Generate chart data from liveReadings or dynamic fallback
  const chartData = (liveReadings.length > 0 ? liveReadings : [
    { timestamp: '12:00', powerWatts: 820 },
    { timestamp: '13:00', powerWatts: 950 },
    { timestamp: '14:00', powerWatts: 1200 },
    { timestamp: '15:00', powerWatts: 1650 },
    { timestamp: '16:00', powerWatts: 1400 },
    { timestamp: '17:00', powerWatts: 2100 },
    { timestamp: '18:00', powerWatts: 3200 },
    { timestamp: '19:00', powerWatts: 2800 },
    { timestamp: '20:00', powerWatts: totalActiveWatts },
  ]).map((r, i) => ({
    time: typeof r.timestamp === 'string' ? r.timestamp.slice(-5) : `${i * 2}:00`,
    watts: r.powerWatts || totalActiveWatts,
    kw: Number(((r.powerWatts || totalActiveWatts) / 1000).toFixed(2)),
  }));

  // Handle surge trigger
  const handleSurge = () => {
    setIsSimulatingSurge(true);
    if (onSetTotalWatts) {
      onSetTotalWatts(totalActiveWatts + 1650);
    }
    setTimeout(() => {
      setIsSimulatingSurge(false);
    }, 4000);
  };

  const getApplianceIcon = (category: string) => {
    switch (category) {
      case 'AIR_CONDITIONER': return <Wind className="w-4 h-4" />;
      case 'REFRIGERATOR': return <Refrigerator className="w-4 h-4" />;
      case 'TELEVISION': return <Tv className="w-4 h-4" />;
      case 'WATER_HEATER': return <Droplets className="w-4 h-4" />;
      case 'MICROWAVE': return <Microwave className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner Alert if load > 80% */}
      <AnimatePresence>
        {loadPercentage > 80 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-rose-950/80 border border-rose-800 rounded-2xl p-3.5 flex items-center justify-between text-xs text-rose-200 shadow-lg shadow-rose-950/50"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-900 rounded-xl text-rose-300 animate-pulse">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-rose-100 uppercase tracking-wide block">
                  High Load Warning ({loadPercentage.toFixed(0)}% of Sanctioned Capacity)
                </span>
                <span className="text-rose-300 text-[11px]">
                  Current power draw ({currentKw.toFixed(2)} kW) is approaching sanctioned limit of {maxKw} kW.
                </span>
              </div>
            </div>
            <button
              onClick={() => onSetTotalWatts && onSetTotalWatts(1200)}
              className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-md shrink-0"
            >
              Reduce Load Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Interactive Telemetry Dial & Quick Stat Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Col: Interactive Animated Dial & Power Gauge (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                <Zap className="w-4 h-4 fill-emerald-400" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Meter Gauge</h3>
                <p className="text-[10px] text-slate-400">AMI Prepaid Gateway Feed</p>
              </div>
            </div>

            <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${statusStyle.border} ${statusStyle.text} bg-slate-950 font-mono tracking-wider uppercase`}>
              {loadPercentage > 85 ? 'OVERLOAD RISK' : loadPercentage > 60 ? 'MODERATE LOAD' : 'OPTIMAL LOAD'}
            </span>
          </div>

          {/* Radial Power Dial Visual */}
          <div className="py-6 flex flex-col items-center justify-center relative">
            
            {/* Animated Gauge Ring Container */}
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* Outer Decorative Ring */}
              <div className="absolute inset-0 rounded-full border-2 border-slate-800/80" />

              {/* Glowing Arc Background */}
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-slate-800"
                  fill="transparent"
                />
                <motion.circle
                  cx="96"
                  cy="96"
                  r="80"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeDasharray="502"
                  strokeDashoffset={502 - (502 * Math.min(100, loadPercentage)) / 100}
                  strokeLinecap="round"
                  className={`${statusStyle.text} transition-all duration-700 ease-out`}
                  fill="transparent"
                />
              </svg>

              {/* Center Text Metrics */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <motion.span
                  key={totalActiveWatts}
                  initial={{ scale: 0.9, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-4xl font-black text-white tracking-tighter font-mono"
                >
                  {currentKw.toFixed(2)}
                  <span className="text-sm font-bold text-slate-400 ml-1">kW</span>
                </motion.span>
                <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                  {totalActiveWatts} <span className="text-[9px] uppercase">Watts</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500 mt-1 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                  {loadPercentage.toFixed(0)}% of {maxKw} kW Limit
                </span>
              </div>
            </div>

            {/* Interactive Load Adjuster Slider */}
            <div className="w-full mt-4 space-y-1.5 px-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-emerald-400" />
                  Live Wattage Simulator
                </span>
                <span className="font-mono text-emerald-400">{totalActiveWatts} W</span>
              </div>
              <input
                type="range"
                min="100"
                max="5000"
                step="50"
                value={totalActiveWatts}
                onChange={(e) => onSetTotalWatts && onSetTotalWatts(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>100W Baseline</span>
                <span>2500W Standard</span>
                <span>5000W Max Surge</span>
              </div>
            </div>
          </div>

          {/* Quick Action Simulator Button */}
          <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
            <button
              onClick={handleSurge}
              disabled={isSimulatingSurge}
              className="flex-1 flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-amber-400 text-xs font-bold py-2 px-3 rounded-xl transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSimulatingSurge ? 'Surge Injected...' : 'Simulate Evening Peak Surge'}</span>
            </button>
            <button
              onClick={() => onSetTotalWatts && onSetTotalWatts(1200)}
              title="Reset Baseline Load"
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Col: 4 Core Stat Cards + Live Recharts Load Distribution (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* 4 Stat Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* Estimated Today Cost */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today Est. Cost</span>
              <div className="my-1">
                <span className="text-xl font-black text-white tracking-tight font-mono">
                  ৳{estimatedDailyCostBDT.toFixed(0)}
                </span>
                <span className="text-[10px] font-bold text-slate-500 ml-1">BDT</span>
              </div>
              <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Step 4 LT-A
              </span>
            </div>

            {/* Projected Monthly */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Projected Bill</span>
              <div className="my-1">
                <span className="text-xl font-black text-amber-400 tracking-tight font-mono">
                  ৳{estimatedMonthlyCostBDT.toFixed(0)}
                </span>
                <span className="text-[10px] font-bold text-slate-500 ml-1">EST</span>
              </div>
              <span className="text-[9px] text-slate-400 font-medium">
                Target: ৳{household.monthlyBudgetBDT} BDT
              </span>
            </div>

            {/* Vampire Leak */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Vampire Leak</span>
              <div className="my-1">
                <span className="text-xl font-black text-rose-400 tracking-tight font-mono">
                  42 <span className="text-xs font-normal text-slate-400">Watts</span>
                </span>
              </div>
              <span className="text-[9px] text-rose-400/90 font-medium flex items-center gap-1">
                <Flame className="w-3 h-3" />
                ~৳135 / Month Leak
              </span>
            </div>

            {/* Grid Power Factor */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Power Quality</span>
              <div className="my-1">
                <span className="text-xl font-black text-emerald-400 tracking-tight font-mono">
                  0.96 <span className="text-xs font-normal text-slate-400">PF</span>
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-medium">
                221.8 V • 50.0 Hz
              </span>
            </div>

          </div>

          {/* Interactive Recharts Load Area Graph */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Real-time Telemetry Load Curve</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                </h4>
                <p className="text-[10px] text-slate-400">Active wattage sampling across time</p>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
                {(['1H', '12H', '24H'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2 py-0.5 rounded font-bold font-mono transition-all ${
                      timeRange === r
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Recharts Area Container */}
            <div className="h-48 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: '#fff',
                    }}
                    formatter={(val: any) => [`${val} kW`, 'Power Load']}
                  />
                  <Area
                    type="monotone"
                    dataKey="kw"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#powerGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>

      {/* Interactive Appliance Quick Switchboard Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Power className="w-4 h-4 text-emerald-400" />
              <span>Interactive Appliance Switchboard</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Toggle virtual household loads to test real-time wattage and BDT cost impact
            </p>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            {appliances.length} Registered Appliances
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {appliances.slice(0, 6).map((app) => {
            const isOn = activeApplianceStates[app.id] ?? true;
            return (
              <motion.button
                key={app.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => onToggleAppliance && onToggleAppliance(app.id)}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isOn
                    ? 'bg-slate-950 border-emerald-500/40 shadow-emerald-500/10 shadow-lg'
                    : 'bg-slate-950/60 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-1.5 rounded-lg ${isOn ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                    {getApplianceIcon(app.category)}
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                    isOn ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-900 text-slate-500'
                  }`}>
                    {isOn ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-bold text-white block truncate">{app.name}</span>
                  <span className="text-[10px] font-mono font-bold text-amber-400 block mt-0.5">
                    {app.ratedPowerW} Watts
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* DESCO LT-A Tiered Tariff Slab Tracker Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">DESCO Residential LT-A Tariff Slab Step Bar</h4>
              <p className="text-[10px] text-slate-400">BERC 2026 Tiered Pricing Structure</p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-400 font-mono">Current Position: Slab 4 (245 kWh)</span>
        </div>

        {/* Multi-step progress bar */}
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px]">
          {[
            { label: '0-50', rate: '৳4.35', active: true, desc: 'Lifeline' },
            { label: '51-75', rate: '৳4.85', active: true, desc: 'Slab 1' },
            { label: '76-200', rate: '৳6.63', active: true, desc: 'Slab 2' },
            { label: '201-300', rate: '৳6.95', active: true, desc: 'Slab 3 (CURRENT)' },
            { label: '301-400', rate: '৳7.34', active: false, desc: 'Slab 4' },
            { label: '401-600', rate: '৳11.51', active: false, desc: 'Slab 5' },
            { label: '601+', rate: '৳13.26', active: false, desc: 'Upper Tier' },
          ].map((slab, i) => (
            <div
              key={i}
              className={`p-2 rounded-xl border flex flex-col justify-between transition-all ${
                slab.desc.includes('CURRENT')
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-md ring-1 ring-amber-500/50'
                  : slab.active
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                  : 'bg-slate-950 border-slate-800/80 text-slate-500'
              }`}
            >
              <span className="font-mono font-bold text-[11px] block">{slab.label} kWh</span>
              <span className="font-bold text-xs block my-0.5">{slab.rate}</span>
              <span className="text-[8px] uppercase tracking-wider font-semibold opacity-80">{slab.desc.replace(' (CURRENT)', '')}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
