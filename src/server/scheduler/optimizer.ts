/**
 * Off-Peak Schedule Optimizer
 * 
 * Bangladeshi Power Sector (BERC / DESCO / DPDC / BPDB) Regulations:
 * - Peak Window: 17:00 to 23:00 (5:00 PM – 11:00 PM) -> Peak Tariff: ৳12.10/kWh
 * - Off-Peak Window: 23:00 to 17:00 (11:00 PM – 5:00 PM next day) -> Off-Peak Tariff: ৳7.05/kWh
 * - Residential Slab Thresholds (LT-A): Step 1 (0-75 @ 5.26), Step 2 (76-200 @ 7.20),
 *   Step 3 (201-300 @ 7.59), Step 4 (301-400 @ 8.02), Step 5 (401-600 @ 12.67), Step 6 (>600 @ 14.61)
 * 
 * Optimization Engine:
 * - Considers: rated power (W), runtime (hours), user preferences, and BERC slab tier position.
 * - Detects slot conflicts & breaker trips (simultaneous load > sanctioned load).
 * - Live bill impact calculation with estimated monthly savings (৳/month).
 * - "Auto-schedule" AI proposal powered by Gemini (gemini-3.8-flash) + expert heuristic engine.
 */

import { GoogleGenAI } from '@google/genai';
import { Appliance, Household } from '../../../shared/types/household';
import { BD_DEFAULT_SLAB_TARIFF } from '../../../shared/constants/bdTariffs';
import { TariffCalculator } from '../../../backend/engine/TariffCalculator';
import {
  ScheduledSlot,
  ScheduleConflict,
  ProjectedBillImpact,
  OptimizationPreferences,
  OptimizationResult,
} from './types';

export class ScheduleOptimizer {
  // Peak tariff window in Bangladesh is 17:00 to 23:00 (hours 17 through 22.99)
  public static readonly PEAK_START_HOUR = 17;
  public static readonly PEAK_END_HOUR = 23;

  /**
   * Checks whether a given clock hour (0 to 23) falls inside the off-peak window (23:00 to 17:00)
   */
  public static isHourOffPeak(hour: number): boolean {
    const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24;
    return normalizedHour >= this.PEAK_END_HOUR || normalizedHour < this.PEAK_START_HOUR;
  }

  /**
   * Determines if a slot running from startHour for durationHours is entirely or predominantly off-peak
   */
  public static isSlotOffPeak(startHour: number, durationHours: number): boolean {
    if (durationHours <= 0) return true;
    let offPeakHours = 0;
    const steps = Math.ceil(durationHours * 2); // 30-min precision
    const stepSize = durationHours / steps;

    for (let i = 0; i < steps; i++) {
      const h = (startHour + i * stepSize) % 24;
      if (this.isHourOffPeak(h)) {
        offPeakHours += stepSize;
      }
    }
    return offPeakHours / durationHours >= 0.75;
  }

  /**
   * Detects schedule conflicts:
   * 1. Same appliance scheduled in overlapping time windows
   * 2. Heavy loads placed inside the 17:00–23:00 peak surcharge zone
   * 3. Combined simultaneous power (W) exceeding household sanctionedLoadKw at any hour
   */
  public static detectConflicts(
    slots: ScheduledSlot[],
    household: Household,
    appliances: Appliance[]
  ): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const sanctionedWatts = (household.sanctionedLoadKw || 3.0) * 1000;

    // 1. Check duplicate appliance overlaps
    const applianceSlotsMap = new Map<string, ScheduledSlot[]>();
    for (const slot of slots) {
      const list = applianceSlotsMap.get(slot.applianceId) || [];
      list.push(slot);
      applianceSlotsMap.set(slot.applianceId, list);
    }

    for (const [applianceId, appSlots] of applianceSlotsMap.entries()) {
      if (appSlots.length > 1) {
        for (let i = 0; i < appSlots.length; i++) {
          for (let j = i + 1; j < appSlots.length; j++) {
            const a = appSlots[i];
            const b = appSlots[j];
            const aEnd = a.startHour + a.durationHours;
            const bEnd = b.startHour + b.durationHours;

            // Check overlap
            const overlaps = (a.startHour < bEnd && aEnd > b.startHour);
            if (overlaps) {
              conflicts.push({
                id: `conflict_overlap_${a.id}_${b.id}`,
                type: 'OVERLAP',
                severity: 'error',
                applianceId,
                applianceName: a.applianceName,
                slotIds: [a.id, b.id],
                message: `${a.applianceName} is double-booked with overlapping times (${a.startHour}:00 and ${b.startHour}:00).`,
                messageBn: `${a.applianceName} একই সময়ে দুটি আলাদা স্লটে শিডিউল করা হয়েছে (${a.startHour}:00 এবং ${b.startHour}:00)।`,
                recommendedAction: 'Adjust the start times so this appliance does not overlap itself.',
              });
            }
          }
        }
      }
    }

    // 2. Check Peak Zone warnings (17:00 - 23:00)
    for (const slot of slots) {
      const endHour = slot.startHour + slot.durationHours;
      // Overlaps with 17:00 - 23:00?
      let peakHoursInSlot = 0;
      for (let h = 0; h < 24; h++) {
        // Does slot cover hour h?
        const slotCovers = (slot.startHour <= h && h < endHour) ||
          (endHour > 24 && ((slot.startHour <= h) || (h < endHour % 24)));
        if (slotCovers && h >= this.PEAK_START_HOUR && h < this.PEAK_END_HOUR) {
          peakHoursInSlot++;
        }
      }

      if (peakHoursInSlot > 0) {
        conflicts.push({
          id: `conflict_peak_${slot.id}`,
          type: 'PEAK_ZONE',
          severity: 'warning',
          applianceId: slot.applianceId,
          applianceName: slot.applianceName,
          slotIds: [slot.id],
          message: `${slot.applianceName} is placed in the Peak Tariff Window (${this.PEAK_START_HOUR}:00–${this.PEAK_END_HOUR}:00). Rate is ৳12.10/kWh (+71% higher than off-peak).`,
          messageBn: `${slot.applianceName} পিক আওয়ার (${this.PEAK_START_HOUR}:00–${this.PEAK_END_HOUR}:00) চলাকালীন রাখা হয়েছে। পিক রেট ৳১২.১০/ইউনিট (+৭১% বেশি)। অফ-পিকে স্থানান্তর করুন।`,
          recommendedAction: 'Drag this slot to the 23:00–17:00 off-peak window to save money and avoid peak charges.',
        });
      }
    }

    // 3. Check Hourly Concurrent Load against Sanctioned Load
    // Check each hour of the day (0 to 23)
    for (let h = 0; h < 24; h++) {
      let concurrentWatts = 0;
      const activeSlotIds: string[] = [];
      const activeNames: string[] = [];

      for (const slot of slots) {
        const endHour = slot.startHour + slot.durationHours;
        const isActiveAtH = (slot.startHour <= h && h < endHour) ||
          (endHour > 24 && (h >= slot.startHour || h < endHour % 24));

        if (isActiveAtH) {
          concurrentWatts += slot.ratedPowerW;
          activeSlotIds.push(slot.id);
          activeNames.push(`${slot.applianceName} (${slot.ratedPowerW}W)`);
        }
      }

      if (concurrentWatts > sanctionedWatts && activeSlotIds.length > 1) {
        conflicts.push({
          id: `conflict_sanctioned_load_hour_${h}`,
          type: 'LOAD_EXCEEDED',
          severity: 'error',
          applianceId: activeSlotIds[0],
          applianceName: activeNames.join(' + '),
          slotIds: activeSlotIds,
          message: `Simultaneous load at ${h.toString().padStart(2, '0')}:00 reaches ${(concurrentWatts / 1000).toFixed(1)} kW, exceeding sanctioned limit (${household.sanctionedLoadKw.toFixed(1)} kW). Breaker trip risk!`,
          messageBn: `${h.toString().padStart(2, '0')}:00 টায় মোট লোড ${(concurrentWatts / 1000).toFixed(1)} kW-এ পৌঁছেছে, যা অনুমোদিত লোড (${household.sanctionedLoadKw.toFixed(1)} kW) ছাড়িয়ে গেছে। মেইন ব্রেকার ট্রিপ করার ঝুঁকি রয়েছে!`,
          recommendedAction: 'Stagger high-power loads (e.g. run water heater and AC at different times) to keep load below sanctioned capacity.',
        });
      }
    }

    return conflicts;
  }

  /**
   * Calculates live projected bill impact, BERC slab position, and estimated savings
   */
  public static calculateBillImpact(
    slots: ScheduledSlot[],
    household: Household,
    appliances: Appliance[]
  ): ProjectedBillImpact {
    const tariffConfig = BD_DEFAULT_SLAB_TARIFF;
    const peakRate = tariffConfig.touRates?.peakRate ?? 12.10;
    const offPeakRate = tariffConfig.touRates?.offPeakRate ?? 7.05;
    const rateDiff = peakRate - offPeakRate; // ৳5.05 per kWh
    const vatMultiplier = 1 + (tariffConfig.vatPercent / 100); // 1.05

    // Total monthly baseline energy calculation for this household
    // Typically 250 - 400 kWh depending on registered appliances
    let baselineDailyKwh = 0;
    for (const app of appliances) {
      const dailyHours = app.averageHoursPerDay || 4;
      baselineDailyKwh += (app.ratedPowerW * dailyHours) / 1000;
    }
    // Safe fallback if few appliances registered: average Dhaka household ~320 kWh/mo
    const estimatedMonthlyKwh = Math.max(120, baselineDailyKwh > 0 ? baselineDailyKwh * 30 : 320);

    // Calculate current slab position
    const currentSlabAnalysis = TariffCalculator.analyzeSlabThreshold(
      estimatedMonthlyKwh,
      18, // mid-month reference
      30,
      household.sanctionedLoadKw || 3.0,
      tariffConfig
    );

    // Calculate how many kWh are scheduled in off-peak vs peak
    let totalScheduledDailyKwh = 0;
    let scheduledOffPeakDailyKwh = 0;
    let scheduledPeakDailyKwh = 0;

    for (const slot of slots) {
      const slotKwh = (slot.ratedPowerW * slot.durationHours) / 1000;
      totalScheduledDailyKwh += slotKwh;

      const endHour = slot.startHour + slot.durationHours;
      let offPeakFraction = 0;
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const checkH = (slot.startHour + (i / steps) * slot.durationHours) % 24;
        if (this.isHourOffPeak(checkH)) {
          offPeakFraction += 1 / steps;
        }
      }

      scheduledOffPeakDailyKwh += slotKwh * offPeakFraction;
      scheduledPeakDailyKwh += slotKwh * (1 - offPeakFraction);
    }

    // Peak kWh shifted to off-peak slots (monthly)
    // Assume in an un-optimized scenario, these discretionary heavy loads ran during evening peak
    const peakShiftedDailyKwh = Math.max(0, scheduledOffPeakDailyKwh);
    const peakShiftedMonthlyKwh = Number((peakShiftedDailyKwh * 30).toFixed(1));

    // Direct TOU savings + 5% VAT
    const touDirectMonthlySavings = peakShiftedMonthlyKwh * rateDiff * vatMultiplier;

    // Baseline bill calculation (Standard residential bill)
    const baselineBill = TariffCalculator.calculateCost(
      estimatedMonthlyKwh,
      household.sanctionedLoadKw || 3.0,
      'SLAB',
      tariffConfig,
      { isPeakHourRatio: 0.35 }
    );

    // Optimized bill calculation
    // If discretionary loads are shifted to off-peak, peak ratio drops to ~0.10
    const optimizedTouBill = TariffCalculator.calculateCost(
      estimatedMonthlyKwh,
      household.sanctionedLoadKw || 3.0,
      'TOU',
      tariffConfig,
      { isPeakHourRatio: Math.max(0.08, 0.35 - (peakShiftedMonthlyKwh / estimatedMonthlyKwh) * 0.25) }
    );

    // Monthly savings: combination of peak tariff difference and avoided slab waste
    const rawSavings = Math.max(
      touDirectMonthlySavings,
      baselineBill.grossTotalBDT - optimizedTouBill.grossTotalBDT
    );
    const monthlySavingsBDT = Number(Math.max(0, Math.round(rawSavings)).toFixed(0));
    const annualSavingsBDT = monthlySavingsBDT * 12;

    const optimizedCostBDT = Math.max(0, Math.round(baselineBill.grossTotalBDT - monthlySavingsBDT));

    // CO2 reduction: 0.58 kg CO2/kWh from avoided quick-rental diesel/furnace peaker plants
    const co2SavedKgMonthly = Number((peakShiftedMonthlyKwh * 0.58).toFixed(1));

    // Determine current active slab details
    let currentSlab = tariffConfig.slabs[0];
    let nextSlab = tariffConfig.slabs[1] || null;
    for (let i = 0; i < tariffConfig.slabs.length; i++) {
      const slab = tariffConfig.slabs[i];
      if (estimatedMonthlyKwh >= slab.minKwh && (slab.maxKwh === null || estimatedMonthlyKwh <= slab.maxKwh)) {
        currentSlab = slab;
        nextSlab = tariffConfig.slabs[i + 1] || null;
        break;
      }
    }

    const kwhRemainingToBreach = currentSlab.maxKwh !== null ? Math.max(0, currentSlab.maxKwh - estimatedMonthlyKwh) : 0;
    const slabJumpAvoided = peakShiftedMonthlyKwh >= kwhRemainingToBreach && kwhRemainingToBreach > 0;

    const tips: string[] = [
      'Shift electric water geyser to 05:30–07:00 AM (saves ~৳350/mo vs evening runs).',
      'Run washing machine during sunny daylight off-peak (10:00–12:00) to combine off-peak rates with line drying.',
      'Pre-cool bedroom air conditioners between 15:00–17:00 right before the 17:00 peak begins.',
      'Schedule high-draw loads sequentially rather than concurrently to prevent circuit trips.',
    ];

    const aiSummary = `By shifting ${peakShiftedMonthlyKwh} kWh/month away from Bangladesh's peak window (17:00–23:00) into off-peak hours (23:00–17:00), you save approximately ৳${monthlySavingsBDT.toLocaleString()}/month (৳${annualSavingsBDT.toLocaleString()}/year) and avoid entering the expensive ${nextSlab ? nextSlab.stepName : 'higher slab'} tier.`;

    return {
      baselineMonthlyKwh: Number(estimatedMonthlyKwh.toFixed(1)),
      baselineMonthlyCostBDT: Math.round(baselineBill.grossTotalBDT),
      optimizedMonthlyCostBDT: optimizedCostBDT,
      monthlySavingsBDT,
      annualSavingsBDT,
      peakShiftedKwh: peakShiftedMonthlyKwh,
      currentSlabName: currentSlab.stepName,
      currentRateBDT: currentSlab.ratePerKwh,
      nextSlabName: nextSlab ? nextSlab.stepName : null,
      nextRateBDT: nextSlab ? nextSlab.ratePerKwh : null,
      kwhRemainingToBreach: Number(kwhRemainingToBreach.toFixed(1)),
      slabJumpAvoided,
      co2SavedKgMonthly,
      peakHoursWindow: '17:00 – 23:00 (Peak: ৳12.10/kWh)',
      offPeakHoursWindow: '23:00 – 17:00 (Off-Peak: ৳7.05/kWh)',
      aiSummary,
      tips,
    };
  }

  /**
   * Auto-Schedule Engine:
   * Uses Gemini AI (gemini-3.8-flash) to propose an optimal, conflict-free off-peak schedule
   * based on household appliances, rated powers, and Bangladesh living habits.
   * Falls back to a deterministic expert heuristic if Gemini API key is absent or offline.
   */
  public static async autoScheduleWithAI(
    household: Household,
    appliances: Appliance[],
    preferences: OptimizationPreferences = {}
  ): Promise<OptimizationResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey.length > 5 && !apiKey.includes('your-gemini-api-key')) {
      try {
        const ai = new GoogleGenAI({});
        const prompt = `You are KilowattIQ's Bangladesh Grid & Energy Optimization Specialist.
Given a Bangladeshi household with sanctioned load ${household.sanctionedLoadKw} kW and registered appliances:
${JSON.stringify(appliances.map(a => ({
  id: a.id,
  name: a.name,
  category: a.category,
  ratedPowerW: a.ratedPowerW,
  dailyHours: a.averageHoursPerDay,
})), null, 2)}

User preferences:
${JSON.stringify(preferences, null, 2)}

Regulations:
- Peak Window (DO NOT SCHEDULE HERE): 17:00 to 23:00 (17:00 - 23:00). Rate is ৳12.10/kWh.
- Off-Peak Window (SCHEDULE HERE): 23:00 to 17:00 (overnight 23:00 to 07:00, or daytime 07:00 to 17:00). Rate is ৳7.05/kWh.
- Sanctioned load limit: Never schedule simultaneous high-power appliances that together exceed ${household.sanctionedLoadKw * 1000} Watts in any single hour!
- Geysers/Water Heaters: Best in morning (05:30-07:00) or night (23:00-00:00).
- Washing Machines: Best in morning/midday (10:00-12:00 or 13:00-15:00) so clothes dry in sunlight.
- Water Pumps: Best in early morning (06:00-07:00) or midday (13:00-14:00) to fill rooftop water tanks.
- Air Conditioners: Night sleeping cycle (23:00-06:00) and afternoon pre-cooling (14:00-16:30).

Return strict JSON only (no markdown code fence, no extra words) matching this schema:
{
  "slots": [
    {
      "applianceId": string,
      "startHour": number, // integer 0 to 23
      "durationHours": number, // float or integer e.g. 1.5, 2, 6
      "notes": string
    }
  ],
  "reasoning": string
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const rawText = response.text?.trim() || '{}';
        const parsed = JSON.parse(rawText);

        if (parsed.slots && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
          const generatedSlots: ScheduledSlot[] = [];

          for (const s of parsed.slots) {
            const app = appliances.find(a => a.id === s.applianceId);
            if (!app) continue;

            const startH = Math.max(0, Math.min(23, Number(s.startHour) || 0));
            const durationH = Math.max(0.5, Math.min(8, Number(s.durationHours) || 2));
            const isOffPeak = this.isSlotOffPeak(startH, durationH);

            generatedSlots.push({
              id: `slot_${app.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              applianceId: app.id,
              applianceName: app.name,
              category: app.category,
              roomId: app.roomId,
              startHour: startH,
              durationHours: durationH,
              ratedPowerW: app.ratedPowerW,
              isOffPeak,
              deviceId: app.deviceId,
              hasRelay: Boolean(app.deviceId),
              notes: s.notes || 'Optimized by KilowattIQ Gemini AI',
            });
          }

          if (generatedSlots.length > 0) {
            const conflicts = this.detectConflicts(generatedSlots, household, appliances);
            const projectedImpact = this.calculateBillImpact(generatedSlots, household, appliances);
            if (parsed.reasoning) {
              projectedImpact.aiSummary = parsed.reasoning;
            }

            return {
              schedule: generatedSlots,
              conflicts,
              projectedImpact,
              generatedByAi: true,
              timestamp: new Date().toISOString(),
            };
          }
        }
      } catch (err) {
        console.warn('Gemini AI scheduler failed or timed out, using heuristic scheduler:', err);
      }
    }

    // Heuristic Fallback Optimizer
    return this.generateHeuristicSchedule(household, appliances, preferences);
  }

  /**
   * Deterministic expert rule-based scheduler tailored for Bangladeshi power dynamics
   */
  public static generateHeuristicSchedule(
    household: Household,
    appliances: Appliance[],
    preferences: OptimizationPreferences = {}
  ): OptimizationResult {
    const slots: ScheduledSlot[] = [];
    const sanctionedWatts = (household.sanctionedLoadKw || 3.0) * 1000;

    // Track hourly power allocation to avoid breaker trips
    const hourlyLoad = new Array(24).fill(0);

    // Helper: Find best off-peak slot for an appliance
    const placeAppliance = (
      app: Appliance,
      candidateStartHours: number[],
      durationHours: number,
      notes: string
    ) => {
      // Filter candidates to strictly off-peak slots
      const offPeakCandidates = candidateStartHours.filter(h => this.isSlotOffPeak(h, durationHours));
      const validCandidates = offPeakCandidates.length > 0 ? offPeakCandidates : candidateStartHours;

      let bestHour = validCandidates[0];
      let minPeakLoad = Infinity;

      for (const h of validCandidates) {
        let maxLoadDuringSlot = 0;
        let fitsUnderCap = true;

        for (let step = 0; step < Math.ceil(durationHours); step++) {
          const hourIndex = (h + step) % 24;
          const projected = hourlyLoad[hourIndex] + app.ratedPowerW;
          if (projected > sanctionedWatts) {
            fitsUnderCap = false;
          }
          if (projected > maxLoadDuringSlot) {
            maxLoadDuringSlot = projected;
          }
        }

        if (fitsUnderCap && maxLoadDuringSlot < minPeakLoad) {
          minPeakLoad = maxLoadDuringSlot;
          bestHour = h;
        }
      }

      // Commit to hourly load
      for (let step = 0; step < Math.ceil(durationHours); step++) {
        const hourIndex = (bestHour + step) % 24;
        hourlyLoad[hourIndex] += app.ratedPowerW;
      }

      const isOffPeak = this.isSlotOffPeak(bestHour, durationHours);

      slots.push({
        id: `slot_${app.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        applianceId: app.id,
        applianceName: app.name,
        category: app.category,
        roomId: app.roomId,
        startHour: bestHour,
        durationHours,
        ratedPowerW: app.ratedPowerW,
        isOffPeak,
        deviceId: app.deviceId,
        hasRelay: Boolean(app.deviceId),
        notes,
      });
    };

    // Sort heavy appliances first (Water Heaters, ACs, Washing Machines, Pumps)
    const sorted = [...appliances].sort((a, b) => b.ratedPowerW - a.ratedPowerW);

    for (const app of sorted) {
      switch (app.category) {
        case 'WATER_HEATER':
          // Schedule in off-peak morning (05:30 -> hour 5) or overnight (23:00)
          placeAppliance(
            app,
            preferences.preferNightTime ? [23, 0, 5] : [5, 6, 23],
            1.5,
            'Morning shower pre-heat in off-peak window (৳7.05/kWh vs ৳12.10/kWh)'
          );
          break;

        case 'WASHING_MACHINE':
          // Best daytime off-peak between 09:00 and 14:00 (avoids sleep disruption + sun drying)
          placeAppliance(
            app,
            preferences.avoidSleepDisruption ? [10, 11, 13, 14] : [10, 14, 23],
            2.0,
            'Daytime off-peak run; clothes line-dry in direct sunlight'
          );
          break;

        case 'AIR_CONDITIONER':
          // Deep night off-peak cooling 23:00 - 06:00 (7h) or 00:00 - 06:00
          // Avoids 17:00-23:00 peak!
          placeAppliance(
            app,
            [23, 0],
            Math.min(7, app.averageHoursPerDay || 6),
            'Night sleeping off-peak comfort cycle; keeps compressor idle during 17:00–23:00 peak'
          );
          break;

        case 'MICROWAVE':
          // Kitchen prep: 07:00 - 08:30 (breakfast off-peak) or 12:30 - 14:00 (lunch off-peak)
          placeAppliance(
            app,
            [7, 12, 13],
            0.5,
            'Meal prep aligned with off-peak rates'
          );
          break;

        case 'OTHER':
          // Water pumps / motors: 06:00 - 07:00 (morning tank fill) or 13:00 (afternoon tank fill)
          if (app.name.toLowerCase().includes('pump') || app.name.toLowerCase().includes('motor')) {
            placeAppliance(
              app,
              [6, 7, 13],
              1.0,
              'Rooftop water tank filling in off-peak morning'
            );
          } else if (app.ratedPowerW >= 800) {
            placeAppliance(
              app,
              [11, 14, 23],
              1.5,
              'Heavy load shifted to off-peak tariff'
            );
          }
          break;

        default:
          // For other moderate discretionary appliances (>300W)
          if (app.ratedPowerW >= 400 && app.category !== 'REFRIGERATOR' && app.category !== 'ROUTER') {
            placeAppliance(
              app,
              [10, 14, 15, 23],
              Math.min(3, app.averageHoursPerDay || 2),
              'Shifted to off-peak slot'
            );
          }
          break;
      }
    }

    const conflicts = this.detectConflicts(slots, household, appliances);
    const projectedImpact = this.calculateBillImpact(slots, household, appliances);

    return {
      schedule: slots,
      conflicts,
      projectedImpact,
      generatedByAi: false,
      timestamp: new Date().toISOString(),
    };
  }
}
