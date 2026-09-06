import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';
import { SupabaseService } from '../services/SupabaseService';

export class TuyaAdapter extends BaseDeviceAdapter {
  adapterType: AdapterType = 'TuyaAdapter';

  async connect(device: IoTDevice): Promise<boolean> {
    return true;
  }

  async disconnect(deviceId: string): Promise<void> {
    return;
  }

  async fetchTelemetry(device: IoTDevice): Promise<PowerReading> {
    const db = SupabaseService.getInstance();
    const isOn = device.applianceId ? db.isApplianceOn(device.applianceId) : db.isDeviceOn(device.id);

    const ratedWatts = device.config?.ratedWatts || 1650;
    const activeWatts = isOn ? Math.round(ratedWatts * (0.95 + Math.random() * 0.1)) : 0;
    const accumulatedKwh = (device.config?.accumulatedKwh || 45) + (activeWatts / 1000) * (3 / 3600);
    if (device.config) device.config.accumulatedKwh = accumulatedKwh;

    return this.createBaseReading(device.id, activeWatts, accumulatedKwh);
  }

  async getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    return {
      isOnline: true,
      latencyMs: Math.floor(40 + Math.random() * 60), // Tuya Cloud HTTP API latency
      signalQualityPct: 82,
    };
  }
}
