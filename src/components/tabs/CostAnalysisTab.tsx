import React, { useState } from 'react';
import { Calculator, AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { TariffType, CostCalculation, BudgetStatus } from '../../../shared/types/energy';
import { Household } from '../../../shared/types/household';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import { BudgetEngine } from '../../../backend/engine/BudgetEngine';

interface CostAnalysisTabProps {
  household: Household;
}

export const CostAnalysisTab: React.FC<CostAnalysisTabProps> = ({ household }) => {
  const [kwhInput, setKwhInput] = useState<number>(285);
  const [selectedTariffType, setSelectedTariffType] = useState<TariffType>('SLAB');
  const [daysPassedInput, setDaysPassedInput] = useState<number>(18);

  // Compute live cost calculation
  const costCalc: CostCalculation = TariffCalculator.calculateCost(
    kwhInput,
    household.sanctionedLoadKw,
    selectedTariffType
  );

  // Compute live budget status
  const budgetStatus: BudgetStatus = BudgetEngine.evaluateBudget(
    household.id,
    household.monthlyBudgetBDT,
    kwhInput,
    daysPassedInput,
    30,
    household.sanctionedLoadKw,
    selectedTariffType
  );

  return (
    <div className="space-y-4">
      
      {/* Top Controller Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>Bangladeshi Electricity Tariff Engine</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              BERC / DESCO / DPDC LT-A Residential Tariff Engine
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Tariff:</span>
              <select
                value={selectedTariffType}
                onChange={(e) => setSelectedTariffType(e.target.value as TariffType)}
                className="bg-transparent text-emerald-400 font-bold focus:outline-none cursor-pointer text-xs"
              >
                <option value="SLAB" className="bg-slate-900 text-slate-200">Slab / Tiered (Standard BD)</option>
                <option value="FLAT" className="bg-slate-900 text-slate-200">Flat Rate Tariff</option>
                <option value="TOU" className="bg-slate-900 text-slate-200">Time-Of-Use (Peak / Off-Peak)</option>
                <option value="SEASONAL" className="bg-slate-900 text-slate-200">Seasonal Adjusted</option>
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Consumption:</span>
              <input
                type="number"
                min="0"
                max="1500"
                value={kwhInput}
                onChange={(e) => setKwhInput(Math.max(0, Number(e.target.value)))}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-slate-400 font-mono">kWh</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bill Cost Summary & Slab Step Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Left 2 Cols: Cost Breakdown */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Electricity Bill Breakdown</h4>
              <p className="text-[10px] text-slate-400">Sanctioned Load: {household.sanctionedLoadKw} kW | Meter Rent: ৳40</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-emerald-400">
                ৳{costCalc.grossTotalBDT.toFixed(2)}
              </span>
              <p className="text-[9px] text-slate-400 uppercase font-bold">Gross Total (Inc VAT)</p>
            </div>
          </div>

          {/* Slab Steps Visual Progress */}
          {selectedTariffType === 'SLAB' && costCalc.slabBreakdown && (
            <div className="space-y-2">
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                DESCO 6-Step Slab Visualizer
              </h5>
              
              <div className="space-y-1.5">
                {costCalc.slabBreakdown.map((slab, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-slate-200 text-[11px]">{slab.stepName}</span>
                      <span className="font-mono text-emerald-400 text-[11px]">
                        {slab.kwhInSlab} kWh × ৳{slab.rate} = <span className="font-bold">৳{slab.costBDT}</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (slab.kwhInSlab / 100) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table Breakdown of Charges */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-2 px-3">Bill Component</th>
                  <th className="py-2 px-3">Rate / Calculation</th>
                  <th className="py-2 px-3 text-right">Amount (BDT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300 font-mono text-[11px]">
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-200">Energy Consumption Charge</td>
                  <td className="py-2 px-3 text-slate-400">{costCalc.totalKwh} kWh ({selectedTariffType} mode)</td>
                  <td className="py-2 px-3 text-right font-bold text-white">৳{costCalc.energyCostBDT}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-200">Demand Charge</td>
                  <td className="py-2 px-3 text-slate-400">{household.sanctionedLoadKw} kW × ৳42.0/kW</td>
                  <td className="py-2 px-3 text-right text-slate-200">৳{costCalc.demandChargeBDT}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-200">Meter Rent</td>
                  <td className="py-2 px-3 text-slate-400">Fixed Monthly Charge</td>
                  <td className="py-2 px-3 text-right text-slate-200">৳{costCalc.meterRentBDT}</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-sans font-medium text-slate-200">Government VAT (5%)</td>
                  <td className="py-2 px-3 text-slate-400">5% of Energy + Demand + Meter Rent</td>
                  <td className="py-2 px-3 text-right text-slate-200">৳{costCalc.vatBDT}</td>
                </tr>
                <tr className="bg-slate-900 font-sans">
                  <td className="py-2.5 px-3 font-bold text-emerald-400 text-xs">Effective Unit Rate</td>
                  <td className="py-2.5 px-3 text-slate-400 text-[11px]">Gross Total / Total kWh</td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400 font-mono text-xs">
                    ৳{costCalc.effectiveRatePerKwh} / kWh
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Monthly Budget Overage Prediction */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Budget Overage Predictor</span>
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Extrapolates month-end cost based on current run-rate
            </p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Monthly Budget Cap:</span>
              <span className="font-bold text-white font-mono">৳{household.monthlyBudgetBDT}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">Days Elapsed:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={daysPassedInput}
                  onChange={(e) => setDaysPassedInput(Math.min(30, Math.max(1, Number(e.target.value))))}
                  className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center text-white font-mono text-xs focus:outline-none"
                />
                <span className="text-slate-500 font-mono text-[10px]">/ 30 Days</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">Projected Month-End:</span>
                <span className={`font-mono font-bold text-sm ${budgetStatus.isOverageLikely ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ৳{budgetStatus.projectedCostBDT}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 text-[11px]">Projected kWh:</span>
                <span className="font-mono text-slate-200 text-[11px]">{budgetStatus.projectedKwh} kWh</span>
              </div>
            </div>
          </div>

          {/* Overage Warning Badge */}
          {budgetStatus.isOverageLikely ? (
            <div className="bg-rose-950/60 border border-rose-900/80 rounded-lg p-3 text-rose-300 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-rose-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Budget Overage Risk Detected</span>
              </div>
              <p className="text-[10px] leading-relaxed text-rose-200">
                Exceeding budget by <span className="font-bold">{budgetStatus.overagePercentage}%</span> (৳{(budgetStatus.projectedCostBDT - household.monthlyBudgetBDT).toFixed(0)} above cap).
              </p>
            </div>
          ) : (
            <div className="bg-emerald-950/60 border border-emerald-900/80 rounded-lg p-3 text-emerald-300 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400 text-xs">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>On Track for Target Budget</span>
              </div>
              <p className="text-[10px] leading-relaxed text-emerald-200">
                Run-rate is within safe limits. Estimated savings: ৳{(household.monthlyBudgetBDT - budgetStatus.projectedCostBDT).toFixed(0)}.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
