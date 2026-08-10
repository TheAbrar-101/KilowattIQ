import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';

export class CompositeAdapter extends BaseDeviceAdapter {
  adapterType: AdapterType = 'CompositeAdapter';
  private childAdapters: BaseDeviceAdapter[] = [];

  constructor(adapters: BaseDeviceAdapter[] = []) {
    super();
    this.childAdapters = adapters;
  }

  async connect(device: IoTDevice): Promise<boolean> {
    const results = await Promise.all(this.childAdapters.map(a => a.connect(device)));
    return results.every(Boolean);
  }

  async disconnect(deviceId: string): Promise<void> {
    await Promise.all(this.childAdapters.map(a => a.disconnect(deviceId)));
  }

  async fetchTelemetry(device: IoTDevice): Promise<PowerReading> {
    if (this.childAdapters.length === 0) {
      return this.createBaseReading(device.id, 350, 50);
    }

    const readings = await Promise.all(this.childAdapters.map(a => a.fetchTelemetry(device)));
    const totalWatts = readings.reduce((acc, r) => acc + r.activePowerW, 0);
    const maxKwh = Math.max(...readings.map(r => r.energyKwh));

    return this.createBaseReading(device.id, totalWatts, maxKwh);
  }

  async getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    return {
      isOnline: true,
      latencyMs: 25,
      signalQualityPct: 90,
    };
  }
}
