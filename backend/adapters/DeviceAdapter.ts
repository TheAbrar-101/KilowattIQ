import { DeviceAdapterInterface, IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';

export abstract class BaseDeviceAdapter implements DeviceAdapterInterface {
  abstract adapterType: AdapterType;

  abstract connect(device: IoTDevice): Promise<boolean>;
  abstract disconnect(deviceId: string): Promise<void>;
  abstract fetchTelemetry(device: IoTDevice): Promise<PowerReading>;
  abstract getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }>;

  async discoverDevices(): Promise<IoTDevice[]> {
    return [];
  }

  async pairDevice(deviceInfo: Partial<IoTDevice>): Promise<IoTDevice> {
    const id = deviceInfo.id || `dev_${Math.random().toString(36).substring(2, 9)}`;
    return {
      id,
      householdId: deviceInfo.householdId || 'hh_demo_01',
      name: deviceInfo.name || 'Discovered Smart Device',
      deviceType: deviceInfo.deviceType || 'SMART_PLUG',
      adapterType: this.adapterType,
      macOrSerial: deviceInfo.macOrSerial || 'AA:BB:CC:DD:EE:FF',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      config: deviceInfo.config || {},
    };
  }

  async removeDevice(deviceId: string): Promise<boolean> {
    await this.disconnect(deviceId);
    return true;
  }

  async getDeviceStatus(deviceId: string): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    return { isOnline: true, latencyMs: 25, signalQualityPct: 92 };
  }

  async getDeviceHistory(deviceId: string, timeframe: string = '24h'): Promise<PowerReading[]> {
    const history: PowerReading[] = [];
    const count = timeframe === '1h' ? 12 : timeframe === '24h' ? 24 : 30;
    const now = Date.now();
    for (let i = count; i >= 0; i--) {
      const ts = new Date(now - i * (timeframe === '1h' ? 5 * 60 * 1000 : 3600 * 1000)).toISOString();
      const reading = this.createBaseReading(deviceId, 150 + Math.random() * 50);
      reading.timestamp = ts;
      history.push(reading);
    }
    return history;
  }

  async getEnergySummary(deviceId: string): Promise<{ todayKwh: number; monthKwh: number; averageWatts: number }> {
    return {
      todayKwh: 3.42,
      monthKwh: 98.5,
      averageWatts: 185.2,
    };
  }

  async getStandbyAnalysis(deviceId: string): Promise<{ isVampirePower: boolean; standbyWatts: number; estimatedMonthlyWasteBDT: number }> {
    const standbyWatts = 12.5;
    const wasteKwhMonth = (standbyWatts * 24 * 30) / 1000; // ~9 kWh
    const estimatedMonthlyWasteBDT = Math.round(wasteKwhMonth * 7.5);
    return {
      isVampirePower: standbyWatts > 5,
      standbyWatts,
      estimatedMonthlyWasteBDT,
    };
  }

  protected createBaseReading(deviceId: string, activePowerW: number, energyKwhDelta: number = 0.01): PowerReading {
    const now = new Date();
    // Simulate typical BD grid voltage ~220V - 230V
    const voltage = 220 + Math.sin(now.getTime() / 10000) * 8 + (Math.random() * 2 - 1);
    const powerFactor = 0.92 + Math.random() * 0.06;
    const current = activePowerW > 0 ? activePowerW / (voltage * powerFactor) : 0;

    return {
      timestamp: now.toISOString(),
      voltage: Number(voltage.toFixed(2)),
      current: Number(current.toFixed(2)),
      activePowerW: Number(activePowerW.toFixed(1)),
      energyKwh: Number(energyKwhDelta.toFixed(3)),
      powerFactor: Number(powerFactor.toFixed(2)),
      frequency: 50.0,
      deviceId,
    };
  }
}
