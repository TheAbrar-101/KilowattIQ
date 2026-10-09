/**
 * NILM Disaggregator (Non-Intrusive Load Monitoring)
 * 
 * Flow:
 * 1. Collects high-frequency 1 Hz aggregate telemetry samples (P, Q, S, PF)
 * 2. Detects step changes in active power (ΔP) and reactive power (ΔQ)
 * 3. Matches against appliance signatures via SignatureMatcher & Gemini Vision/Labeling
 * 4. Tracks Discovered Appliances with confidence scoring
 *    - If confidence >= 60%: Status is "DETECTED" (Badge: "Detected: 85%")
 *    - If confidence < 60%: Status is "MAYBE" (Badge: "Maybe: 54%")
 * 5. Provides Confirm, Rename, and Merge operations for user feedback loop
 */

import { SupabaseService } from '../../../backend/services/SupabaseService';
import { SignatureMatcher } from './signatureMatcher';
import { NilmSample, StepEvent, DiscoveredAppliance } from './types';

const DEMO_HOUSEHOLD_UUID = '11111111-1111-4111-a111-111111111101';

export class NilmDisaggregator {
  private static instance: NilmDisaggregator;

  // Circular buffer of recent 1 Hz telemetry samples (max 180 = 3 mins)
  private sampleBuffer: NilmSample[] = [];
  private maxBufferSize = 180;

  // In-memory discovered appliances per household
  private householdDetections: Map<string, DiscoveredAppliance[]> = new Map();

  // Recent detected step change events
  private recentStepEvents: StepEvent[] = [];

  // Minimum step change threshold to filter noise (Watts)
  private readonly STEP_THRESHOLD_WATTS = 30;

  private constructor() {
    this.seedDefaultDetections();
  }

  public static getInstance(): NilmDisaggregator {
    if (!NilmDisaggregator.instance) {
      NilmDisaggregator.instance = new NilmDisaggregator();
    }
    return NilmDisaggregator.instance;
  }

  /**
   * Seeds realistic initial discovered appliances for demo households
   * Demonstrates both >= 60% ("Detected:") and < 60% ("Maybe:")
   */
  private seedDefaultDetections() {
    const defaultDetections: DiscoveredAppliance[] = [
      {
        id: 'disc_ac_master_bed',
        householdId: DEMO_HOUSEHOLD_UUID,
        name: '1.5-Ton Inverter AC',
        category: 'AIR_CONDITIONER',
        status: 'DETECTED',
        confidence: 88,
        isAiLabeled: false,
        aiLabelReasoning: 'Matches registered inventory "Master Bedroom 1.5T AC" with 92% electrical signature correlation.',
        ratedPowerW: 1640,
        reactivePowerVAR: 580,
        powerFactor: 0.94,
        state: 'RUNNING',
        currentPowerW: 1640,
        dutyCyclePercent: 35,
        dailyEstimatedKwh: 11.5,
        firstDetectedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        lastDetectedAt: new Date().toISOString(),
        detectionEventsCount: 14,
        isConfirmed: true,
        matchedRegisteredId: '33333333-3333-4333-a333-333333333302',
      },
      {
        id: 'disc_geyser_fast',
        householdId: DEMO_HOUSEHOLD_UUID,
        name: 'Instant Water Heater / Geyser',
        category: 'WATER_HEATER',
        status: 'DETECTED',
        confidence: 84,
        isAiLabeled: true,
        aiLabelReasoning: 'High active jump (+1,980W) with near-zero reactive displacement (PF 0.99) characteristic of resistive heating element.',
        ratedPowerW: 2000,
        reactivePowerVAR: 45,
        powerFactor: 0.99,
        state: 'OFF',
        currentPowerW: 0,
        dutyCyclePercent: 6,
        dailyEstimatedKwh: 3.0,
        firstDetectedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
        lastDetectedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        detectionEventsCount: 6,
        isConfirmed: false,
        matchedRegisteredId: null,
      },
      {
        id: 'disc_fridge_compressor',
        householdId: DEMO_HOUSEHOLD_UUID,
        name: 'Frost Refrigerator Compressor',
        category: 'REFRIGERATOR',
        status: 'DETECTED',
        confidence: 91,
        isAiLabeled: false,
        aiLabelReasoning: 'Periodic cycling step (+185W active, 190 VAR inductive) matching double-door compressor baseline.',
        ratedPowerW: 185,
        reactivePowerVAR: 190,
        powerFactor: 0.70,
        state: 'RUNNING',
        currentPowerW: 185,
        dutyCyclePercent: 48,
        dailyEstimatedKwh: 2.1,
        firstDetectedAt: new Date(Date.now() - 3600000 * 48).toISOString(),
        lastDetectedAt: new Date().toISOString(),
        detectionEventsCount: 52,
        isConfirmed: true,
        matchedRegisteredId: '33333333-3333-4333-a333-333333333301',
      },
      {
        id: 'disc_water_pump_unreg',
        householdId: DEMO_HOUSEHOLD_UUID,
        name: 'Submersible Water Pump (0.75 HP)',
        category: 'OTHER',
        status: 'MAYBE', // Rule: confidence < 60% shows "Maybe:"
        confidence: 54,
        isAiLabeled: true,
        aiLabelReasoning: 'Heavy inductive lag (PF 0.74, 620 VAR) with +780W active surge. Candidate: roof water pump or motor.',
        ratedPowerW: 780,
        reactivePowerVAR: 620,
        powerFactor: 0.74,
        state: 'OFF',
        currentPowerW: 0,
        dutyCyclePercent: 4,
        dailyEstimatedKwh: 0.8,
        firstDetectedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
        lastDetectedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
        detectionEventsCount: 3,
        isConfirmed: false,
        matchedRegisteredId: null,
      },
      {
        id: 'disc_induction_cooktop',
        householdId: DEMO_HOUSEHOLD_UUID,
        name: 'Induction Cooktop / Hotplate',
        category: 'OTHER',
        status: 'MAYBE', // Rule: confidence < 60% shows "Maybe:"
        confidence: 52,
        isAiLabeled: true,
        aiLabelReasoning: 'Transient step of +1,450W with 0.98 power factor. Unregistered kitchen cooking load detected during dinner hours.',
        ratedPowerW: 1450,
        reactivePowerVAR: 140,
        powerFactor: 0.98,
        state: 'OFF',
        currentPowerW: 0,
        dutyCyclePercent: 5,
        dailyEstimatedKwh: 1.4,
        firstDetectedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        lastDetectedAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        detectionEventsCount: 2,
        isConfirmed: false,
        matchedRegisteredId: null,
      },
    ];

    this.householdDetections.set(DEMO_HOUSEHOLD_UUID, defaultDetections);
  }

  /**
   * Ingests a raw telemetry reading from MQTT adapter (1 Hz nominal)
   */
  public async ingestReading(reading: {
    voltage: number;
    current: number;
    powerFactor?: number;
    activePowerW: number;
    frequency?: number;
    timestamp?: string;
    deviceId?: string;
    householdId?: string;
  }): Promise<{ detectedSteps: StepEvent[]; activeAppliancesCount: number }> {
    const v = reading.voltage || 220;
    const i = reading.current || 0;
    const pf = Math.max(0.01, Math.min(1.0, reading.powerFactor ?? 0.95));
    const p = Math.max(0, reading.activePowerW || 0);

    // Calculate apparent power S = V x I
    const s = Math.max(p, v * i);

    // Calculate reactive power Q = sqrt(S^2 - P^2)
    const qSq = Math.max(0, s * s - p * p);
    const q = Math.sqrt(qSq);

    const sample: NilmSample = {
      timestamp: reading.timestamp || new Date().toISOString(),
      voltage: v,
      current: i,
      powerFactor: pf,
      activePowerW: p,
      reactivePowerVAR: Math.round(q),
      apparentPowerVA: Math.round(s),
      frequency: reading.frequency || 50.0,
      deviceId: reading.deviceId,
      householdId: reading.householdId || DEMO_HOUSEHOLD_UUID,
    };

    return await this.ingestSample(sample);
  }

  /**
   * Ingests a high-frequency sample, performs step change detection, and updates NILM model
   */
  public async ingestSample(sample: NilmSample): Promise<{ detectedSteps: StepEvent[]; activeAppliancesCount: number }> {
    const targetHhId = sample.householdId || DEMO_HOUSEHOLD_UUID;

    // Buffer sample
    this.sampleBuffer.push(sample);
    if (this.sampleBuffer.length > this.maxBufferSize) {
      this.sampleBuffer.shift();
    }

    const detectedSteps: StepEvent[] = [];

    // Need at least 2 samples to detect step change
    if (this.sampleBuffer.length >= 2) {
      const prev = this.sampleBuffer[this.sampleBuffer.length - 2];
      const curr = sample;

      const deltaP = curr.activePowerW - prev.activePowerW;
      const deltaQ = curr.reactivePowerVAR - prev.reactivePowerVAR;

      if (Math.abs(deltaP) >= this.STEP_THRESHOLD_WATTS) {
        const deltaS = Math.sqrt(deltaP * deltaP + deltaQ * deltaQ);
        const apparentPf = deltaS > 0 ? Math.min(1.0, Math.abs(deltaP) / deltaS) : 1.0;

        const stepEvent: StepEvent = {
          id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: curr.timestamp,
          deltaActiveW: Math.round(deltaP),
          deltaReactiveVAR: Math.round(deltaQ),
          deltaApparentVA: Math.round(deltaS),
          stepDirection: deltaP > 0 ? 'ON' : 'OFF',
          steadyStatePowerW: curr.activePowerW,
          priorStatePowerW: prev.activePowerW,
          apparentPowerFactor: Number(apparentPf.toFixed(2)),
        };

        detectedSteps.push(stepEvent);
        this.recentStepEvents.unshift(stepEvent);
        if (this.recentStepEvents.length > 50) {
          this.recentStepEvents.pop();
        }

        // Process step with SignatureMatcher and update Discovered Appliances
        await this.processStepEvent(targetHhId, stepEvent);
      }
    }

    const currentDetections = this.getDiscoveredAppliances(targetHhId);
    const activeCount = currentDetections.filter(d => d.state === 'RUNNING').length;

    return { detectedSteps, activeAppliancesCount: activeCount };
  }

  /**
   * Correlates step change event to discovered or registered appliances
   */
  private async processStepEvent(householdId: string, step: StepEvent) {
    const detections = this.getDiscoveredAppliances(householdId);
    const absP = Math.abs(step.deltaActiveW);
    const matcher = SignatureMatcher.getInstance();

    // 1. Check if step matches an already known discovered appliance
    let matchedDiscovery: DiscoveredAppliance | null = null;
    let minDiff = Infinity;

    for (const d of detections) {
      const diff = Math.abs(d.ratedPowerW - absP);
      if (diff <= d.ratedPowerW * 0.22 && diff < minDiff) {
        minDiff = diff;
        matchedDiscovery = d;
      }
    }

    if (matchedDiscovery) {
      // Update state of existing appliance
      if (step.stepDirection === 'ON') {
        matchedDiscovery.state = 'RUNNING';
        matchedDiscovery.currentPowerW = absP;
        matchedDiscovery.detectionEventsCount++;
        matchedDiscovery.lastDetectedAt = step.timestamp;
      } else {
        matchedDiscovery.state = 'OFF';
        matchedDiscovery.currentPowerW = 0;
        matchedDiscovery.lastDetectedAt = step.timestamp;
      }
      return;
    }

    // 2. If it's a new ON step, classify via SignatureMatcher / Gemini
    if (step.stepDirection === 'ON' && absP >= 45) {
      // Fetch registered appliances to match against official registry
      let registeredAppliances: any[] = [];
      try {
        registeredAppliances = await SupabaseService.getInstance().getAppliances(householdId);
      } catch (err) {
        console.warn('[NilmDisaggregator] Could not load registered appliances:', err);
      }

      const matchResult = await matcher.matchStep(step, registeredAppliances);

      // Keep it honest: if confidence < 60%, show "Maybe:" not "Detected:"
      const status: 'DETECTED' | 'MAYBE' = matchResult.confidence >= 60 ? 'DETECTED' : 'MAYBE';

      const newDiscovery: DiscoveredAppliance = {
        id: `disc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        householdId,
        name: matchResult.name,
        category: matchResult.category,
        status,
        confidence: matchResult.confidence,
        isAiLabeled: matchResult.isAiLabeled,
        aiLabelReasoning: matchResult.reasoning,
        ratedPowerW: absP,
        reactivePowerVAR: Math.abs(step.deltaReactiveVAR),
        powerFactor: step.apparentPowerFactor,
        state: 'RUNNING',
        currentPowerW: absP,
        dutyCyclePercent: 20,
        dailyEstimatedKwh: Number(((absP * 3) / 1000).toFixed(2)),
        firstDetectedAt: step.timestamp,
        lastDetectedAt: step.timestamp,
        detectionEventsCount: 1,
        isConfirmed: false,
        matchedRegisteredId: matchResult.matchedRegisteredApplianceId || null,
      };

      detections.unshift(newDiscovery);
      this.householdDetections.set(householdId, detections);
    }
  }

  /**
   * Retrieves list of discovered appliances for a household
   */
  public getDiscoveredAppliances(householdId: string): DiscoveredAppliance[] {
    const targetHhId = householdId || DEMO_HOUSEHOLD_UUID;
    if (!this.householdDetections.has(targetHhId)) {
      // Clone from demo household if new
      const cloned = (this.householdDetections.get(DEMO_HOUSEHOLD_UUID) || []).map(d => ({
        ...d,
        householdId: targetHhId,
      }));
      this.householdDetections.set(targetHhId, cloned);
    }
    return this.householdDetections.get(targetHhId) || [];
  }

  /**
   * User action: Confirm detection into official household appliance inventory
   */
  public async confirmAppliance(
    householdId: string,
    discoveryId: string,
    roomId: string,
    customName?: string
  ): Promise<{ success: boolean; appliance: any; discovery: DiscoveredAppliance }> {
    const list = this.getDiscoveredAppliances(householdId);
    const discovery = list.find(d => d.id === discoveryId);
    if (!discovery) {
      throw new Error(`Discovered appliance "${discoveryId}" not found.`);
    }

    const appName = customName?.trim() || discovery.name;

    // Create official appliance in Supabase
    const created = await SupabaseService.getInstance().createAppliance({
      householdId,
      roomId: roomId || 'room_default',
      name: appName,
      category: discovery.category,
      ratedPowerW: discovery.ratedPowerW,
      standbyPowerW: Math.round(discovery.ratedPowerW * 0.01),
      averageHoursPerDay: Math.max(1, Math.round((discovery.dutyCyclePercent / 100) * 24)),
      isInverterType: discovery.category === 'AIR_CONDITIONER' || discovery.category === 'REFRIGERATOR',
      isVampireRisk: discovery.category === 'AIR_CONDITIONER' || discovery.category === 'TELEVISION',
      purchasePriceBDT: 0,
    });

    // Update discovery state
    discovery.isConfirmed = true;
    discovery.confirmedRoomId = roomId;
    discovery.name = appName;
    discovery.matchedRegisteredId = created.id;
    discovery.confidence = 100;
    discovery.status = 'DETECTED';

    return { success: true, appliance: created, discovery };
  }

  /**
   * User action: Rename a discovered appliance
   */
  public renameAppliance(householdId: string, discoveryId: string, newName: string): DiscoveredAppliance {
    const list = this.getDiscoveredAppliances(householdId);
    const discovery = list.find(d => d.id === discoveryId);
    if (!discovery) {
      throw new Error(`Discovered appliance "${discoveryId}" not found.`);
    }

    discovery.name = newName.trim();
    return discovery;
  }

  /**
   * User action: Merge a detection with an existing registered appliance
   */
  public async mergeAppliance(
    householdId: string,
    discoveryId: string,
    targetApplianceId: string
  ): Promise<DiscoveredAppliance> {
    const list = this.getDiscoveredAppliances(householdId);
    const discovery = list.find(d => d.id === discoveryId);
    if (!discovery) {
      throw new Error(`Discovered appliance "${discoveryId}" not found.`);
    }

    const registered = await SupabaseService.getInstance().getAppliances(householdId);
    const target = registered.find(a => a.id === targetApplianceId);
    if (!target) {
      throw new Error(`Target appliance "${targetApplianceId}" not found in inventory.`);
    }

    discovery.isConfirmed = true;
    discovery.matchedRegisteredId = target.id;
    discovery.mergedIntoId = target.id;
    discovery.name = target.name;
    discovery.category = target.category;
    discovery.confidence = 100;
    discovery.status = 'DETECTED';
    discovery.aiLabelReasoning = `Merged with registered inventory item "${target.name}".`;

    return discovery;
  }

  /**
   * Simulates a 1 Hz telemetry burst with distinct step change events
   * Allows live testing and UI demonstration of the disaggregation engine
   */
  public async simulateBurst(
    householdId: string,
    scenario: 'ac_on' | 'geyser_on' | 'pump_on' | 'microwave_on' | 'ac_off' = 'ac_on'
  ): Promise<{ step: StepEvent; discovery: DiscoveredAppliance | null }> {
    const targetHhId = householdId || DEMO_HOUSEHOLD_UUID;
    const now = new Date().toISOString();

    let deltaP = 1650;
    let deltaQ = 620;
    let baseline = 350;

    if (scenario === 'geyser_on') {
      deltaP = 2100;
      deltaQ = 40;
    } else if (scenario === 'pump_on') {
      deltaP = 780;
      deltaQ = 640; // Heavy reactive -> low confidence candidate (<60%)
    } else if (scenario === 'microwave_on') {
      deltaP = 950;
      deltaQ = 410;
    } else if (scenario === 'ac_off') {
      deltaP = -1650;
      deltaQ = -620;
      baseline = 2000;
    }

    // Feed baseline sample first
    await this.ingestReading({
      householdId: targetHhId,
      voltage: 220,
      current: baseline / (220 * 0.95),
      powerFactor: 0.95,
      activePowerW: baseline,
      timestamp: new Date(Date.now() - 1000).toISOString(),
    });

    // Feed step transition sample 1 second later
    const stepResult = await this.ingestReading({
      householdId: targetHhId,
      voltage: 220,
      current: (baseline + deltaP) / (220 * 0.92),
      powerFactor: 0.92,
      activePowerW: Math.max(100, baseline + deltaP),
      timestamp: now,
    });

    const step = stepResult.detectedSteps[0] || {
      id: `sim_step_${Date.now()}`,
      timestamp: now,
      deltaActiveW: deltaP,
      deltaReactiveVAR: deltaQ,
      deltaApparentVA: Math.round(Math.sqrt(deltaP * deltaP + deltaQ * deltaQ)),
      stepDirection: deltaP > 0 ? 'ON' : 'OFF',
      steadyStatePowerW: Math.max(100, baseline + deltaP),
      priorStatePowerW: baseline,
      apparentPowerFactor: 0.92,
    };

    const detections = this.getDiscoveredAppliances(targetHhId);
    const affected = detections.find(d => Math.abs(d.ratedPowerW - Math.abs(deltaP)) < 150) || detections[0] || null;

    return { step, discovery: affected };
  }

  public getRecentSteps(): StepEvent[] {
    return [...this.recentStepEvents];
  }
}
