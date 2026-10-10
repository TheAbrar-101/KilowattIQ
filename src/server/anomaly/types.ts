/**
 * Electrical Anomaly, Leakage & Faulty Wiring Diagnostics - Types
 * 
 * Monitored Anomalies:
 * 1. POWER_DRAW_ALL_OFF: Power draw when all registered appliances are off (leakage / tampering)
 * 2. VOLTAGE_DROP_HIGH_LOAD: Voltage drop under high load (undersized wiring / resistive contacts)
 * 3. NEUTRAL_CURRENT_IMBALANCE: Neutral vs line current divergence (ground leakage / shared neutral)
 * 4. SUDDEN_UNTRACKED_STEP: Sudden step changes with no appliance toggle (unregistered load / external tap)
 * 5. SUSTAINED_FREQUENCY_DEVIATION: Sustained frequency shift outside 50 Hz standard (generator / grid stress)
 * 
 * Tone: Helpful, objective, never accusatory.
 */

export type AnomalyType =
  | 'POWER_DRAW_ALL_OFF'
  | 'VOLTAGE_DROP_HIGH_LOAD'
  | 'NEUTRAL_CURRENT_IMBALANCE'
  | 'SUDDEN_UNTRACKED_STEP'
  | 'SUSTAINED_FREQUENCY_DEVIATION';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type AnomalyStatus = 'ACTIVE' | 'RESOLVED';

export interface AnomalyMetrics {
  powerWatts?: number;
  voltageV?: number;
  voltageDropV?: number;
  frequencyHz?: number;
  freqDeviationHz?: number;
  phaseCurrentA?: number;
  neutralCurrentA?: number;
  imbalanceA?: number;
  imbalancePct?: number;
  stepDeltaWatts?: number;
  baselineWatts?: number;
}

export interface AnomalyRecord {
  id: string;
  householdId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  status: AnomalyStatus;
  title: string;
  titleBn: string;
  timestamp: string;
  explanation: string;
  explanationBn: string;
  suggestedAction: string;
  suggestedActionBn: string;
  metrics: AnomalyMetrics;
  alertTriggered: boolean;
  resolvedAt?: string;
}

export interface DetectionContext {
  householdId: string;
  activeApplianceStates?: Record<string, boolean>;
  registeredAppliancesCount?: number;
  allAppliancesOff?: boolean;
  neutralCurrentA?: number;
  lastToggledAt?: number;
  nominalVoltage?: number; // Default 220V
  baselineVoltageV?: number;
  baselineWatts?: number;
  applianceToggledRecently?: boolean;
}
