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
  Sparkle
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

interface ReportsTabProps {
  household: Household;
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export const ReportsTab: React.FC<ReportsTabProps> = ({ household }) => {
  const { token } = useAuth();

  const [reportData, setReportData] = useState<FullReportData | null>(null);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
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

    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/v1/reports/export?householdId=${household.id}&format=${format}`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to export ${format.toUpperCase()} report`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 7);
      a.download = `kilowattiq-energy-report-${dateStr}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setSuccessMsg(`Official KilowattIQ ${format.toUpperCase()} energy audit report downloaded successfully!`);
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
      <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-200">Compiling Household Energy Audit Data...</p>
        <p className="text-[11px] text-slate-400 font-mono">
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
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>KilowattIQ Energy Audit & Analytics Reports</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                DESCO / DPDC COMPLIANT
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Generate official energy audit summaries, tariff step logs, and 6-month consumption analytics
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* CSV Export */}
            <button
              onClick={() => handleDownloadExport('csv')}
              disabled={isExportingCsv}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            >
              {isExportingCsv ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-slate-950" />
              )}
              <span>{isExportingCsv ? 'Generating CSV...' : 'Export CSV'}</span>
            </button>

            {/* PDF Download */}
            <button
              onClick={() => handleDownloadExport('pdf')}
              disabled={isExportingPdf}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 text-white" />
              )}
              <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>

            {/* Print View */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 transition-all cursor-pointer shrink-0"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* Status Toast Notifications */}
        {successMsg && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded-xl flex items-center gap-2 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Report Overview Header Cards */}
        {reportData && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Household Profile</span>
              <p className="font-bold text-white text-sm truncate">{reportData.household.name}</p>
              <p className="text-[11px] text-slate-400 font-mono">
                {reportData.household.utilityProvider} • {reportData.household.accountNumber}
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Est. Monthly Bill</span>
              <p className="font-bold text-emerald-400 text-sm">৳{reportData.costAnalysis.grossTotalBDT.toLocaleString()}</p>
              <p className="text-[11px] text-slate-400 font-mono">
                {reportData.energySummary.totalMonthlyKwh} kWh @ ৳{reportData.costAnalysis.effectiveRatePerKwh}/kWh
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Budget Utilization</span>
              <p className={`font-bold text-sm ${reportData.budgetAnalysis.isOverBudget ? 'text-rose-400' : 'text-amber-400'}`}>
                {reportData.budgetAnalysis.budgetUtilizationPct}% ({reportData.budgetAnalysis.isOverBudget ? 'OVER BUDGET' : 'WITHIN BUDGET'})
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                Target: ৳{reportData.household.monthlyBudgetBDT.toLocaleString()}
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Vampire Standby Waste</span>
              <p className="font-bold text-rose-400 text-sm">
                ৳{reportData.vampirePowerAudit.totalMonthlyWastedBDT}/mo
              </p>
              <p className="text-[11px] text-slate-400 font-mono">
                {reportData.vampirePowerAudit.totalStandbyWatts} W continuous loss
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Historical Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 6-Month Energy & Bill Trend Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                6-Month Energy Consumption & Cost Trend
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">BDT & kWh History</span>
          </div>

          {monthlyTrend.length > 0 ? (
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
                    labelStyle={{ color: '#f8fafc', fontWeight: 'bold' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="consumptionKwh" name="Energy (kWh)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="costBDT" name="Projected Bill (BDT)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budgetBDT" name="Target Budget (BDT)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-blue-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Appliance Energy Share
              </h4>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">kWh Distribution</span>
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
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
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

          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono border-t border-slate-800 pt-3">
            {appliancePieData.slice(0, 4).map((entry, idx) => (
              <div key={idx} className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                <span className="text-slate-300 truncate">{entry.name}:</span>
                <span className="text-white font-bold">{entry.value} kWh</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report Audit Tables Grid */}
      {reportData && (
        <div className="space-y-6">
          {/* DESCO Tariff Step Breakdown Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  DESCO / DPDC Tariff Slab Step Breakdown
                </h4>
              </div>
              <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900 font-mono font-bold">
                LT-A RESIDENTIAL
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-950">
                    <th className="p-2.5">Slab Step Name</th>
                    <th className="p-2.5 text-right">Units in Slab (kWh)</th>
                    <th className="p-2.5 text-right">Rate (BDT / kWh)</th>
                    <th className="p-2.5 text-right">Cost in Slab (BDT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-200">
                  {reportData.costAnalysis.slabBreakdown?.map((step, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-slate-200">{step.stepName}</td>
                      <td className="p-2.5 text-right">{step.kwhInSlab} kWh</td>
                      <td className="p-2.5 text-right text-slate-400">৳{step.rate.toFixed(2)}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-400">৳{step.costBDT.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 border border-slate-800">
              <span>Energy Charge: ৳{reportData.costAnalysis.energyCostBDT}</span>
              <span>Demand Charge: ৳{reportData.costAnalysis.demandChargeBDT}</span>
              <span>Meter Rent: ৳{reportData.costAnalysis.meterRentBDT}</span>
              <span>VAT (5%): ৳{reportData.costAnalysis.vatBDT}</span>
              <span className="text-white font-bold text-xs">Gross Bill: ৳{reportData.costAnalysis.grossTotalBDT}</span>
            </div>
          </div>

          {/* Appliance Energy Breakdown Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Appliance Energy & Cost Consumption Analysis
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {reportData.applianceAnalysis.length} Appliances Registered
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-950">
                    <th className="p-2.5">Appliance Name</th>
                    <th className="p-2.5">Room Location</th>
                    <th className="p-2.5 text-right">Power Rating</th>
                    <th className="p-2.5 text-right">Est. Monthly kWh</th>
                    <th className="p-2.5 text-right">Est. Monthly Cost</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-200">
                  {reportData.applianceAnalysis.map(app => (
                    <tr key={app.id} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-white">{app.name}</td>
                      <td className="p-2.5 font-sans text-slate-400">{app.roomName}</td>
                      <td className="p-2.5 text-right text-slate-300">{app.ratedPowerW} W</td>
                      <td className="p-2.5 text-right font-bold text-emerald-400">{app.estimatedMonthlyKwh} kWh</td>
                      <td className="p-2.5 text-right font-bold text-slate-200">৳{app.estimatedMonthlyCostBDT}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono ${
                            app.isOn
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-slate-800 text-slate-500'
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-rose-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Vampire / Standby Phantom Power Loss Audit
                </h4>
              </div>
              <span className="text-[10px] text-rose-400 bg-rose-950 px-2 py-0.5 rounded border border-rose-900 font-mono font-bold">
                CONTINUOUS PHANTOM LOSS
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-bold text-[10px] uppercase font-mono bg-slate-950">
                    <th className="p-2.5">Appliance</th>
                    <th className="p-2.5">Room</th>
                    <th className="p-2.5 text-right">Standby Load (W)</th>
                    <th className="p-2.5 text-right">Monthly Loss (BDT)</th>
                    <th className="p-2.5 text-right">Annual Loss (BDT)</th>
                    <th className="p-2.5 text-center">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-200">
                  {reportData.vampirePowerAudit.reports.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="p-2.5 font-sans font-bold text-white">{v.applianceName}</td>
                      <td className="p-2.5 font-sans text-slate-400">{v.roomName}</td>
                      <td className="p-2.5 text-right text-rose-400 font-bold">{v.standbyWatts} W</td>
                      <td className="p-2.5 text-right text-rose-300 font-bold">৳{v.monthlyWastedBDT}</td>
                      <td className="p-2.5 text-right text-rose-400 font-bold">৳{v.annualWastedBDT}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                            v.severity === 'HIGH'
                              ? 'bg-rose-950 text-rose-400 border-rose-900'
                              : v.severity === 'MEDIUM'
                              ? 'bg-amber-950 text-amber-400 border-amber-900'
                              : 'bg-emerald-950 text-emerald-400 border-emerald-900'
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

            <div className="bg-rose-950/30 border border-rose-900/60 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-rose-300 font-mono">
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
