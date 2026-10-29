import React, { useState } from 'react';
import {
  Zap,
  Building2,
  ChevronDown,
  Check,
  Sun,
  Moon,
  Monitor,
  Download,
  Share,
  PlusSquare,
  X,
  Crown,
  Users,
  FileSearch,
  ShieldAlert,
  History,
  UserPlus,
  Clock,
  LogOut,
  Sliders,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { Household } from '../../shared/types/household';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  UserRole,
  ROLE_DEFINITIONS,
  normalizeRole,
  getRemainingAuditorHours,
} from '../server/auth/roles';
import { InviteMemberModal } from './members/InviteMemberModal';
import { AuditLogModal } from './audit/AuditLogModal';

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
  const { user, signOut, switchRole, token } = useAuth();
  const { themeMode, setThemeMode } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showRoleMenu, setShowRoleMenu] = useState<boolean>(false);
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Derive current role
  const currentRole: UserRole = normalizeRole(user?.householdRole || user?.role);
  const roleMeta = ROLE_DEFINITIONS[currentRole] || ROLE_DEFINITIONS.owner;
  const auditorHoursLeft = currentRole === 'utility_auditor' ? getRemainingAuditorHours(user?.auditorExpiresAt) : null;

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

  const handleSwitchRole = async (targetRole: UserRole) => {
    setShowRoleMenu(false);
    await switchRole(targetRole);
  };

  const renderRoleIcon = (role: UserRole, className: string = 'w-3.5 h-3.5') => {
    switch (role) {
      case 'owner':
        return <Crown className={className} />;
      case 'family_member':
        return <Users className={className} />;
      case 'utility_auditor':
        return <FileSearch className={className} />;
      case 'admin':
        return <ShieldAlert className={className} />;
      default:
        return <Users className={className} />;
    }
  };

  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 shadow-xs dark:shadow-md transition-colors duration-200">
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
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded uppercase tracking-wider hidden lg:inline-block font-mono">
                v1.0.5-PWA
              </span>
            </div>
          </div>

          {/* Center: Household Selector & Realtime Badge & Role Badge */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Household Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-600 rounded-lg px-2 sm:px-2.5 py-1 text-xs transition-colors">
              <Building2 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <select
                value={activeHousehold?.id || ''}
                onChange={(e) => {
                  const found = households.find(h => h.id === e.target.value);
                  if (found) onSelectHousehold(found);
                }}
                className="bg-transparent text-xs text-slate-800 dark:text-slate-100 font-bold font-display tracking-wide focus:outline-none cursor-pointer max-w-[110px] sm:max-w-[170px] truncate"
              >
                {households.map(h => (
                  <option key={h.id} value={h.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold">
                    {h.name} ({h.utilityProvider})
                  </option>
                ))}
              </select>
            </div>

            {/* Role Badge in Header with Interactive Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                title={`Current Role: ${roleMeta.label}. Click to switch role simulator.`}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold font-display transition-all cursor-pointer shadow-2xs ${roleMeta.color.bg} ${roleMeta.color.text} ${roleMeta.color.border} ${roleMeta.color.darkBg} ${roleMeta.color.darkText} ${roleMeta.color.darkBorder}`}
              >
                {renderRoleIcon(currentRole, 'w-3.5 h-3.5')}
                <span className="font-extrabold whitespace-nowrap">{roleMeta.badgeText}</span>
                {currentRole === 'utility_auditor' && auditorHoursLeft !== null && (
                  <span className="text-[10px] font-mono opacity-80">({auditorHoursLeft}h)</span>
                )}
                <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
              </button>

              {/* Role Switcher Popover */}
              {showRoleMenu && (
                <div
                  className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50 animate-fadeIn"
                  onMouseLeave={() => setShowRoleMenu(false)}
                >
                  <div className="px-3.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider font-display">
                      Multi-Role Access Simulator
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Switch active role to verify Supabase RLS policies and role-gated controls.
                    </p>
                  </div>

                  <div className="py-1 px-1.5 space-y-1">
                    {(['owner', 'family_member', 'utility_auditor', 'admin'] as UserRole[]).map((roleKey) => {
                      const def = ROLE_DEFINITIONS[roleKey];
                      const isCurrent = currentRole === roleKey;

                      return (
                        <button
                          key={roleKey}
                          onClick={() => handleSwitchRole(roleKey)}
                          className={`w-full text-left p-2 rounded-lg flex items-start gap-2.5 transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-500/15 border border-amber-500/30'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-transparent'
                          }`}
                        >
                          <div className={`p-1 rounded-md mt-0.5 ${def.color.bg} ${def.color.text} ${def.color.darkBg} ${def.color.darkText}`}>
                            {renderRoleIcon(roleKey, 'w-3.5 h-3.5')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-900 dark:text-white font-display">
                                {def.label}
                              </span>
                              {isCurrent && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                              {def.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>RLS is the Source of Truth</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">PostgreSQL RLS</span>
                  </div>
                </div>
              )}
            </div>

            {/* Realtime Live Watts Badge */}
            <div className="hidden xl:flex items-center gap-2 bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-[11px]">
              <div className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-slate-600 dark:text-slate-400 font-mono font-medium">
                {isLiveConnected
                  ? `${(totalActiveWatts / 1000).toFixed(2)} kW ${streamMode === 'SSE' ? '• SSE Live' : '• Polling'}`
                  : 'Offline'}
              </span>
            </div>
          </div>

          {/* Right Action Controls: Invite + Audit Trail + Install + Theme + Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Invite Member Button */}
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              aria-label={language === 'bn' ? 'সদস্যদের আমন্ত্রণ জানান' : 'Invite household member or auditor'}
              title={language === 'bn' ? 'সদস্য আমন্ত্রণ' : 'Invite family member or utility auditor'}
              className="min-h-[44px] flex items-center gap-1.5 text-xs font-semibold font-['Outfit'] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <UserPlus className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="hidden sm:inline text-xs">{language === 'bn' ? 'সদস্যবৃন্দ' : 'Members'}</span>
            </button>

            {/* Audit Trail Button */}
            <button
              type="button"
              onClick={() => setShowAuditModal(true)}
              aria-label={language === 'bn' ? 'নিরাপত্তা ও কমপ্লায়েন্স অডিট লগ' : 'Security & Compliance Audit Trail'}
              title={language === 'bn' ? 'অডিট লগ' : 'Security & Compliance Audit Trail'}
              className="min-h-[44px] flex items-center gap-1.5 text-xs font-semibold font-['Outfit'] px-2.5 sm:px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-400"
            >
              <History className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              <span className="hidden sm:inline text-xs">{language === 'bn' ? 'অডিট লগ' : 'Audit Log'}</span>
            </button>

            {/* In-App Install Button */}
            {!isInstalled && (isInstallable || isIOS) && (
              <button
                type="button"
                onClick={handleInstallClick}
                aria-label={isIOS ? 'Install PWA' : 'Install KilowattIQ App'}
                title="Install KilowattIQ App"
                className="min-h-[44px] hidden md:flex items-center gap-1.5 text-xs font-semibold font-['Outfit'] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 transition-all cursor-pointer active:scale-95 shadow-xs focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              >
                <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold">{isIOS ? (language === 'bn' ? 'ইনস্টল' : 'Install') : (language === 'bn' ? 'অ্যাপ ইনস্টল' : 'Install App')}</span>
              </button>
            )}

            {/* Global Language Toggle (English <-> বাংলা) */}
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language === 'en' ? 'বাংলা ভাষায় পরিবর্তন করুন' : 'Switch to English language'}
              title={language === 'en' ? 'বাংলায় দেখুন' : 'Switch to English'}
              className="min-h-[44px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 text-xs font-semibold font-['Outfit'] text-slate-800 dark:text-slate-100 flex items-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-2xs"
            >
              <Globe className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="font-bold">{language === 'en' ? 'বাংলা' : 'EN'}</span>
            </button>

            {/* Theme Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5" role="group" aria-label="Theme Mode Selection">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                title="Light theme"
                aria-label="Light theme"
                className={`min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center p-1.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                  themeMode === 'light'
                    ? 'bg-white dark:bg-slate-800 text-amber-500 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                title="Dark theme"
                aria-label="Dark theme"
                className={`min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center p-1.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                  themeMode === 'dark'
                    ? 'bg-slate-800 text-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('system')}
                title="System theme"
                aria-label="System theme"
                className={`min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center p-1.5 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${
                  themeMode === 'system'
                    ? 'bg-white dark:bg-slate-800 text-amber-500 dark:text-amber-400 shadow-xs'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* User Profile Menu Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-label="Open User Profile and Account Menu"
                className="min-h-[44px] flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-950 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl px-2 sm:px-2.5 py-1.5 transition-all cursor-pointer font-['Outfit'] font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              >
                <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-[11px] font-black text-amber-700 dark:text-amber-300">
                  {getInitials(user?.fullName)}
                </div>
                <div className="hidden sm:flex flex-col items-start text-left">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {user?.fullName || 'User'}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    {roleMeta.badgeText}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400" />
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
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-display ${roleMeta.color.bg} ${roleMeta.color.text} ${roleMeta.color.border} ${roleMeta.color.darkBg} ${roleMeta.color.darkText} ${roleMeta.color.darkBorder}`}>
                        {roleMeta.badgeText}
                      </span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowInviteModal(true);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4 text-amber-500" />
                      <span>Manage Household Members</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowAuditModal(true);
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <History className="w-4 h-4 text-purple-500" />
                      <span>View Audit Log Trail</span>
                    </button>
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

      {/* Member Invite Modal */}
      {activeHousehold && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          household={activeHousehold}
          currentUserRole={currentRole}
          token={token}
        />
      )}

      {/* Audit Log Modal */}
      {activeHousehold && (
        <AuditLogModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          household={activeHousehold}
          currentUserRole={currentRole}
          token={token}
        />
      )}
    </>
  );
};
