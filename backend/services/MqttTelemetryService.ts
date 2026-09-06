import mqtt from 'mqtt';
import { SupabaseService, DEMO_HOUSEHOLD_UUID } from './SupabaseService';

export type MqttConnectionStatus = 'MQTT_CONNECTED' | 'MQTT_DISCONNECTED' | 'NOT_CONFIGURED';

export interface TelemetryValidationResult {
  success: boolean;
  reason?: string;
  deviceId?: string;
  householdId?: string;
  reading?: any;
}

export class MqttTelemetryService {
  private static instance: MqttTelemetryService;
  private status: MqttConnectionStatus = 'NOT_CONFIGURED';
  private lastTelemetryReceived: string | null = null;
  private packetStats = {
    totalReceived: 0,
    totalValid: 0,
    totalInvalid: 0,
    totalSavedToDb: 0,
  };
  private latestReadings: Map<string, any> = new Map();
  private client: mqtt.MqttClient | null = null;
  private topic: string = 'kilowattiq/telemetry/+';
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): MqttTelemetryService {
    if (!MqttTelemetryService.instance) {
      MqttTelemetryService.instance = new MqttTelemetryService();
    }
    return MqttTelemetryService.instance;
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const brokerUrl = (process.env.MQTT_BROKER_URL || '').trim();
    const username = process.env.MQTT_USERNAME || undefined;
    const password = process.env.MQTT_PASSWORD || undefined;
    const clientId = process.env.MQTT_CLIENT_ID || `kilowattiq_backend_${Math.random().toString(16).substring(2, 8)}`;
    this.topic = process.env.MQTT_TELEMETRY_TOPIC || 'kilowattiq/telemetry/+';

    // Check if MQTT Broker is configured
    const isUnconfigured =
      !brokerUrl ||
      brokerUrl === '' ||
      brokerUrl.includes('your-broker') ||
      brokerUrl.includes('example.com') ||
      brokerUrl.includes('broker.hivemq.com');

    if (isUnconfigured) {
      this.status = 'NOT_CONFIGURED';
      console.log('[MqttTelemetryService] MQTT integration not configured; running without MQTT.');
      return;
    }

    // Mask sensitive URL details for safe logging
    const safeUrlLog = brokerUrl.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
    console.log(`[MqttTelemetryService] Initializing MQTT client connection to ${safeUrlLog} (Client ID: ${clientId})...`);

    this.status = 'MQTT_DISCONNECTED';

    try {
      let reconnectCount = 0;
      const maxReconnectAttempts = 5;

      this.client = mqtt.connect(brokerUrl, {
        clientId,
        username,
        password,
        clean: true,
        reconnectPeriod: 10000,
        connectTimeout: 5000,
      });

      this.client.on('connect', () => {
        reconnectCount = 0;
        this.status = 'MQTT_CONNECTED';
        console.log(`[MqttTelemetryService] MQTT Connected successfully. Subscribing to topic: ${this.topic}`);

        this.client?.subscribe(this.topic, (err) => {
          if (err) {
            console.error(`[MqttTelemetryService ERROR] Failed to subscribe to ${this.topic}:`, err.message);
          } else {
            console.log(`[MqttTelemetryService] Subscribed to telemetry topic: ${this.topic}`);
          }
        });
      });

      this.client.on('reconnect', () => {
        reconnectCount++;
        if (reconnectCount > maxReconnectAttempts) {
          console.warn(`[MqttTelemetryService] MQTT reached maximum reconnect attempts (${maxReconnectAttempts}). Disconnecting.`);
          this.client?.end(true);
          this.status = 'MQTT_DISCONNECTED';
          return;
        }
        console.log(`[MqttTelemetryService] Reconnecting to MQTT broker (Attempt ${reconnectCount}/${maxReconnectAttempts})...`);
      });

      this.client.on('offline', () => {
        this.status = 'MQTT_DISCONNECTED';
      });

      this.client.on('close', () => {
        this.status = 'MQTT_DISCONNECTED';
      });

      this.client.on('error', (err: any) => {
        this.status = 'MQTT_DISCONNECTED';
        console.error('[MqttTelemetryService ERROR] MQTT Client Error:', err?.message || String(err));
      });

      this.client.on('message', (topic, payloadBuffer) => {
        const rawString = payloadBuffer.toString('utf-8');
        this.processTelemetryPacket(rawString, topic, 'MQTT').catch((err) => {
          console.error('[MqttTelemetryService ERROR] Processing telemetry packet failed:', err);
        });
      });
    } catch (err: any) {
      this.status = 'MQTT_DISCONNECTED';
      console.error('[MqttTelemetryService ERROR] Exception during mqtt.connect:', err?.message || String(err));
    }
  }

  public async processTelemetryPacket(
    rawPayload: string | object,
    topic?: string,
    source: 'MQTT' | 'SIMULATOR' = 'MQTT'
  ): Promise<TelemetryValidationResult> {
    this.packetStats.totalReceived++;

    let data: any = {};
    if (typeof rawPayload === 'string') {
      try {
        data = JSON.parse(rawPayload);
      } catch {
        this.packetStats.totalInvalid++;
        console.warn('[MqttTelemetryService] Rejected telemetry packet: Malformed JSON payload');
        return { success: false, reason: 'Malformed JSON payload' };
      }
    } else {
      data = rawPayload;
    }

    if (!data || typeof data !== 'object') {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Invalid payload object' };
    }

    // Standardize & extract payload properties
    let deviceId = data.deviceId || data.device_id || data.id;
    if (!deviceId && topic) {
      const parts = topic.split('/');
      deviceId = parts[parts.length - 1];
    }

    const voltage = Number(data.voltage);
    const current = Number(data.current);
    const powerFactor = Number(data.powerFactor ?? data.power_factor ?? data.pf ?? 1.0);
    const frequency = Number(data.frequency ?? data.freq ?? 50.0);
    const timestamp = data.timestamp || data.time || new Date().toISOString();

    // Calculate Active Power if missing: P = V x I x PF
    let activePower = data.activePower ?? data.active_power ?? data.power ?? data.powerW;
    if (activePower === undefined || activePower === null || isNaN(Number(activePower))) {
      if (!isNaN(voltage) && !isNaN(current) && !isNaN(powerFactor)) {
        activePower = voltage * current * powerFactor;
      } else {
        activePower = NaN;
      }
    } else {
      activePower = Number(activePower);
    }

    // Packet validation rules
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Missing or invalid deviceId' };
    }

    if (isNaN(voltage) || voltage <= 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Voltage must be greater than 0' };
    }

    if (isNaN(current) || current < 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Current must be non-negative (>= 0)' };
    }

    if (isNaN(powerFactor) || powerFactor < 0 || powerFactor > 1) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Power factor must be between 0 and 1' };
    }

    if (isNaN(frequency) || frequency < 45 || frequency > 65) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Frequency out of reasonable range (45 - 65 Hz)' };
    }

    if (isNaN(activePower) || activePower < 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: 'Active power must be non-negative (>= 0)' };
    }

    // Telemetry packet is valid
    this.packetStats.totalValid++;
    this.lastTelemetryReceived = new Date().toISOString();

    // Map deviceId to Supabase devices table
    const mappedDevice = await SupabaseService.getInstance().findDeviceBySerialOrId(deviceId);
    const targetDeviceId = mappedDevice?.id || deviceId;
    const targetHouseholdId = mappedDevice?.household_id || DEMO_HOUSEHOLD_UUID;

    // Store in Supabase readings table
    const saved = await SupabaseService.getInstance().insertReading({
      device_id: targetDeviceId,
      household_id: targetHouseholdId,
      timestamp,
      voltage: Number(voltage.toFixed(1)),
      current: Number(current.toFixed(2)),
      power_factor: Number(powerFactor.toFixed(2)),
      active_power: Number(activePower.toFixed(1)),
      frequency: Number(frequency.toFixed(1)),
    });

    if (saved) {
      this.packetStats.totalSavedToDb++;
    }

    // Update in-memory cache for live updates
    const readingObj = {
      deviceId: targetDeviceId,
      originalDeviceId: deviceId,
      householdId: targetHouseholdId,
      voltage: Number(voltage.toFixed(1)),
      current: Number(current.toFixed(2)),
      powerFactor: Number(powerFactor.toFixed(2)),
      activePowerW: Number(activePower.toFixed(1)),
      frequency: Number(frequency.toFixed(1)),
      timestamp,
      source,
    };

    this.latestReadings.set(targetDeviceId, readingObj);

    return {
      success: true,
      deviceId: targetDeviceId,
      householdId: targetHouseholdId,
      reading: readingObj,
    };
  }

  public getStatus() {
    return {
      mqttStatus: this.status,
      lastTelemetryReceived: this.lastTelemetryReceived,
      packetStats: { ...this.packetStats },
      topic: this.topic,
      isConfigured: this.status !== 'NOT_CONFIGURED',
    };
  }

  public getLatestForDevice(deviceId: string) {
    return this.latestReadings.get(deviceId) || null;
  }

  public getLatestForHousehold(householdId: string) {
    const list: any[] = [];
    this.latestReadings.forEach((reading) => {
      if (reading.householdId === householdId || householdId === DEMO_HOUSEHOLD_UUID) {
        list.push(reading);
      }
    });
    return list;
  }
}
