import { BaseDeviceAdapter } from '../adapters/DeviceAdapter';
import { MockAdapter } from '../adapters/MockAdapter';
import { TuyaAdapter } from '../adapters/TuyaAdapter';
import { MQTTAdapter } from '../adapters/MQTTAdapter';
import { DESCOAdapter } from '../adapters/DESCOAdapter';
import { CompositeAdapter } from '../adapters/CompositeAdapter';
import { IoTDevice, AdapterType } from '../../shared/types/iot';
import { PowerReading } from '../../shared/types/energy';

export class IoTService {
  private static instance: IoTService;
  private adapters: Map<AdapterType, BaseDeviceAdapter> = new Map();
  private telemetryCache: Map<string, PowerReading> = new Map();

  private constructor() {
    this.adapters.set('MockAdapter', new MockAdapter());
    this.adapters.set('TuyaAdapter', new TuyaAdapter());
    this.adapters.set('MQTTAdapter', new MQTTAdapter());
    this.adapters.set('DESCOAdapter', new DESCOAdapter());
    
    // Composite adapter combining Mock, Tuya, MQTT, and DESCO
    const composite = new CompositeAdapter([
      this.adapters.get('MockAdapter')!,
      this.adapters.get('TuyaAdapter')!,
      this.adapters.get('MQTTAdapter')!,
      this.adapters.get('DESCOAdapter')!,
    ]);
    this.adapters.set('CompositeAdapter', composite);
  }

  public static getInstance(): IoTService {
    if (!IoTService.instance) {
      IoTService.instance = new IoTService();
    }
    return IoTService.instance;
  }

  public getAdapter(adapterType: AdapterType): BaseDeviceAdapter {
    return this.adapters.get(adapterType) || this.adapters.get('MockAdapter')!;
  }

  public async pollDeviceTelemetry(device: IoTDevice): Promise<PowerReading> {
    const adapter = this.getAdapter(device.adapterType);
    await adapter.connect(device);
    const reading = await adapter.fetchTelemetry(device);
    this.telemetryCache.set(device.id, reading);
    return reading;
  }

  public getLatestTelemetry(deviceId: string): PowerReading | null {
    return this.telemetryCache.get(deviceId) || null;
  }

  public async getDeviceHealth(device: IoTDevice) {
    const adapter = this.getAdapter(device.adapterType);
    return adapter.getHealthStatus(device);
  }
}
