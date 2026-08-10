import { PowerReading } from './energy';

export type AdapterType = 'MockAdapter' | 'TuyaAdapter' | 'MQTTAdapter' | 'DESCOAdapter' | 'CompositeAdapter';

export type DeviceType = 'SMART_METER' | 'SMART_PLUG' | 'ESP32_PZEM' | 'VIRTUAL_SENSOR';

export interface IoTDevice {
  id: string;
  householdId: string;
  roomId?: string;
  applianceId?: string;
  name: string;
  deviceType: DeviceType;
  adapterType: AdapterType;
  macOrSerial: string;
  ipAddress?: string;
  mqttTopic?: string;
  isOnline: boolean;
  lastSeen: string;
  config: Record<string, any>;
}

export interface TelemetryPayload {
  deviceId: string;
  timestamp: string;
  reading: PowerReading;
  rawPayload?: any;
}

export interface DeviceAdapterInterface {
  adapterType: AdapterType;
  connect(device: IoTDevice): Promise<boolean>;
  disconnect(deviceId: string): Promise<void>;
  fetchTelemetry(device: IoTDevice): Promise<PowerReading>;
  getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }>;
  
  discoverDevices?(): Promise<IoTDevice[]>;
  pairDevice?(deviceInfo: Partial<IoTDevice>): Promise<IoTDevice>;
  removeDevice?(deviceId: string): Promise<boolean>;
  getDeviceStatus?(deviceId: string): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }>;
  getDeviceHistory?(deviceId: string, timeframe?: string): Promise<PowerReading[]>;
  getEnergySummary?(deviceId: string): Promise<{ todayKwh: number; monthKwh: number; averageWatts: number }>;
  getStandbyAnalysis?(deviceId: string): Promise<{ isVampirePower: boolean; standbyWatts: number; estimatedMonthlyWasteBDT: number }>;
}
