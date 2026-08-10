import React, { useState } from 'react';
import { Zap, ShieldCheck, Building2, User, LogOut, ChevronDown, Check } from 'lucide-react';
import { Household } from '../../shared/types/household';
import { useAuth } from '../context/AuthContext';

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
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);

  const getInitials = (name?: string) => {
    if (!name) return 'KH';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  };

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

          {/* User Profile Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg px-2.5 py-1 transition-all cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold text-emerald-400">
                {getInitials(user?.fullName)}
              </div>
              <div className="hidden sm:flex flex-col items-start text-left">
                <span className="text-xs font-bold text-slate-200 leading-tight">
                  {user?.fullName || 'Authenticated User'}
                </span>
                <span className="text-[10px] text-slate-400 leading-tight">
                  {activeHousehold?.name || 'Household Owner'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50 divide-y divide-slate-800/80"
                onMouseLeave={() => setShowUserMenu(false)}
              >
                <div className="px-4 py-2.5">
                  <p className="text-xs font-bold text-white">{user?.fullName}</p>
                  <p className="text-xs text-slate-400 font-mono truncate">{user?.email}</p>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5 inline-block">
                    {user?.role === 'ADMIN' ? 'Grid Administrator' : 'Authenticated Household Member'}
                  </div>
                </div>

                <div className="py-1">
                  <div className="px-4 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Current Household
                  </div>
                  <div className="px-4 py-1 flex items-center justify-between text-xs text-slate-300">
                    <span className="font-medium truncate">{activeHousehold?.name}</span>
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      signOut();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
