import React from 'react';
import { AlertTriangle, Database, FlaskConical } from 'lucide-react';
import { useDataMode } from '../../context/DataModeContext';
import { useLanguage } from '../../context/LanguageContext';

export const DemoDataBanner: React.FC = () => {
  const { dataMode, isDemoData, setDataMode } = useDataMode();
  const { language } = useLanguage();

  if (!isDemoData) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-400/15 dark:bg-amber-500/15 border-b border-amber-400/40 text-amber-950 dark:text-amber-100 px-4 py-2 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start sm:items-center gap-2.5 text-xs">
          <div className="p-1.5 rounded-lg bg-amber-400/25 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5 sm:mt-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="font-['Plus_Jakarta_Sans']">
            <span className="font-bold font-['Outfit'] text-amber-900 dark:text-amber-200">
              {language === 'bn'
                ? 'ডেমো ডেটা: এটি প্রকৃত মিটার থেকে প্রাপ্ত নয়'
                : 'Demo data: not from a real meter'}
            </span>
            <span className="hidden md:inline text-amber-800/90 dark:text-amber-200/80 ml-2">
              {language === 'bn'
                ? 'লাইভ ওয়াট ও ডিভাইস ফিড সিমুলেটেড। আপনার নিজের মিটার রিডিং ব্যবহার করতে মোড পরিবর্তন করুন।'
                : 'Live wattage and IoT adapter feeds are simulated. Switch to My data to track real meter readings & SMS.'}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-1 bg-white/80 dark:bg-slate-950/90 border border-amber-400/40 rounded-xl p-1 self-start sm:self-auto shrink-0"
          role="group"
          aria-label={language === 'bn' ? 'ডেটা মোড নির্বাচন' : 'Data Mode Toggle'}
        >
          <button
            type="button"
            onClick={() => setDataMode('DEMO')}
            aria-pressed={dataMode === 'DEMO'}
            className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-['Outfit'] font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
              dataMode === 'DEMO'
                ? 'bg-amber-400 text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ডেমো' : 'Demo'}</span>
          </button>
          <button
            type="button"
            onClick={() => setDataMode('REAL')}
            aria-pressed={false}
            className="min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-['Outfit'] font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-200 hover:bg-amber-400/20 hover:text-amber-900 dark:hover:text-amber-200 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{language === 'bn' ? 'আমার ডেটা' : 'My data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
