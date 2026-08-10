import { BaseDeviceAdapter } from './DeviceAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';
import { MqttTelemetryService } from '../services/MqttTelemetryService';
import { SupabaseService } from '../services/SupabaseService';

export class MQTTAdapter extends BaseDeviceAdapter {
  adapterType: AdapterType = 'MQTTAdapter';

  async connect(device: IoTDevice): Promise<boolean> {
    const mqttService = MqttTelemetryService.getInstance();
    const status = mqttService.getStatus();
    return status.mqttStatus === 'MQTT_CONNECTED';
  }

  async disconnect(deviceId: string): Promise<void> {
    return;
  }

  async fetchTelemetry(device: IoTDevice): Promise<PowerReading> {
    const mqttService = MqttTelemetryService.getInstance();
    const latestLive = mqttService.getLatestForDevice(device.id);

    if (latestLive) {
      return {
        timestamp: latestLive.timestamp,
        voltage: latestLive.voltage,
        current: latestLive.current,
        activePowerW: latestLive.activePowerW,
        energyKwh: latestLive.energyKwh || 0,
        powerFactor: latestLive.powerFactor,
        frequency: latestLive.frequency,
        deviceId: device.id,
      };
    }

    // Try DB latest reading
    const dbReading = await SupabaseService.getInstance().getLatestReadingForDevice(device.id);
    if (dbReading) {
      return {
        timestamp: dbReading.timestamp,
        voltage: Number(dbReading.voltage),
        current: Number(dbReading.current),
        activePowerW: Number(dbReading.active_power),
        energyKwh: 0,
        powerFactor: Number(dbReading.power_factor),
        frequency: Number(dbReading.frequency),
        deviceId: device.id,
      };
    }

    // Default reading when no telemetry recorded yet
    return {
      timestamp: new Date().toISOString(),
      voltage: 220.0,
      current: 0.0,
      activePowerW: 0.0,
      energyKwh: 0.0,
      powerFactor: 1.0,
      frequency: 50.0,
      deviceId: device.id,
    };
  }

  async getHealthStatus(device: IoTDevice): Promise<{ isOnline: boolean; latencyMs: number; signalQualityPct: number }> {
    const mqttService = MqttTelemetryService.getInstance();
    const status = mqttService.getStatus();
    const isOnline = status.mqttStatus === 'MQTT_CONNECTED';

    return {
      isOnline,
      latencyMs: isOnline ? 12 : 0,
      signalQualityPct: isOnline ? 95 : 0,
    };
  }
}

