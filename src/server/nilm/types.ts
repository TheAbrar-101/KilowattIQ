/**
 * NILM (Non-Intrusive Load Monitoring) Domain Types
 * 
 * Defines data structures for:
 * 1. 1 Hz high-frequency telemetry samples
 * 2. Transient step change detection (ΔP, ΔQ, ΔS, ΔPF)
 * 3. Appliance electrical signatures
 * 4. Discovered appliances with confidence scoring
 */

import { Appliance } from '../../../shared/types/household';

export interface NilmSample {
  timestamp: string;
  voltage: number;
  current: number;
  powerFactor: number;
  activePowerW: number; // P
  reactivePowerVAR: number; // Q = sqrt(S^2 - P^2)
  apparentPowerVA: number; // S = V * I
  frequency: number;
  deviceId?: string;
  householdId?: string;
}

export interface StepEvent {
  id: string;
  timestamp: string;
  deltaActiveW: number; // ΔP (positive = turn on, negative = turn off)
  deltaReactiveVAR: number; // ΔQ (inductive is positive)
  deltaApparentVA: number; // ΔS
  stepDirection: 'ON' | 'OFF';
  steadyStatePowerW: number;
  priorStatePowerW: number;
  apparentPowerFactor: number;
  durationSeconds?: number;
}

export interface ApplianceSignature {
  id: string;
  name: string;
  category: Appliance['category'];
  typicalActiveW: [number, number]; // [min, max]
  typicalReactiveVAR: [number, number]; // [min, max]
  typicalPowerFactor: [number, number]; // [min, max]
  surgeRatio?: number;
  isInductive: boolean;
  description: string;
}

export interface SignatureMatchResult {
  signatureId?: string;
  name: string;
  category: Appliance['category'];
  confidence: number; // 0 to 100
  isAiLabeled: boolean;
  reasoning: string;
  matchedRegisteredApplianceId?: string | null;
}

export interface DiscoveredAppliance {
  id: string;
  householdId: string;
  name: string;
  category: Appliance['category'];
  status: 'DETECTED' | 'MAYBE'; // Rule: if confidence < 60%, show "Maybe:" not "Detected:"
  confidence: number; // 0 to 100
  isAiLabeled: boolean;
  aiLabelReasoning?: string;

  // Electrical profile
  ratedPowerW: number;
  reactivePowerVAR: number;
  powerFactor: number;

  // Live state tracking
  state: 'RUNNING' | 'STANDBY' | 'OFF';
  currentPowerW: number;
  dutyCyclePercent: number;
  dailyEstimatedKwh: number;

  // Detection history
  firstDetectedAt: string;
  lastDetectedAt: string;
  detectionEventsCount: number;

  // Inventory linkage
  matchedRegisteredId?: string | null;
  isConfirmed: boolean;
  confirmedRoomId?: string | null;
  mergedIntoId?: string | null;
}
