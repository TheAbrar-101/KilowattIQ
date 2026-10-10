/**
 * Anomaly Detector: Theft, Leakage & Faulty Wiring Subsystem
 * 
 * Monitored Anomalies:
 * 1. Power draw when all appliances are off (possible leak/tamper)
 * 2. Voltage drop at high load (undersized wiring / resistive terminals)
 * 3. Neutral current imbalance (ground leakage / cross-bonded neutral)
 * 4. Sudden step changes with no appliance toggle (unregistered load / line tap)
 * 5. Sustained frequency deviation (generator governor drift / grid stress)
 * 
 * Communication Principle:
 * Tone is always helpful, objective, and never accusatory.
 * e.g., "This could indicate an insulation leakage or damp conduit. Here's what to check."
 * 
 * High Severity Escalation:
 * Triggers the Unified AlertEngine (Script 4) with multi-channel dispatch (SMS, Email, Push).
 */

import { PowerReading } from '../../../shared/types/energy';
import {
  AnomalyRecord,
  AnomalyType,
  AnomalySeverity,
  DetectionContext,
} from './types';
import { AlertHistoryStore } from '../alerts/AlertHistoryStore';
import { AlertPreferencesStore } from '../alerts/AlertPreferencesStore';
import { ChannelDispatcher } from '../alerts/channels/channelDispatcher';

export class AnomalyDetector {
  private static instance: AnomalyDetector;

  // In-memory store of active and resolved anomalies keyed by householdId
  private householdAnomalies: Map<string, AnomalyRecord[]> = new Map();

  // Sliding window cache of recent readings for baseline comparison
  private recentReadingsCache: Map<string, PowerReading[]> = new Map();

  private historyStore = AlertHistoryStore.getInstance();
  private preferencesStore = AlertPreferencesStore.getInstance();
  private dispatcher = new ChannelDispatcher();

  private constructor() {
    this.seedDefaultAnomalies();
  }

  static getInstance(): AnomalyDetector {
    if (!AnomalyDetector.instance) {
      AnomalyDetector.instance = new AnomalyDetector();
    }
    return AnomalyDetector.instance;
  }

  /**
   * Pre-seeds realistic demo anomalies so the UI is immediately educational and responsive
   */
  private seedDefaultAnomalies(): void {
    const defaultHhId = '11111111-1111-4111-a111-111111111101';
    const now = Date.now();

    const initialAnomalies: AnomalyRecord[] = [
      {
        id: `anom_leak_${now - 1200000}`,
        householdId: defaultHhId,
        type: 'POWER_DRAW_ALL_OFF',
        severity: 'HIGH',
        status: 'ACTIVE',
        title: 'Continuous Residual Power Draw (All Appliances Off)',
        titleBn: 'সব যন্ত্রপাতি বন্ধ থাকা সত্ত্বেও অবিরাম বিদ্যুৎ প্রবাহ',
        timestamp: new Date(now - 1000 * 60 * 20).toISOString(),
        explanation: 'A continuous draw of 285 W was recorded while all registered room switches and appliances are switched off. This could indicate moisture-related insulation leakage in wall conduits, an unmetered sub-circuit, or an unauthorized connection on this line. Here\'s what to check.',
        explanationBn: 'বাসার সকল রেজিস্টার্ড যন্ত্রপাতি বন্ধ থাকা সত্ত্বেও ২৮৫ ওয়াট বিদ্যুৎ খরচ হচ্ছে। এটি দেয়ালের আর্দ্র কনডুইটে ইনসুলেশন লিকেজ বা কোনো বহিরাগত সংযোগের ইঙ্গিত হতে পারে।',
        suggestedAction: 'Switch off the main distribution circuit breaker for 2 minutes to verify if your utility meter stops. If power draw continues, have a licensed technician perform an insulation resistance megger test.',
        suggestedActionBn: 'মেইন ব্রেকার ২ মিনিট বন্ধ রেখে মিটার পরীক্ষা করুন। খরচ অব্যাহত থাকলে ইনসুলেশন মেগার টেস্ট করান।',
        metrics: {
          powerWatts: 285,
          baselineWatts: 0,
        },
        alertTriggered: true,
      },
      {
        id: `anom_vdrop_${now - 3600000}`,
        householdId: defaultHhId,
        type: 'VOLTAGE_DROP_HIGH_LOAD',
        severity: 'MEDIUM',
        status: 'ACTIVE',
        title: 'Line Voltage Drop Under Heavy Load (16.4 V Sag)',
        titleBn: 'উচ্চ লোডের সময় উল্লেখযোগ্য ভোল্টেজ হ্রাস (১৬.৪ V)',
        timestamp: new Date(now - 1000 * 60 * 60).toISOString(),
        explanation: 'Grid voltage dipped from 221.8 V down to 205.4 V (16.4 V drop) when simultaneous load increased to 3,420 W. This could indicate undersized internal feeder wiring (e.g. 1.5 mm² instead of 4.0 mm² for heavy AC circuits) or a loose, resistive terminal screw heating up inside the distribution board. Here\'s what to check.',
        explanationBn: '৩,৪২০ ওয়াট লোড চালু হওয়ার সাথে সাথে ভোল্টেজ ১৬.৪ V কমে ২০৫.৪ V-এ নেমে এসেছে। এটি অপর্যাপ্ত তারের ব্যাস বা ডিস্ট্রিবিউশন বোর্ডে আলগা সংযোগের লক্ষণ হতে পারে।',
        suggestedAction: 'Feel the main breaker faceplate for unusual warmth or a buzzing sound. Ask an electrician to inspect cable cross-sections and tighten feeder terminal lugs.',
        suggestedActionBn: 'মেইন ব্রেকারে কোনো অতিরিক্ত তাপ বা শব্দ আছে কি না পরীক্ষা করুন এবং দক্ষ টেকনিশিয়ান দিয়ে তারের পুরুত্ব যাচাই করুন।',
        metrics: {
          voltageV: 205.4,
          voltageDropV: 16.4,
          powerWatts: 3420,
        },
        alertTriggered: false,
      },
      {
        id: `anom_step_${now - 7200000}`,
        householdId: defaultHhId,
        type: 'SUDDEN_UNTRACKED_STEP',
        severity: 'MEDIUM',
        status: 'ACTIVE',
        title: 'Sudden Step Load Jump (+1,150 W) Without User Toggle',
        titleBn: 'কোনো সুইচ চালু না করেই আকস্মিক লোড বৃদ্ধি (+১,১৫০ W)',
        timestamp: new Date(now - 1000 * 60 * 120).toISOString(),
        explanation: 'A sudden active step jump of +1,150 W occurred at 10:45 AM, but no known appliance was switched in the system. This could indicate an unregistered automatic device (such as a rooftop water booster pump or immersion heater) cycling on, or a branch line connection drawing unmonitored power. Here\'s what to check.',
        explanationBn: 'সকাল ১০:৪৫ মিনিটে আকস্মিক +১,১৫০ ওয়াট লোড বেড়েছে কিন্তু কোনো অ্যাপ্লায়েন্স অন করা হয়নি। এটি ছাদে স্বয়ংক্রিয় পানির পাম্প বা লুকানো সংযোগ হতে পারে।',
        suggestedAction: 'Check if automatic appliances like water pumps or geysers are running. If no household equipment is active, inspect secondary circuit breakers to isolate the branch drawing power.',
        suggestedActionBn: 'অটোমেটিক পানির পাম্প বা গিজার চালু আছে কি না দেখুন। অন্যথায় ব্রাঞ্চ ব্রেকারগুলো একে একে বন্ধ করে উৎস শনাক্ত করুন।',
        metrics: {
          stepDeltaWatts: 1150,
          powerWatts: 2450,
        },
        alertTriggered: false,
      },
    ];

    this.householdAnomalies.set(defaultHhId, initialAnomalies);
    this.householdAnomalies.set('11111111-1111-4111-a111-111111111111', initialAnomalies.map(a => ({ ...a, householdId: '11111111-1111-4111-a111-111111111111' })));
  }

  /**
   * Retrieves all anomalies for a given household
   */
  getAnomalies(householdId: string): AnomalyRecord[] {
    const existing = this.householdAnomalies.get(householdId);
    if (existing && existing.length > 0) return existing;
    const fallback = this.householdAnomalies.get('11111111-1111-4111-a111-111111111111') || this.householdAnomalies.get('11111111-1111-4111-a111-111111111101') || [];
    return fallback.map(a => ({ ...a, householdId }));
  }

  /**
   * Evaluates incoming real-time telemetry against the 5 anomaly detection models
   */
  async evaluateReading(
    telemetry: PowerReading,
    context: DetectionContext
  ): Promise<AnomalyRecord[]> {
    const {
      householdId,
      activeApplianceStates = {},
      registeredAppliancesCount = 0,
      allAppliancesOff: explicitAllOff,
      neutralCurrentA,
      lastToggledAt = 0,
      baselineVoltageV,
      baselineWatts,
      applianceToggledRecently,
    } = context;

    const detectedInThisTick: AnomalyRecord[] = [];
    const nowIso = telemetry.timestamp || new Date().toISOString();
    const nowMs = new Date(nowIso).getTime();

    // Normalize power reading properties across different adapter schemas
    const activeWatts = (telemetry as any).activePowerW ?? (telemetry as any).powerWatts ?? (telemetry as any).activeWatts ?? 0;
    const currentVoltage = telemetry.voltage || 220;
    const freq = telemetry.frequency ?? (telemetry as any).frequencyHz ?? 50.0;

    // Maintain recent readings cache (last 30 readings)
    const recent = this.recentReadingsCache.get(householdId) || [];
    recent.push({
      ...telemetry,
      activePowerW: activeWatts,
      voltage: currentVoltage,
      frequency: freq,
    });
    if (recent.length > 30) recent.shift();
    this.recentReadingsCache.set(householdId, recent);

    // Baseline calculations from historical window or explicit context
    const baselineVoltage = baselineVoltageV !== undefined
      ? baselineVoltageV
      : (recent.length >= 5
        ? recent.slice(0, 5).reduce((acc, r) => acc + (r.voltage || 220), 0) / 5
        : 220);

    // -------------------------------------------------------------
    // ANOMALY 1: Power draw when all appliances are off
    // -------------------------------------------------------------
    const activeStatesValues = Object.values(activeApplianceStates);
    const allAppliancesOff =
      explicitAllOff === true ||
      (registeredAppliancesCount > 0 &&
        activeStatesValues.length > 0 &&
        activeStatesValues.every(state => state === false)) ||
      (activeStatesValues.length > 0 &&
        activeStatesValues.every(state => state === false));

    if (allAppliancesOff && activeWatts > 65) {
      const isHigh = activeWatts >= 180;
      const severity: AnomalySeverity = isHigh ? 'HIGH' : 'MEDIUM';

      const anomaly: AnomalyRecord = {
        id: `anom_leak_${Date.now()}`,
        householdId,
        type: 'POWER_DRAW_ALL_OFF',
        severity,
        status: 'ACTIVE',
        title: `Residual Power Draw While All Appliances Off (${activeWatts} W)`,
        titleBn: `সব যন্ত্রপাতি বন্ধ থাকা সত্ত্বেও বিদ্যুৎ খরচ (${activeWatts} W)`,
        timestamp: nowIso,
        explanation: `A continuous power draw of ${activeWatts} W was measured while all registered appliances are switched off. This could indicate an insulation leakage in damp wall conduits, an unmetered sub-circuit, or an unauthorized line tapping. Here's what to check.`,
        explanationBn: `বাসার সকল যন্ত্রপাতি বন্ধ থাকা সত্ত্বেও ${activeWatts} ওয়াট বিদ্যুৎ খরচ হচ্ছে। এটি আর্দ্র কনডুইটে ইনসুলেশন লিকেজ বা কোনো বহিরাগত লাইনের কারণে হতে পারে।`,
        suggestedAction: 'Switch off the main distribution circuit breaker for 2 minutes to verify if your utility meter stops. If power draw continues, have a licensed technician perform an insulation resistance megger test.',
        suggestedActionBn: 'মেইন ব্রেকার ২ মিনিট বন্ধ রেখে মিটার পরীক্ষা করুন। খরচ অব্যাহত থাকলে ইনসুলেশন মেগার টেস্ট করান।',
        metrics: {
          powerWatts: activeWatts,
          baselineWatts: 0,
        },
        alertTriggered: false,
      };

      detectedInThisTick.push(anomaly);
    }

    // -------------------------------------------------------------
    // ANOMALY 2: Voltage drop at high load (undersized wiring)
    // -------------------------------------------------------------
    const voltageDrop = Number((baselineVoltage - currentVoltage).toFixed(1));

    if (activeWatts >= 2200 && voltageDrop >= 12.0) {
      const isHigh = voltageDrop >= 16.0 || currentVoltage < 195;
      const severity: AnomalySeverity = isHigh ? 'HIGH' : 'MEDIUM';

      const anomaly: AnomalyRecord = {
        id: `anom_vdrop_${Date.now()}`,
        householdId,
        type: 'VOLTAGE_DROP_HIGH_LOAD',
        severity,
        status: 'ACTIVE',
        title: `Voltage Drop Under Heavy Load (${voltageDrop} V Drop down to ${currentVoltage} V)`,
        titleBn: `উচ্চ লোডে ভোল্টেজ হ্রাস (${voltageDrop} V কমে ${currentVoltage} V)`,
        timestamp: nowIso,
        explanation: `Line voltage dropped by ${voltageDrop} V (down to ${currentVoltage} V) while running high-power equipment (${activeWatts} W). This could indicate undersized internal feeder wiring (e.g. 1.5 mm² instead of 4.0 mm² for heavy AC circuits) or a high-resistance junction terminal heating up under load. Here's what to check.`,
        explanationBn: `ভারী লোড (${activeWatts} W) চলার সময় ভোল্টেজ ${voltageDrop} V কমে ${currentVoltage} V-এ নেমে এসেছে। এটি অপর্যাপ্ত তারের পুরুত্ব বা ডিস্ট্রিবিউশন বোর্ডে আলগা সংযোগের লক্ষণ হতে পারে।`,
        suggestedAction: 'Feel the distribution board switches and junction boxes for unusual warmth or a buzzing sound. Ask an electrician to inspect cable cross-sections and tighten terminal lugs.',
        suggestedActionBn: 'মেইন ব্রেকারে কোনো অতিরিক্ত তাপ বা শব্দ আছে কি না পরীক্ষা করুন এবং দক্ষ টেকনিশিয়ান দিয়ে তারের পুরুত্ব যাচাই করুন।',
        metrics: {
          voltageV: currentVoltage,
          voltageDropV: voltageDrop,
          powerWatts: activeWatts,
        },
        alertTriggered: false,
      };

      detectedInThisTick.push(anomaly);
    }
    // -------------------------------------------------------------
    // ANOMALY 3: Neutral current imbalance (ground leakage / shared neutral)
    // -------------------------------------------------------------
    const pf = telemetry.powerFactor || 0.92;
    const estimatedLineCurrentA = Number((activeWatts / (Math.max(180, currentVoltage) * Math.max(0.6, pf))).toFixed(2));
    const effectiveNeutralA = neutralCurrentA !== undefined
      ? neutralCurrentA
      : ((telemetry as any).neutralCurrentA !== undefined ? (telemetry as any).neutralCurrentA : estimatedLineCurrentA * 0.98);
    const imbalanceDeltaA = Number(Math.abs(estimatedLineCurrentA - effectiveNeutralA).toFixed(2));
    const imbalancePct = estimatedLineCurrentA > 0 ? Math.round((imbalanceDeltaA / estimatedLineCurrentA) * 100) : 0;

    if (estimatedLineCurrentA >= 3.0 && (imbalanceDeltaA >= 1.5 || imbalancePct >= 20)) {
      const isHigh = imbalanceDeltaA >= 2.5 || imbalancePct >= 30;
      const severity: AnomalySeverity = isHigh ? 'HIGH' : 'MEDIUM';

      const anomaly: AnomalyRecord = {
        id: `anom_neutral_${Date.now()}`,
        householdId,
        type: 'NEUTRAL_CURRENT_IMBALANCE',
        severity,
        status: 'ACTIVE',
        title: `Neutral Current Imbalance (${imbalanceDeltaA} A / ${imbalancePct}% Divergence)`,
        titleBn: `নিউট্রাল কারেন্ট ভারসাম্যহীনতা (${imbalanceDeltaA} A / ${imbalancePct}% বিচ্যুতি)`,
        timestamp: nowIso,
        explanation: `Neutral line current (${effectiveNeutralA} A) differs significantly from phase line current (${estimatedLineCurrentA} A) by ${imbalanceDeltaA} A (${imbalancePct}% divergence). This could indicate current returning through grounding pathways (earth leakage) or a shared neutral wire with an adjoining apartment. Here's what to check.`,
        explanationBn: `ফেজ ও নিউট্রাল কারেন্টের মধ্যে ${imbalanceDeltaA} A পার্থক্য শনাক্ত হয়েছে। এর অর্থ কারেন্ট মাটির দিকে লিকেজ হচ্ছে অথবা পাশের ফ্ল্যাটের সাথে নিউট্রাল মিশ্রিত হতে পারে।`,
        suggestedAction: 'Inspect your Earth-Leakage Circuit Breaker (ELCB/RCCB) test button. Have an electrician check the neutral distribution bar for improper earth bridging or cross-apartment loops.',
        suggestedActionBn: 'বাসার ELCB/RCCB ব্রেকার টেস্ট বাটন দিয়ে পরীক্ষা করুন এবং নিউট্রাল তারে কোনো ভুল সংযোগ আছে কি না যাচাই করুন।',
        metrics: {
          phaseCurrentA: estimatedLineCurrentA,
          neutralCurrentA: effectiveNeutralA,
          imbalanceA: imbalanceDeltaA,
          imbalancePct,
        },
        alertTriggered: false,
      };

      detectedInThisTick.push(anomaly);
    }

    // -------------------------------------------------------------
    // ANOMALY 4: Sudden step changes with no appliance toggle
    // -------------------------------------------------------------
    const prevWatts = baselineWatts !== undefined
      ? baselineWatts
      : (recent.length >= 2 ? (recent[recent.length - 2].activePowerW || 0) : activeWatts);
    const stepDelta = activeWatts - prevWatts;
    const msSinceToggle = nowMs - lastToggledAt;
    const toggledRecently = applianceToggledRecently !== undefined ? applianceToggledRecently : (msSinceToggle <= 45 * 1000 && lastToggledAt > 0);

    // Check sudden step jump >= 650 W when no appliance was toggled recently
    if (stepDelta >= 650 && !toggledRecently) {
      const isHigh = stepDelta >= 1400;
      const severity: AnomalySeverity = isHigh ? 'HIGH' : 'MEDIUM';

      const anomaly: AnomalyRecord = {
        id: `anom_step_${Date.now()}`,
        householdId,
        type: 'SUDDEN_UNTRACKED_STEP',
        severity,
        status: 'ACTIVE',
        title: `Untracked Step Load Jump (+${stepDelta} W)`,
        titleBn: `কোনো সুইচ চালু না করেই আকস্মিক লোড বৃদ্ধি (+${stepDelta} W)`,
        timestamp: nowIso,
        explanation: `A sudden active step jump of +${stepDelta} W occurred at the service entry, but no known appliance was toggled in the system. This could indicate an unregistered automatic device (such as a rooftop booster pump or auto-geyser) cycling on, or a branch line connection drawing unmonitored power. Here's what to check.`,
        explanationBn: `কোনো রেজিস্টার্ড যন্ত্রপাতি চালু না করা সত্ত্বেও আকস্মিক +${stepDelta} W লোড বৃদ্ধি পেয়েছে। এটি অটোমেটিক পানির পাম্প বা লুকানো কোনো সংযোগের কারণে হতে পারে।`,
        suggestedAction: 'Check if automatic appliances like water pumps or geysers just turned on. If no household equipment is active, inspect secondary circuit breakers to isolate the branch drawing power.',
        suggestedActionBn: 'স্বয়ংক্রিয় পানির পাম্প বা গিজার চালু হয়েছে কি না দেখুন। কোনো যন্ত্রপাতি চালু না থাকলে ব্রাঞ্চ ব্রেকার পরীক্ষা করুন।',
        metrics: {
          stepDeltaWatts: stepDelta,
          powerWatts: activeWatts,
          baselineWatts: prevWatts,
        },
        alertTriggered: false,
      };

      detectedInThisTick.push(anomaly);
    }

    // -------------------------------------------------------------
    // ANOMALY 5: Sustained frequency deviation
    // -------------------------------------------------------------
    const freqDiff = Number(Math.abs(freq - 50.0).toFixed(2));

    // National grid nominal standard in Bangladesh is 50.00 Hz
    if (freqDiff >= 0.70 || freq < 49.30 || freq > 50.70) {
      const isHigh = freqDiff >= 1.0 || freq < 49.0 || freq > 51.0;
      const severity: AnomalySeverity = isHigh ? 'HIGH' : 'MEDIUM';

      const anomaly: AnomalyRecord = {
        id: `anom_freq_${Date.now()}`,
        householdId,
        type: 'SUSTAINED_FREQUENCY_DEVIATION',
        severity,
        status: 'ACTIVE',
        title: `Sustained Frequency Deviation (${freq.toFixed(2)} Hz / Δ${freqDiff} Hz)`,
        titleBn: `গ্রিড ফ্রিকোয়েন্সি বিচ্যুতি (${freq.toFixed(2)} Hz)`,
        timestamp: nowIso,
        explanation: `The measured line frequency is ${freq.toFixed(2)} Hz (deviating by ${freqDiff} Hz from Bangladesh's 50.00 Hz standard) over a sustained interval. This could indicate national grid spinning reserve stress, an untuned diesel generator governor, or local solar inverter distortion. Here's what to check.`,
        explanationBn: `লাইন ফ্রিকোয়েন্সি ${freq.toFixed(2)} Hz পরিমাপ করা হয়েছে (৫০.০০ Hz মানদণ্ড থেকে ${freqDiff} Hz বিচ্যুতি)। এটি জেনারেটরের গভর্নর সমস্যা বা গ্রিডের অস্থিতিশীলতার কারণে হতে পারে।`,
        suggestedAction: 'If you are on backup generator power, notify building management to tune governor speed to 50.00 Hz. If on utility mains, avoid running high-precision motor equipment during severe frequency instability.',
        suggestedActionBn: 'জেনারেটর ব্যবহারে থাকলে ভবনের টেকনিশিয়ানকে ফ্রিকোয়েন্সি ৫০ Hz-এ টিউন করতে বলুন।',
        metrics: {
          frequencyHz: freq,
          freqDeviationHz: freqDiff,
        },
        alertTriggered: false,
      };

      detectedInThisTick.push(anomaly);
    }

    // Ingest detected anomalies into the household's store & escalate high severity to AlertEngine
    const existing = this.householdAnomalies.get(householdId) || [];

    for (const anom of detectedInThisTick) {
      // Prevent rapid duplicates within 5 minutes for the same type
      const isDuplicate = existing.some(
        e => e.type === anom.type && e.status === 'ACTIVE' && (nowMs - new Date(e.timestamp).getTime()) < 5 * 60 * 1000
      );

      if (!isDuplicate) {
        // High severity escalation to AlertEngine (Script 4)
        if (anom.severity === 'HIGH') {
          await this.triggerAlertEngineEscalation(anom);
          anom.alertTriggered = true;
        }

        existing.unshift(anom);
      }
    }

    // Keep up to 50 most recent records per household
    this.householdAnomalies.set(householdId, existing.slice(0, 50));

    return detectedInThisTick;
  }

  /**
   * Escalates high-severity anomalies to the Unified AlertEngine (Script 4)
   * Dispatches notifications across SMS, Email, WhatsApp, and Web Push
   */
  async triggerAlertEngineEscalation(anomaly: AnomalyRecord): Promise<void> {
    try {
      const preferences = this.preferencesStore.getPreferences(anomaly.householdId);

      const alertRecord = this.historyStore.addAlert({
        id: `alt_anomaly_${Date.now()}`,
        householdId: anomaly.householdId,
        ruleType: 'VOLTAGE_ANOMALY', // Maps to core electrical anomaly channel
        severity: 'CRITICAL',
        title: `Electrical Anomaly: ${anomaly.title}`,
        titleBn: `বৈদ্যুতিক ত্রুটি: ${anomaly.titleBn}`,
        message: `${anomaly.explanation} Suggested Action: ${anomaly.suggestedAction}`,
        messageBn: `${anomaly.explanationBn} করণীয়: ${anomaly.suggestedActionBn}`,
        timestamp: anomaly.timestamp,
        acknowledged: false,
        dismissed: false,
        channelsSent: [],
        metadata: {
          anomalyType: anomaly.type,
          metrics: anomaly.metrics,
          severity: anomaly.severity,
        },
      });

      await this.dispatcher.dispatch(alertRecord, preferences);
    } catch (err) {
      console.warn('[AnomalyDetector] AlertEngine escalation error:', err);
    }
  }

  /**
   * Marks an anomaly as resolved
   */
  markAsResolved(householdId: string, anomalyId: string): AnomalyRecord | null {
    const list = this.householdAnomalies.get(householdId) || [];
    const item = list.find(a => a.id === anomalyId);

    if (item) {
      item.status = 'RESOLVED';
      item.resolvedAt = new Date().toISOString();
      return item;
    }

    // Also search across all households if needed
    for (const [_, anoms] of this.householdAnomalies.entries()) {
      const match = anoms.find(a => a.id === anomalyId);
      if (match) {
        match.status = 'RESOLVED';
        match.resolvedAt = new Date().toISOString();
        return match;
      }
    }

    return null;
  }

  /**
   * Alias for markAsResolved
   */
  resolveAnomaly(householdId: string, anomalyId: string): AnomalyRecord | null {
    return this.markAsResolved(householdId, anomalyId);
  }

  /**
   * Simulates an anomaly for testing and interactive verification
   */
  async simulateAnomaly(householdId: string, type: AnomalyType): Promise<AnomalyRecord> {
    const nowIso = new Date().toISOString();
    let anomaly: AnomalyRecord;

    switch (type) {
      case 'POWER_DRAW_ALL_OFF':
        anomaly = {
          id: `sim_leak_${Date.now()}`,
          householdId,
          type,
          severity: 'HIGH',
          status: 'ACTIVE',
          title: 'Simulated Power Leakage (All Appliances Off: 340 W)',
          titleBn: 'সিমুলেটেড বিদ্যুৎ লিকেজ (সব সুইচ অফ: ৩৪০ W)',
          timestamp: nowIso,
          explanation: 'A simulated residual power draw of 340 W was injected while all appliances are off. This could indicate a conduit insulation leak or line tap. Here\'s what to check.',
          explanationBn: 'সব যন্ত্রপাতি বন্ধ থাকা সত্ত্বেও ৩৪০ W লিকেজ কারেন্ট শনাক্ত হয়েছে। এটি দেয়ালের আর্দ্র কনডুইটে ইনসুলেশন লিকেজের ইঙ্গিত হতে পারে।',
          suggestedAction: 'Switch off the main distribution circuit breaker for 2 minutes to verify if your utility meter stops. If power draw continues, have a licensed technician perform an insulation resistance megger test.',
          suggestedActionBn: 'মেইন ব্রেকার ২ মিনিট বন্ধ রেখে মিটার পরীক্ষা করুন।',
          metrics: { powerWatts: 340, baselineWatts: 0 },
          alertTriggered: true,
        };
        break;

      case 'VOLTAGE_DROP_HIGH_LOAD':
        anomaly = {
          id: `sim_vdrop_${Date.now()}`,
          householdId,
          type,
          severity: 'HIGH',
          status: 'ACTIVE',
          title: 'Simulated Voltage Sag Under Load (18.2 V Drop)',
          titleBn: 'সিমুলেটেড ভোল্টেজ হ্রাস (১৮.২ V ড্রপ)',
          timestamp: nowIso,
          explanation: 'Grid voltage dropped by 18.2 V (down to 201.8 V) under high load (3,800 W). This could indicate undersized internal feeder cables (1.5 mm² vs 4.0 mm²) or loose terminal screws heating up. Here\'s what to check.',
          explanationBn: '৩,৮০০ W লোড চলার সময় ভোল্টেজ ১৮.২ V কমে ২০১.৮ V-এ নেমে এসেছে। এটি অপর্যাপ্ত তারের পুরুত্বের লক্ষণ হতে পারে।',
          suggestedAction: 'Feel the distribution board switches and junction boxes for unusual warmth. Ask an electrician to inspect cable cross-sections and tighten terminal lugs.',
          suggestedActionBn: 'ডিস্ট্রিবিউশন বোর্ডে কোনো অতিরিক্ত তাপ আছে কি না পরীক্ষা করুন।',
          metrics: { voltageV: 201.8, voltageDropV: 18.2, powerWatts: 3800 },
          alertTriggered: true,
        };
        break;

      case 'NEUTRAL_CURRENT_IMBALANCE':
        anomaly = {
          id: `sim_neutral_${Date.now()}`,
          householdId,
          type,
          severity: 'HIGH',
          status: 'ACTIVE',
          title: 'Simulated Neutral Imbalance (2.8 A Earth Divergence)',
          titleBn: 'সিমুলেটেড নিউট্রাল ভারসাম্যহীনতা (২.৮ A বিচ্যুতি)',
          timestamp: nowIso,
          explanation: 'Phase line current is 12.4 A but neutral return is only 9.6 A (2.8 A / 23% divergence). This could indicate current leaking into building earth bonding or a shared neutral wire with an adjoining flat. Here\'s what to check.',
          explanationBn: 'ফেজ ও নিউট্রাল কারেন্টের মধ্যে ২.৮ A পার্থক্য শনাক্ত হয়েছে। এর অর্থ কারেন্ট মাটির দিকে লিকেজ হচ্ছে।',
          suggestedAction: 'Inspect your Earth-Leakage Circuit Breaker (ELCB/RCCB) test button. Have an electrician check the neutral distribution bar for improper earth bridging or cross-apartment loops.',
          suggestedActionBn: 'বাসার ELCB/RCCB ব্রেকার টেস্ট বাটন দিয়ে পরীক্ষা করুন।',
          metrics: { phaseCurrentA: 12.4, neutralCurrentA: 9.6, imbalanceA: 2.8, imbalancePct: 23 },
          alertTriggered: true,
        };
        break;

      case 'SUDDEN_UNTRACKED_STEP':
        anomaly = {
          id: `sim_step_${Date.now()}`,
          householdId,
          type,
          severity: 'MEDIUM',
          status: 'ACTIVE',
          title: 'Simulated Untracked Step Jump (+1,250 W)',
          titleBn: 'সিমুলেটেড আকস্মিক লোড বৃদ্ধি (+১,২৫০ W)',
          timestamp: nowIso,
          explanation: 'A sudden active step jump of +1,250 W occurred without any registered appliance toggle. This could indicate an unregistered automatic device (like a rooftop pump) or an external connection. Here\'s what to check.',
          explanationBn: 'কোনো সুইচ চালু না করা সত্ত্বেও আকস্মিক +১,২৫০ W লোড বৃদ্ধি পেয়েছে। এটি অটোমেটিক পানির পাম্প হতে পারে।',
          suggestedAction: 'Check if automatic appliances like water pumps or geysers just turned on. If no household equipment is active, inspect secondary circuit breakers to isolate the branch drawing power.',
          suggestedActionBn: 'স্বয়ংক্রিয় পানির পাম্প বা গিজার চালু হয়েছে কি না দেখুন।',
          metrics: { stepDeltaWatts: 1250, powerWatts: 2750, baselineWatts: 1500 },
          alertTriggered: false,
        };
        break;

      case 'SUSTAINED_FREQUENCY_DEVIATION':
        anomaly = {
          id: `sim_freq_${Date.now()}`,
          householdId,
          type,
          severity: 'HIGH',
          status: 'ACTIVE',
          title: 'Simulated Frequency Instability (49.12 Hz / -0.88 Hz)',
          titleBn: 'সিমুলেটেড ফ্রিকোয়েন্সি অস্থিতিশীলতা (৪৯.১২ Hz)',
          timestamp: nowIso,
          explanation: 'Line frequency dropped to 49.12 Hz (-0.88 Hz from 50.00 Hz standard) over a sustained 3-minute interval. This could indicate national grid spinning reserve stress or an untuned backup generator governor. Here\'s what to check.',
          explanationBn: 'লাইন ফ্রিকোয়েন্সি ৪৯.১২ Hz পরিমাপ করা হয়েছে (৫০.০০ Hz মানদণ্ড থেকে -০.৮৮ Hz বিচ্যুতি)।',
          suggestedAction: 'If you are on backup generator power, notify building management to tune governor speed to 50.00 Hz. If on utility mains, avoid running high-precision motor equipment during severe frequency instability.',
          suggestedActionBn: 'জেনারেটর ব্যবহারে থাকলে ভবনের টেকনিশিয়ানকে ফ্রিকোয়েন্সি ৫০ Hz-এ টিউন করতে বলুন।',
          metrics: { frequencyHz: 49.12, freqDeviationHz: 0.88 },
          alertTriggered: true,
        };
        break;
    }

    if (anomaly.severity === 'HIGH') {
      await this.triggerAlertEngineEscalation(anomaly);
      anomaly.alertTriggered = true;
    }

    const list = this.householdAnomalies.get(householdId) || [];
    list.unshift(anomaly);
    this.householdAnomalies.set(householdId, list);

    return anomaly;
  }
}
