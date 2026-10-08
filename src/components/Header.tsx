import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  Building2,
  User,
  LogOut,
  ChevronDown,
  Check,
  Sun,
  Moon,
  Monitor,
  Download,
  Share,
  PlusSquare,
  X
} from 'lucide-react';
import { Household } from '../../shared/types/household';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface HeaderProps {
  households: Household[];
  activeHousehold: Household | null;
  onSelectHousehold: (household: Household) => void;
  isAdminMode: boolean;
  onToggleAdminMode: () => void;
  isLiveConnected: boolean;
  totalActiveWatts: number;
  streamMode?: 'SSE' | 'POLLING';
}

export const Header: React.FC<HeaderProps> = ({
  households,
  activeHousehold,
  onSelectHousehold,
  isAdminMode,
  onToggleAdminMode,
  isLiveConnected,
  totalActiveWatts,
  streamMode = 'SSE',
}) => {
  const { user, signOut } = useAuth();
  const { themeMode, setThemeMode, isDark } = useTheme();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);

  const getInitials = (name?: string) => {
    if (!name) return 'KH';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      await install();
    }
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50 shadow-xs dark:shadow-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 sm:gap-3">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 bg-amber-400 dark:bg-amber-400 rounded-lg flex items-center justify-center shadow-amber-400/20 shadow-md text-slate-950 font-black">
            <Zap className="w-5 h-5 fill-slate-950 text-slate-950" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white font-display">
              Kilowatt<span className="text-amber-500 dark:text-amber-400">IQ</span>
            </h1>
            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded uppercase tracking-wider hidden md:inline-block font-mono">
              v1.0.5-PWA
            </span>
          </div>
        </div>

        {/* Center: Household Selector & Realtime Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-600 rounded-lg px-2 sm:px-2.5 py-1 text-xs transition-colors">
            <Building2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
            <select
              value={activeHousehold?.id || ''}
              onChange={(e) => {
                const found = households.find(h => h.id === e.target.value);
                if (found) onSelectHousehold(found);
              }}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-100 font-bold font-display tracking-wide focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[200px] truncate"
            >
              {households.map(h => (
                <option key={h.id} value={h.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold">
                  {h.name} ({h.utilityProvider})
                </option>
              ))}
            </select>
          </div>

          <div className="hidden lg:flex items-center gap-2 bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[11px]">
            <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-600 dark:text-slate-400 font-mono font-medium">
              {isLiveConnected
                ? `${(totalActiveWatts / 1000).toFixed(2)} kW ${streamMode === 'SSE' ? '• SSE Live' : '• Polling'}`
                : 'Offline'}
            </span>
          </div>
        </div>

        {/* Right Action Controls: Install + Theme Toggle + Admin Mode + Profile */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* In-App Install Button (Shows if not already standalone) */}
          {!isInstalled && (isInstallable || isIOS) && (
            <button
              onClick={handleInstallClick}
              title="Install KilowattIQ App"
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold font-display px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 transition-all cursor-pointer active:scale-95 shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[11px] font-extrabold">{isIOS ? 'Install' : 'Install App'}</span>
            </button>
          )}

          {/* Theme Toggle (System / Light / Dark) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setThemeMode('light')}
              title="Light theme"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                themeMode === 'light'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setThemeMode('dark')}
              title="Dark theme"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                themeMode === 'dark'
                  ? 'bg-slate-800 text-amber-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setThemeMode('system')}
              title="System theme"
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                themeMode === 'system'
                  ? 'bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-400 shadow-xs'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Admin Mode Toggle */}
          <button
            onClick={onToggleAdminMode}
            className={`hidden sm:flex items-center gap-1.5 text-xs font-bold font-display px-2.5 sm:px-3 py-1.5 rounded-lg border transition-all uppercase tracking-wider cursor-pointer ${
              isAdminMode
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span className="text-[10px] font-extrabold">{isAdminMode ? 'Admin' : 'Consumer'}</span>
          </button>

          {/* User Profile Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 sm:px-2.5 py-1.5 transition-all cursor-pointer font-display"
            >
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[11px] font-black text-amber-700 dark:text-amber-300">
                {getInitials(user?.fullName)}
              </div>
              <div className="hidden sm:flex flex-col items-start text-left">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {user?.fullName || 'User'}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  {activeHousehold?.name || 'Household'}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50 divide-y divide-slate-100 dark:divide-slate-800/80"
                onMouseLeave={() => setShowUserMenu(false)}
              >
                <div className="px-4 py-2.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{user?.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{user?.email}</p>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5 inline-block font-mono">
                    {user?.role === 'ADMIN' ? 'Grid Administrator' : 'Consumer Household'}
                  </div>
                </div>

                <div className="py-2 px-4 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Appearance
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span>Theme Mode</span>
                    <span className="font-bold uppercase text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-amber-600 dark:text-amber-400">
                      {themeMode}
                    </span>
                  </div>
                </div>

                <div className="py-1">
                  <div className="px-4 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Current Household
                  </div>
                  <div className="px-4 py-1 flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span className="font-medium truncate">{activeHousehold?.name}</span>
                    <Check className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      signOut();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* iOS Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                Install on iPhone / iPad
              </h3>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              To install KilowattIQ on iOS Safari:
            </p>
            <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shrink-0">1</span>
                <span>Tap <Share className="w-3.5 h-3.5 inline text-sky-500" /> <strong>Share</strong> in Safari.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center shrink-0">2</span>
                <span>Tap <PlusSquare className="w-3.5 h-3.5 inline text-emerald-500" /> <strong>Add to Home Screen</strong>.</span>
              </div>
            </div>
            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-bold font-display cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
