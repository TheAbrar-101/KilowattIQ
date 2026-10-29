import React from 'react';
import { motion } from 'motion/react';
import { Activity, Calculator, CreditCard, Home, CalendarClock, Cpu, Lightbulb, FileSpreadsheet, Bell, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export type TabType = 'LIVE' | 'COST' | 'PAYMENTS' | 'APPLIANCES' | 'SCHEDULE' | 'DEVICES' | 'RECOMMENDATIONS' | 'REPORTS' | 'ALERTS' | 'ADMIN';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isAdminMode: boolean;
}

const tabTranslations: Record<TabType, { en: string; bn: string }> = {
  LIVE: { en: 'Live Telemetry', bn: 'লাইভ মনিটর' },
  COST: { en: 'Tariff & Cost', bn: 'খরচ ও স্ল্যাব' },
  PAYMENTS: { en: 'Bill & Top-up', bn: 'বিল ও রিচার্জ' },
  APPLIANCES: { en: 'Rooms & Load', bn: 'যন্ত্রপাতি' },
  SCHEDULE: { en: 'Off-Peak Schedule', bn: 'শিডিউলার' },
  DEVICES: { en: 'IoT Adapters', bn: 'আইওটি ডিভাইস' },
  RECOMMENDATIONS: { en: 'Saving Insights', bn: 'এআই অ্যাডভাইজর' },
  REPORTS: { en: 'Audit Reports', bn: 'অডিট রিপোর্ট' },
  ALERTS: { en: 'Alerts & Rules', bn: 'সতর্কবার্তা' },
  ADMIN: { en: 'Admin Console', bn: 'অ্যাডমিন প্যানেল' },
};

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, isAdminMode }) => {
  const { language } = useLanguage();

  const tabs: Array<{ id: TabType; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'LIVE', icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'COST', icon: <Calculator className="w-4 h-4 shrink-0" /> },
    { id: 'PAYMENTS', icon: <CreditCard className="w-4 h-4 shrink-0" /> },
    { id: 'APPLIANCES', icon: <Home className="w-4 h-4 shrink-0" /> },
    { id: 'SCHEDULE', icon: <CalendarClock className="w-4 h-4 shrink-0" /> },
    { id: 'DEVICES', icon: <Cpu className="w-4 h-4 shrink-0" /> },
    { id: 'RECOMMENDATIONS', icon: <Lightbulb className="w-4 h-4 shrink-0" /> },
    { id: 'REPORTS', icon: <FileSpreadsheet className="w-4 h-4 shrink-0" /> },
    { id: 'ALERTS', icon: <Bell className="w-4 h-4 shrink-0" /> },
    { id: 'ADMIN', icon: <ShieldAlert className="w-4 h-4 shrink-0" />, adminOnly: true },
  ];

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200" aria-label="Main Navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-1.5 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
          {tabs
            .filter(tab => !tab.adminOnly || isAdminMode)
            .map(tab => {
              const isActive = activeTab === tab.id;
              const label = tabTranslations[tab.id][language];

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  aria-label={label}
                  aria-selected={isActive}
                  role="tab"
                  className={`relative min-h-[44px] flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold font-['Outfit'] whitespace-nowrap transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                    isActive
                      ? 'text-amber-600 dark:text-amber-300 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-amber-500/15 border border-amber-500/40 rounded-xl shadow-xs"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {tab.icon}
                    <span>{label}</span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </nav>
  );
};
