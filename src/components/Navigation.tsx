import React from 'react';
import { motion } from 'motion/react';
import { Activity, Calculator, Home, CalendarClock, Cpu, Lightbulb, FileSpreadsheet, Bell, ShieldAlert } from 'lucide-react';

export type TabType = 'LIVE' | 'COST' | 'APPLIANCES' | 'SCHEDULE' | 'DEVICES' | 'RECOMMENDATIONS' | 'REPORTS' | 'ALERTS' | 'ADMIN';

interface NavigationProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  isAdminMode: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onSelectTab, isAdminMode }) => {
  const tabs: Array<{ id: TabType; label: string; icon: React.ReactNode; adminOnly?: boolean }> = [
    { id: 'LIVE', label: 'Live Telemetry', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'COST', label: 'Tariff & Cost', icon: <Calculator className="w-3.5 h-3.5" /> },
    { id: 'APPLIANCES', label: 'Rooms & Load', icon: <Home className="w-3.5 h-3.5" /> },
    { id: 'SCHEDULE', label: 'Off-Peak Schedule', icon: <CalendarClock className="w-3.5 h-3.5" /> },
    { id: 'DEVICES', label: 'IoT Adapters', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'RECOMMENDATIONS', label: 'Saving Insights', icon: <Lightbulb className="w-3.5 h-3.5" /> },
    { id: 'REPORTS', label: 'Audit Reports', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'ALERTS', label: 'Alerts & Rules', icon: <Bell className="w-3.5 h-3.5" /> },
    { id: 'ADMIN', label: 'Admin Console', icon: <ShieldAlert className="w-3.5 h-3.5" />, adminOnly: true },
  ];

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-2 overflow-x-auto py-2 scrollbar-none">
          {tabs
            .filter(tab => !tab.adminOnly || isAdminMode)
            .map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold tracking-wide whitespace-nowrap transition-all cursor-pointer font-display ${
                    isActive
                      ? 'text-amber-800 dark:text-amber-300 font-extrabold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
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
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </nav>
  );
};
