import React from 'react';
import { Zap, ShieldCheck, Building2, UserCircle2 } from 'lucide-react';
import { Household } from '../../shared/types/household';

interface HeaderProps {
  households: Household[];
  activeHousehold: Household | null;
  onSelectHousehold: (household: Household) => void;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  isLiveConnected: boolean;
  totalActiveWatts: number;
}

export const Header: React.FC<HeaderProps> = ({
  households,
  activeHousehold,
  onSelectHousehold,
  isAdminMode,
  onToggleAdminMode,
  isLiveConnected,
  totalActiveWatts,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-emerald-500/20 shadow-lg text-slate-950 font-black">
            <Zap className="w-5 h-5 fill-slate-950 text-slate-950" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-white">
              Kilowatt<span className="text-emerald-500">IQ</span>
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded uppercase tracking-wider hidden sm:inline-block">
              v1.0.4-BD
            </span>
          </div>
        </div>

        {/* Center: Household Selector & Realtime Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={activeHousehold?.id || ''}
              onChange={(e) => {
                const found = households.find(h => h.id === e.target.value);
                if (found) onSelectHousehold(found);
              }}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
            >
              {households.map(h => (
                <option key={h.id} value={h.id} className="bg-slate-900 text-slate-200">
                  {h.name} ({h.utilityProvider})
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px]">
            <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-400 font-mono font-medium">
              {isLiveConnected ? `${(totalActiveWatts / 1000).toFixed(2)} kW Live` : 'Offline'}
            </span>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex flex-col items-end text-right">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Household ID</span>
            <span className="text-xs font-mono text-emerald-400 font-bold">{activeHousehold?.id || 'KH-BD-01'}</span>
          </div>

          <button
            onClick={onToggleAdminMode}
            className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border transition-all uppercase tracking-wider ${
              isAdminMode
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px]">{isAdminMode ? 'Admin View' : 'Consumer View'}</span>
          </button>

          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
            TH
          </div>
        </div>

      </div>
    </header>
  );
};
