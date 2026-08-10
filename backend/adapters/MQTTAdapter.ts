import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';

export class MQTTAdapter extends BaseDeviceAdapter {
  adapterType: AdapterType = 'MQTTAdapter';

  async connect(device: IoTDevice): Promise<boolean> {
    // In production, subscribes to MQTT broker topic (e.g. `kilowattiq/household_01/pzem004t`)
    return true;
  }

  async disconnect(deviceId: string): Promise<void> {
    return;
  }

  async fetchTelemetry(device: IoTDevice): Promise<PowerReading> {
    // ESP32 + PZEM-004T MQTT payload schema
    const simulatedMqttPayload = {
      voltage: 221.4,
      current: 4.82,
      power: Math.max(10, (device.config?.ratedWatts || 800) + (Math.random() - 0.5) * 50),
      energy: (device.config?.accumulatedKwh || 180) + 0.008,
      frequency: 50.0,
      pf: 0.95,
    };

    if (device.config) device.config.accumulatedKwh = simulatedMqttPayload.energy;

    return {
      timestamp: new Date().toISOString(),
      voltage: simulatedMqttPayload.voltage,
      current: Number(simulatedMqttPayload.current.toFixed(2)),
      activePowerW: Number(simulatedMqttPayload.power.toFixed(1)),
      energyKwh: Number(simulatedMqttPayload.energy.toFixed(3)),
      powerFactor: simulatedMqttPayload.pf,
      frequency: simulatedMqttPayload.frequency,
      deviceId: device.id,
    };
  }

  async getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    return {
      isOnline: true,
      latencyMs: Math.floor(8 + Math.random() * 12), // Direct MQTT low-latency
      signalQualityPct: 95,
    };
  }
}
