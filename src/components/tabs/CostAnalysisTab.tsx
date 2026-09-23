import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Calculator,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Sliders,
  DollarSign,
  Layers,
  PieChart,
  ShieldAlert,
  Clock,
  Target,
  ArrowUpRight,
  Zap
} from 'lucide-react';
import { TariffType, CostCalculation, BudgetStatus, SlabThresholdAnalysis } from '../../../shared/types/energy';
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

  // Compute predictive BERC slab threshold risk analysis
  const slabAnalysis: SlabThresholdAnalysis = TariffCalculator.analyzeSlabThreshold(
    kwhInput,
    daysPassedInput,
    30,
    household.sanctionedLoadKw
  );

  return (
    <div className="space-y-5">
      
      {/* Top Controller Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Calculator className="w-4.5 h-4.5 text-emerald-400" />
              <span>Bangladeshi Electricity Tariff Engine & Simulator</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              BERC / DESCO / DPDC LT-A Residential Tariff Engine with dynamic slab calculations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Tariff Model:</span>
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

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Consumption:</span>
              <input
                type="number"
                min="0"
                max="1500"
                value={kwhInput}
                onChange={(e) => setKwhInput(Math.max(0, Number(e.target.value)))}
                className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-white font-mono font-bold text-xs focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-slate-400 font-mono font-bold">kWh</span>
            </div>
          </div>
        </div>

        {/* Interactive Sliders for Consumption & Month Days */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
          
          {/* Slider 1: kWh Consumption */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-emerald-400" />
                Monthly kWh Consumption Slider
              </span>
              <span className="text-emerald-400 font-mono">{kwhInput} kWh</span>
            </div>
            <input
              type="range"
              min="10"
              max="1000"
              step="5"
              value={kwhInput}
              onChange={(e) => setKwhInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          </div>

          {/* Slider 2: Days Passed in Billing Cycle */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-amber-400" />
                Billing Cycle Progress ({daysPassedInput} / 30 Days)
              </span>
              <span className="text-amber-400 font-mono">{((daysPassedInput / 30) * 100).toFixed(0)}% Complete</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={daysPassedInput}
              onChange={(e) => setDaysPassedInput(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

        </div>
      </div>

      {/* Bill Cost Summary & Slab Step Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left 2 Cols: Cost Breakdown & Slab Items */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Electricity Bill Detailed Breakdown</h4>
              <p className="text-[10px] text-slate-400">Sanctioned Load: {household.sanctionedLoadKw} kW | Meter Rent: ৳40 | Demand Charge: ৳{household.sanctionedLoadKw * 42}</p>
            </div>
            <div className="text-right">
              <motion.span
                key={costCalc.grossTotalBDT}
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="text-3xl font-black font-mono text-emerald-400"
              >
                ৳{costCalc.grossTotalBDT.toFixed(2)}
              </motion.span>
              <p className="text-[9px] text-slate-400 uppercase font-bold">Gross Total (Inc 5% VAT)</p>
            </div>
          </div>

          {/* Slab Breakdown Items */}
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>DESCO LT-A Tiered Slab Distribution ({kwhInput} kWh)</span>
            </h5>

            <div className="space-y-1.5">
              {(costCalc.slabBreakdown || []).map((s, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold font-mono text-[11px]">
                      {idx + 1}
                    </div>
                    <div>
                      <span className="font-bold text-white block">{s.stepName}</span>
                      <span className="text-[10px] text-slate-400">
                        {s.kwhInSlab} kWh @ ৳{s.rate}/kWh
                      </span>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    ৳{s.costBDT.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Fixed Charges Table */}
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block">Energy Cost</span>
              <span className="text-sm font-bold text-white font-mono">৳{costCalc.energyCostBDT.toFixed(2)}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block">Fixed & Demand</span>
              <span className="text-sm font-bold text-white font-mono">৳{(costCalc.demandChargeBDT + costCalc.meterRentBDT).toFixed(2)}</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase block">VAT (5%)</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">৳{costCalc.vatBDT.toFixed(2)}</span>
            </div>
          </div>

        </div>

        {/* Right Col: Budget & Burn Rate Predictor */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <PieChart className="w-4 h-4 text-amber-400" />
                <span>Monthly Budget Engine</span>
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                budgetStatus.isOverageLikely
                  ? 'bg-rose-950 text-rose-400 border-rose-800'
                  : 'bg-emerald-950 text-emerald-400 border-emerald-800'
              }`}>
                {budgetStatus.isOverageLikely ? 'BUDGET EXCEEDED' : 'ON TRACK'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Monthly Budget Cap</span>
                <span className="text-2xl font-black text-white font-mono">৳{household.monthlyBudgetBDT} BDT</span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Projected End-Of-Month Bill</span>
                <span className="text-2xl font-black text-amber-400 font-mono">৳{budgetStatus.projectedCostBDT.toFixed(0)} BDT</span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>Spent So Far: ৳{budgetStatus.currentSpentBDT.toFixed(0)}</span>
                  <span>Day {daysPassedInput} / 30</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      budgetStatus.isOverageLikely ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (budgetStatus.currentSpentBDT / household.monthlyBudgetBDT) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Actionable Advice */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-amber-400 uppercase block flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Budget Insight
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {budgetStatus.isOverageLikely
                    ? `Projected to exceed budget by ${budgetStatus.overagePercentage.toFixed(0)}%. Consider shifting AC usage during peak hours.`
                    : `Current usage pattern is within safe budget limits. Estimated savings vs cap: ৳${Math.max(0, household.monthlyBudgetBDT - budgetStatus.projectedCostBDT).toFixed(0)} BDT.`}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center font-mono">
            KilowattIQ Tariff Engine • BERC Ordinance LT-A 2026
          </div>
        </div>

      </div>

      {/* Predictive BERC Slab Threshold Risk Monitor */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              slabAnalysis.projectedBreachOccurs ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>BERC Progressive Slab Threshold Risk Monitor</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold uppercase ${
                  slabAnalysis.projectedBreachOccurs
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                }`}>
                  {slabAnalysis.projectedBreachOccurs ? 'Step Jump Hazard' : 'Safe Tier Profile'}
                </span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Predictive slab transition tracking to protect households against steep marginal unit rate jumps
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Current Active Tier</span>
            <span className="text-xs font-bold text-emerald-400 font-mono">
              {slabAnalysis.currentSlabName} (৳{slabAnalysis.currentRateBDT}/unit)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Metric 1: Next Slab Jump */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-amber-400" />
              Next Step Margin
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold font-mono text-white">
                {slabAnalysis.nextRateBDT ? `৳${slabAnalysis.nextRateBDT}` : 'Max Tier'}
              </span>
              {slabAnalysis.rateJumpPercentage > 0 && (
                <span className="text-[11px] font-bold text-rose-400 font-mono">
                  (+{slabAnalysis.rateJumpPercentage}%)
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              {slabAnalysis.nextSlabName || 'Top BERC step reached'}
            </p>
          </div>

          {/* Metric 2: Breach Countdown */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1">
              <Clock className="w-3 h-3 text-emerald-400" />
              Breach Countdown
            </span>
            <div className="text-base font-bold font-mono text-white">
              {slabAnalysis.daysUntilBreach !== null
                ? `${slabAnalysis.daysUntilBreach} Days`
                : 'No Limit'}
            </div>
            <p className="text-[10px] text-slate-400">
              {slabAnalysis.kwhRemainingToBreach > 0
                ? `${slabAnalysis.kwhRemainingToBreach} kWh buffer remaining`
                : 'Already in top tier'}
            </p>
          </div>

          {/* Metric 3: Target Daily Cap */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1">
              <Target className="w-3 h-3 text-emerald-400" />
              Target Daily Cap
            </span>
            <div className="text-base font-bold font-mono text-emerald-400">
              {slabAnalysis.maxDailyKwhToStayInSlab > 0
                ? `${slabAnalysis.maxDailyKwhToStayInSlab} kWh/day`
                : 'Slab Exceeded'}
            </div>
            <p className="text-[10px] text-slate-400">
              Limit to maintain {slabAnalysis.currentSlabName.split(' ')[0]} {slabAnalysis.currentSlabName.split(' ')[1]}
            </p>
          </div>

          {/* Metric 4: Avoidable Penalty */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-bold block flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              Avoidable Surcharge
            </span>
            <div className="text-base font-bold font-mono text-amber-400">
              ৳{slabAnalysis.avoidableMonthlySurchargeBDT.toLocaleString('en-US', { maximumFractionDigits: 0 })} BDT
            </div>
            <p className="text-[10px] text-slate-400">
              Savings if breach is averted
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
