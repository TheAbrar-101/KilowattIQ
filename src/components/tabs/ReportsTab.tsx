import React from 'react';
import { FileSpreadsheet, Download, Printer, CheckCircle, FileText } from 'lucide-react';
import { Household } from '../../../shared/types/household';

interface ReportsTabProps {
  household: Household;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ household }) => {
  const handleExportCSV = () => {
    window.open(`/api/v1/reports/export?householdId=${household.id}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Energy Audit Reports & CSV Export</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Generate official energy audit summaries for household accounting or utility disputes
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-emerald-500/20 shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV Energy Audit</span>
          </button>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 text-xs">Export Report Metadata Summary</span>
            <span className="text-emerald-400 font-mono text-[10px] font-bold uppercase bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
              STATUS: READY
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300 text-[11px] font-mono">
            <div>
              <p><span className="text-slate-500 font-sans font-bold uppercase text-[9px] block">Household</span> {household.name}</p>
              <p className="mt-1"><span className="text-slate-500 font-sans font-bold uppercase text-[9px] block">Provider</span> {household.utilityProvider}</p>
              <p className="mt-1"><span className="text-slate-500 font-sans font-bold uppercase text-[9px] block">Account Serial</span> {household.accountNumber}</p>
            </div>
            <div>
              <p><span className="text-slate-500 font-sans font-bold uppercase text-[9px] block">Sanctioned Capacity</span> {household.sanctionedLoadKw} kW</p>
              <p className="mt-1"><span className="text-slate-500 font-sans font-bold uppercase text-[9px] block">Includes</span> Slab Breakdown, Vampire Audit, ROI Logs</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
