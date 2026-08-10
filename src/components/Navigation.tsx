import React from 'react';
import { motion } from 'motion/react';
import { Activity, Calculator, Home, Cpu, Lightbulb, FileSpreadsheet, ShieldAlert } from 'lucide-react';

export type TabType = 'LIVE' | 'COST' | 'APPLIANCES' | 'DEVICES' | 'RECOMMENDATIONS' | 'REPORTS' | 'ADMIN';

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
    { id: 'DEVICES', label: 'IoT Adapters', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'RECOMMENDATIONS', label: 'Saving Insights', icon: <Lightbulb className="w-3.5 h-3.5" /> },
    { id: 'REPORTS', label: 'Audit Reports', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'ADMIN', label: 'Admin Console', icon: <ShieldAlert className="w-3.5 h-3.5" />, adminOnly: true },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-800 shadow-inner">
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
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-emerald-500/10 border border-emerald-500/30 rounded-xl"
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
