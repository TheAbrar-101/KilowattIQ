import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';

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
    const basePower = device.config?.baseWatts || 450;
    // Add time-of-day fluctuation (e.g. peak AC load in afternoon/evening)
    const hour = new Date().getHours();
    const peakFactor = (hour >= 18 && hour <= 23) ? 1.4 : (hour >= 12 && hour <= 17 ? 1.25 : 0.8);
    const randomJitter = (Math.random() - 0.5) * 40;
    
    const activeWatts = Math.max(5, basePower * peakFactor + randomJitter);
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
