import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
  Zap,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Building2,
  Receipt,
  Layers,
  Sparkle,
  Globe
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Household } from '../../../shared/types/household';
import { FullReportData } from '../../../shared/types/energy';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface ReportsTabProps {
  household: Household;
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export const ReportsTab: React.FC<ReportsTabProps> = ({ household }) => {
  const { token } = useAuth();
  const { isDark } = useTheme();

  const [reportData, setReportData] = useState<FullReportData | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportLanguage, setExportLanguage] = useState<'en' | 'bn' | 'both'>('both');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchReportAndAnalytics();
  }, [household.id]);

  const fetchReportAndAnalytics = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // Fetch full report data
      const reportRes = await fetch(`/api/v1/reports/data?householdId=${household.id}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const reportJson = await reportRes.json();
      if (reportJson.status === 'success' && reportJson.data) {
        setReportData(reportJson.data);
      }

      // Fetch monthly trend analytics
      const trendRes = await fetch(`/api/v1/analytics/monthly-trend?householdId=${household.id}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      const trendJson = await trendRes.json();
      if (trendJson.status === 'success' && trendJson.data?.trend) {
        setMonthlyTrend(trendJson.data.trend);
      }
    } catch (err: any) {
      console.error('Error fetching report analytics:', err);
      setErrorMsg('Failed to load full report data. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadExport = async (format: 'csv' | 'pdf') => {
    if (format === 'csv') setIsExportingCsv(true);
    else setIsExportingPdf(true);

    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const urlWithLang = `/api/v1/reports/export/${format}?householdId=${household.id}&lang=${exportLanguage}`;
      const response = await fetch(urlWithLang, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to generate ${format.toUpperCase()} export`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 7);
      a.download = `kilowattiq-energy-report-${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const langLabel = exportLanguage === 'bn' ? 'বাংলা' : exportLanguage === 'both' ? 'Bilingual (বাংলা + English)' : 'English';
      setSuccessMsg(`Official KilowattIQ ${format.toUpperCase()} energy audit report (${format === 'pdf' ? langLabel : 'CSV'}) downloaded successfully!`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error exporting report file.');
    } finally {
      if (format === 'csv') setIsExportingCsv(false);
      else setIsExportingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-display">Compiling Household Energy Audit Data...</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          Calculating tariff steps, vampire standby waste & 6-month historical trends
        </p>
      </div>
    );
  }

  const appliancePieData = reportData?.applianceAnalysis.map(a => ({
    name: a.name,
    value: a.estimatedMonthlyKwh,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                <FileSpreadsheet className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <span>KilowattIQ Energy Audit & Analytics Reports</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-mono">
                DESCO / DPDC COMPLIANT
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
              Generate official energy audit summaries, tariff step logs, and 6-month consumption analytics
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Language Selector for PDF */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs">
              <Globe className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <label htmlFor="report-lang-select" className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Language:</label>
              <select
                id="report-lang-select"
                aria-label="Export Language"
                value={exportLanguage}
                onChange={(e) => setExportLanguage(e.target.value as any)}
                className="bg-transparent text-slate-900 dark:text-slate-200 text-xs font-bold font-display focus:outline-none cursor-pointer"
              >
                <option value="both" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold">Bilingual (বাংলা + EN)</option>
                <option value="bn" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold">বাংলা (Bengali)</option>
                <option value="en" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold">English</option>
              </select>
            </div>

            <button
              onClick={() => handleDownloadExport('csv')}
              disabled={isExportingCsv}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold font-display px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>{isExportingCsv ? 'Exporting CSV...' : 'Download CSV'}</span>
            </button>

            <button
              onClick={() => handleDownloadExport('pdf')}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black font-display px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isExportingPdf ? 'Exporting PDF...' : 'Download PDF Audit'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold font-display px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* Status Toast Notifications */}
        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 rounded-xl flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 rounded-xl flex items-center gap-2 text-rose-800 dark:text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Report Overview Header Cards */}
        {reportData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block font-display">Household Profile</span>
              <p className="font-bold text-slate-900 dark:text-white text-sm truncate font-display">{reportData.household.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {reportData.household.utilityProvider} • {reportData.household.accountNumber}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block font-display">Est. Monthly Bill</span>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm font-mono">৳{reportData.costAnalysis.grossTotalBDT.toLocaleString()}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {reportData.energySummary.totalMonthlyKwh} kWh @ ৳{reportData.costAnalysis.effectiveRatePerKwh}/kWh
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block font-display">Budget Utilization</span>
              <p className={`font-bold text-sm font-mono ${reportData.budgetAnalysis.isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {reportData.budgetAnalysis.budgetUtilizationPct}% ({reportData.budgetAnalysis.isOverBudget ? 'OVER BUDGET' : 'WITHIN BUDGET'})
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Target: ৳{reportData.household.monthlyBudgetBDT.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block font-display">Vampire Standby Waste</span>
              <p className="font-bold text-rose-600 dark:text-rose-400 text-sm font-mono">
                ৳{reportData.vampirePowerAudit.totalMonthlyWastedBDT}/mo
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {reportData.vampirePowerAudit.totalStandbyWatts} W continuous loss
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Historical Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 6-Month Energy & Bill Trend Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                6-Month Energy Consumption & Cost Trend
              </h4>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">BDT & kWh History</span>
          </div>

          {monthlyTrend.length > 0 ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.6} />
                  <XAxis dataKey="month" stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} tickLine={false} />
                  <YAxis stroke={isDark ? '#94a3b8' : '#64748b'} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                    labelStyle={{ color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: isDark ? '#cbd5e1' : '#475569' }} />
                  <Bar dataKey="consumptionKwh" name="Energy (kWh)" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="costBDT" name="Projected Bill (BDT)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budgetBDT" name="Target Budget (BDT)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500 font-mono">
              Historical trend data is not available for this period.
            </div>
          )}
        </div>

        {/* Appliance Consumption Share Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Appliance Energy Share
              </h4>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">kWh Distribution</span>
          </div>

          {appliancePieData.length > 0 ? (
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={appliancePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {appliancePieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                    formatter={(val: any) => [`${val} kWh`, 'Monthly Consumption']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500 font-mono">
              No appliance breakdown data available.
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono border-t border-slate-200 dark:border-slate-800 pt-3">
            {appliancePieData.slice(0, 4).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                <span className="text-slate-600 dark:text-slate-300 truncate">{entry.name}:</span>
                <span className="text-slate-900 dark:text-white font-bold">{entry.value} kWh</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report Audit Tables Grid */}
      {reportData && (
        <div className="space-y-6">
          {/* DESCO Tariff Step Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  DESCO / DPDC Tariff Slab Step Breakdown
                </h4>
              </div>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900 font-mono font-bold">
                LT-A RESIDENTIAL
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-50 dark:bg-slate-950">
                    <th className="p-2.5">Slab Step Name</th>
                    <th className="p-2.5 text-right">Units in Slab (kWh)</th>
                    <th className="p-2.5 text-right">Rate (BDT / kWh)</th>
                    <th className="p-2.5 text-right">Cost in Slab (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {reportData.costAnalysis.slabBreakdown?.map((step, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-slate-200">{step.stepName}</td>
                      <td className="p-2.5 text-right">{step.kwhInSlab} kWh</td>
                      <td className="p-2.5 text-right text-slate-500 dark:text-slate-400">৳{step.rate.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">৳{step.costBDT.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
              <span>Energy Charge: ৳{reportData.costAnalysis.energyCostBDT}</span>
              <span>Demand Charge: ৳{reportData.costAnalysis.demandChargeBDT}</span>
              <span>Meter Rent: ৳{reportData.costAnalysis.meterRentBDT}</span>
              <span>VAT (5%): ৳{reportData.costAnalysis.vatBDT}</span>
              <span className="text-slate-900 dark:text-white font-bold text-xs">Gross Bill: ৳{reportData.costAnalysis.grossTotalBDT}</span>
            </div>
          </div>

          {/* Appliance Energy Breakdown Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  Appliance Energy & Cost Consumption Analysis
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {reportData.applianceAnalysis.length} Appliances Registered
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-50 dark:bg-slate-950">
                    <th className="p-2.5">Appliance Name</th>
                    <th className="p-2.5">Room Location</th>
                    <th className="p-2.5 text-right">Power Rating</th>
                    <th className="p-2.5 text-right">Est. Monthly kWh</th>
                    <th className="p-2.5 text-right">Est. Monthly Cost</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {reportData.applianceAnalysis.map(app => (
                    <tr key={app.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-white">{app.name}</td>
                      <td className="p-2.5 font-sans text-slate-500 dark:text-slate-400">{app.roomName}</td>
                      <td className="p-2.5 text-right text-slate-600 dark:text-slate-300">{app.ratedPowerW} W</td>
                      <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{app.estimatedMonthlyKwh} kWh</td>
                      <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-200">৳{app.estimatedMonthlyCostBDT}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${
                            app.isOn
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {app.isOn ? 'ON' : 'OFF'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vampire Standby Power Audit Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  Vampire / Standby Phantom Power Loss Audit
                </h4>
              </div>
              <span className="text-[10px] text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900 font-mono font-bold">
                CONTINUOUS PHANTOM LOSS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-50 dark:bg-slate-950">
                    <th className="p-2.5">Appliance</th>
                    <th className="p-2.5">Room</th>
                    <th className="p-2.5 text-right">Standby Load (W)</th>
                    <th className="p-2.5 text-right">Monthly Loss (BDT)</th>
                    <th className="p-2.5 text-right">Annual Loss (BDT)</th>
                    <th className="p-2.5 text-center">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                  {reportData.vampirePowerAudit.reports.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-slate-900 dark:text-white">{v.applianceName}</td>
                      <td className="p-2.5 font-sans text-slate-500 dark:text-slate-400">{v.roomName}</td>
                      <td className="p-2.5 text-right text-rose-600 dark:text-rose-400 font-bold">{v.standbyWatts} W</td>
                      <td className="p-2.5 text-right text-rose-600 dark:text-rose-300 font-bold">৳{v.monthlyWastedBDT}</td>
                      <td className="p-2.5 text-right text-rose-600 dark:text-rose-400 font-bold">৳{v.annualWastedBDT}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                            v.severity === 'HIGH'
                              ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900'
                              : v.severity === 'MEDIUM'
                              ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900'
                              : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900'
                          }`}
                        >
                          {v.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-rose-800 dark:text-rose-300 font-mono">
              <span>Total Standby Load: <strong>{reportData.vampirePowerAudit.totalStandbyWatts} W</strong></span>
              <span>Monthly Waste: <strong>৳{reportData.vampirePowerAudit.totalMonthlyWastedBDT}</strong></span>
              <span>Annual Wasted Energy: <strong>৳{reportData.vampirePowerAudit.totalAnnualWastedBDT}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
