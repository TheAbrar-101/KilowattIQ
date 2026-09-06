import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';
import { SupabaseService } from '../services/SupabaseService';

export class MockAdapter extends BaseDeviceAdapter {
  adapterType: AdapterType = 'MockAdapter';
  private connectedDevices = new Set<string>();

  async connect(device: IoTDevice): Promise<boolean> {
    this.connectedDevices.add(device.id);
    return true;
  }

  async disconnect(deviceId: string): Promise<void> {
    this.connectedDevices.delete(deviceId);
  }

  async fetchTelemetry(device: IoTDevice): Promise<PowerReading> {
    const db = SupabaseService.getInstance();
    const isOn = device.applianceId ? db.isApplianceOn(device.applianceId) : db.isDeviceOn(device.id);

    const basePower = device.config?.baseWatts || 450;
    const hour = new Date().getHours();
    const peakFactor = (hour >= 18 && hour <= 23) ? 1.4 : (hour >= 12 && hour <= 17 ? 1.25 : 0.8);
    const randomJitter = (Math.random() - 0.5) * 40;

    const activeWatts = isOn ? Math.max(5, Math.round(basePower * peakFactor + randomJitter)) : 0;
    const cumulativeKwh = (device.config?.accumulatedKwh || 120) + (activeWatts / 1000) * (5 / 3600);

    if (device.config) {
      device.config.accumulatedKwh = cumulativeKwh;
    }

    return this.createBaseReading(device.id, activeWatts, cumulativeKwh);
  }

  async getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    return {
      isOnline: true,
      latencyMs: Math.floor(15 + Math.random() * 20),
      signalQualityPct: Math.floor(88 + Math.random() * 12),
    };
  }
}
