import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Household, Room, Appliance, UserProfile } from '../../shared/types/household';
import { IoTDevice } from '../../shared/types/iot';
import { COMMON_BD_APPLIANCES_PRESETS } from '../../shared/constants/bdTariffs';

export class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient | null = null;
  private isMockMode: boolean = false;

  // In-memory data store for fallback/demo mode
  private mockUsers: Map<string, UserProfile> = new Map();
  private mockHouseholds: Map<string, Household> = new Map();
  private mockRooms: Map<string, Room[]> = new Map();
  private mockAppliances: Map<string, Appliance[]> = new Map();
  private mockDevices: Map<string, IoTDevice[]> = new Map();

  private constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const key = serviceKey || anonKey;
    const isProd = process.env.NODE_ENV === 'production';

    const isValidConfig = url && key && url.length > 5 && !url.includes('your-supabase-project');

    if (isProd && !isValidConfig) {
      throw new Error(
        '[SupabaseService FATAL] Production mode requires valid SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.'
      );
    }

    if (isValidConfig) {
      try {
        if (!serviceKey && anonKey) {
          console.warn('[SupabaseService WARNING] Using SUPABASE_ANON_KEY in backend service. For full administrative access and RLS bypass in server-side operations, SUPABASE_SERVICE_ROLE_KEY should be configured.');
        }
        this.client = createClient(url!, key!);
        console.log('[SupabaseService] Initialized live Supabase client.');
      } catch (err) {
        if (isProd) {
          throw new Error(`[SupabaseService FATAL] Failed to initialize Supabase client in production: ${err}`);
        }
        console.warn('[SupabaseService] Error creating client, falling back to development mock mode:', err);
        this.isMockMode = true;
      }
    } else {
      console.log('[SupabaseService] No valid Supabase credentials found in development. Running in local dev mock mode.');
      this.isMockMode = true;
    }

    this.seedInitialMockData();
  }

  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService();
    }
    return SupabaseService.instance;
  }

  public getClient(): SupabaseClient | null {
    return this.client;
  }

  public isUsingMock(): boolean {
    return this.isMockMode;
  }

  private seedInitialMockData() {
    const defaultUserId = 'usr_dhaka_01';
    const defaultUser: UserProfile = {
      id: defaultUserId,
      email: 'demo@kilowattiq.bd',
      fullName: 'Tanvir Hossain',
      phone: '+8801711223344',
      role: 'CONSUMER',
      created_at: new Date().toISOString(),
    };
    this.mockUsers.set(defaultUserId, defaultUser);

    const defaultHouseholdId = 'hh_gulshan_01';
    const defaultHousehold: Household = {
      id: defaultHouseholdId,
      userId: defaultUserId,
      name: 'Gulshan Residence - Flat 4B',
      utilityProvider: 'DESCO',
      accountNumber: 'DESCO-88294012',
      sanctionedLoadKw: 4.5,
      monthlyBudgetBDT: 4500,
      address: {
        division: 'Dhaka',
        city: 'Dhaka North',
        area: 'Gulshan 2',
      },
      createdAt: new Date().toISOString(),
    };
    this.mockHouseholds.set(defaultHouseholdId, defaultHousehold);

    const rooms: Room[] = [
      { id: 'rm_master', householdId: defaultHouseholdId, name: 'Master Bedroom', floorLevel: 4, icon: 'bed' },
      { id: 'rm_living', householdId: defaultHouseholdId, name: 'Living & Dining Area', floorLevel: 4, icon: 'tv' },
      { id: 'rm_kitchen', householdId: defaultHouseholdId, name: 'Kitchen & Utility', floorLevel: 4, icon: 'utensils' },
    ];
    this.mockRooms.set(defaultHouseholdId, rooms);

    const appliances: Appliance[] = [
      {
        id: 'app_01',
        householdId: defaultHouseholdId,
        roomId: 'rm_master',
        name: 'Master Bedroom 1.5T AC',
        category: 'AIR_CONDITIONER',
        ratedPowerW: 1650,
        standbyPowerW: 16,
        averageHoursPerDay: 7,
        isInverterType: false,
        energyRatingStars: 2,
        isVampireRisk: true,
      },
      {
        id: 'app_02',
        householdId: defaultHouseholdId,
        roomId: 'rm_kitchen',
        name: 'Frost Double Door Fridge',
        category: 'REFRIGERATOR',
        ratedPowerW: 210,
        standbyPowerW: 14,
        averageHoursPerDay: 24,
        isInverterType: false,
        energyRatingStars: 3,
        isVampireRisk: true,
      },
      {
        id: 'app_03',
        householdId: defaultHouseholdId,
        roomId: 'rm_living',
        name: 'Living Room Smart TV (55")',
        category: 'TELEVISION',
        ratedPowerW: 120,
        standbyPowerW: 12,
        averageHoursPerDay: 5,
        isInverterType: false,
        energyRatingStars: 4,
        isVampireRisk: true,
      },
      {
        id: 'app_04',
        householdId: defaultHouseholdId,
        roomId: 'rm_master',
        name: 'Master Bed BLDC Ceiling Fan',
        category: 'FAN',
        ratedPowerW: 30,
        standbyPowerW: 1,
        averageHoursPerDay: 10,
        isInverterType: true,
        energyRatingStars: 5,
        isVampireRisk: false,
      },
    ];
    this.mockAppliances.set(defaultHouseholdId, appliances);

    const devices: IoTDevice[] = [
      {
        id: 'dev_desco_main',
        householdId: defaultHouseholdId,
        name: 'Main DESCO Smart Meter Gateway',
        deviceType: 'SMART_METER',
        adapterType: 'DESCOAdapter',
        macOrSerial: 'DSK-9901-4412',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        config: { sanctionedLoadKw: 4.5, accumulatedKwh: 245.8 },
      },
      {
        id: 'dev_tuya_ac',
        householdId: defaultHouseholdId,
        roomId: 'rm_master',
        applianceId: 'app_01',
        name: 'AC Wi-Fi Smart Power Plug',
        deviceType: 'SMART_PLUG',
        adapterType: 'TuyaAdapter',
        macOrSerial: 'TUYA-8812-7741',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        config: { ratedWatts: 1650, accumulatedKwh: 78.4 },
      },
      {
        id: 'dev_pzem_db',
        householdId: defaultHouseholdId,
        name: 'Distribution Box ESP32 PZEM Monitor',
        deviceType: 'ESP32_PZEM',
        adapterType: 'MQTTAdapter',
        macOrSerial: 'ESP32-9021-PZEM',
        mqttTopic: 'kilowattiq/gulshan/pzem01',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        config: { ratedWatts: 850, accumulatedKwh: 122.1 },
      },
    ];
    this.mockDevices.set(defaultHouseholdId, devices);
  }

  // --- Household Queries ---
  async getHouseholds(userId: string): Promise<Household[]> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client
        .from('households')
        .select('*');
      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          userId: userId,
          name: row.name,
          utilityProvider: row.utility_provider,
          accountNumber: row.account_number,
          sanctionedLoadKw: Number(row.sanctioned_load_kw),
          monthlyBudgetBDT: Number(row.monthly_budget_bdt),
          address: {
            division: row.address_division || 'Dhaka',
            city: row.address_city || 'Dhaka',
            area: row.address_area || 'Gulshan',
          },
          createdAt: row.created_at,
        }));
      }
    }
    return Array.from(this.mockHouseholds.values()).filter(h => h.userId === userId || userId === 'usr_dhaka_01');
  }

  async getHouseholdById(id: string): Promise<Household | null> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('households').select('*').eq('id', id).single();
      if (!error && data) {
        return {
          id: data.id,
          userId: 'usr_dhaka_01',
          name: data.name,
          utilityProvider: data.utility_provider,
          accountNumber: data.account_number,
          sanctionedLoadKw: Number(data.sanctioned_load_kw),
          monthlyBudgetBDT: Number(data.monthly_budget_bdt),
          address: {
            division: data.address_division || 'Dhaka',
            city: data.address_city || 'Dhaka',
            area: data.address_area || 'Gulshan',
          },
          createdAt: data.created_at,
        };
      }
    }
    return this.mockHouseholds.get(id) || null;
  }

  async createHousehold(household: Omit<Household, 'id' | 'createdAt'>): Promise<Household> {
    const newHousehold: Household = {
      ...household,
      id: `hh_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    if (!this.isMockMode && this.client) {
      await this.client.from('households').insert({
        name: household.name,
        utility_provider: household.utilityProvider,
        account_number: household.accountNumber,
        sanctioned_load_kw: household.sanctionedLoadKw,
        monthly_budget_bdt: household.monthlyBudgetBDT,
        address_division: household.address?.division || 'Dhaka',
        address_city: household.address?.city || 'Dhaka',
        address_area: household.address?.area || 'Gulshan',
      });
    }
    this.mockHouseholds.set(newHousehold.id, newHousehold);
    return newHousehold;
  }

  // --- Rooms & Appliances Queries ---
  async getRooms(householdId: string): Promise<Room[]> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('rooms').select('*').eq('household_id', householdId);
      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          name: row.name,
          floorLevel: row.floor_level,
          icon: row.icon,
        }));
      }
    }
    return this.mockRooms.get(householdId) || [];
  }

  async createRoom(room: Omit<Room, 'id'>): Promise<Room> {
    const newRoom: Room = { ...room, id: `rm_${Date.now()}` };
    if (!this.isMockMode && this.client) {
      const { data } = await this.client.from('rooms').insert({
        household_id: room.householdId,
        name: room.name,
        floor_level: room.floorLevel,
        icon: room.icon,
      }).select().single();
      if (data) newRoom.id = data.id;
    }
    const current = this.mockRooms.get(room.householdId) || [];
    this.mockRooms.set(room.householdId, [...current, newRoom]);
    return newRoom;
  }

  async getAppliances(householdId: string): Promise<Appliance[]> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('appliances').select('*').eq('household_id', householdId);
      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          roomId: row.room_id,
          deviceId: row.device_id,
          name: row.name,
          category: row.category,
          ratedPowerW: Number(row.rated_wattage),
          standbyPowerW: Number(row.standby_wattage),
          averageHoursPerDay: Number(row.average_hours_per_day),
          isInverterType: row.is_inverter_type,
          energyRatingStars: row.energy_rating_stars,
          isVampireRisk: row.is_vampire_risk,
        }));
      }
    }
    return this.mockAppliances.get(householdId) || [];
  }

  async createAppliance(appliance: Omit<Appliance, 'id'>): Promise<Appliance> {
    const newApp: Appliance = { ...appliance, id: `app_${Date.now()}` };
    if (!this.isMockMode && this.client) {
      const { data } = await this.client.from('appliances').insert({
        household_id: appliance.householdId,
        room_id: appliance.roomId,
        name: appliance.name,
        category: appliance.category,
        rated_wattage: appliance.ratedPowerW,
        standby_wattage: appliance.standbyPowerW,
        average_hours_per_day: appliance.averageHoursPerDay,
        is_inverter_type: appliance.isInverterType,
        is_vampire_risk: appliance.isVampireRisk,
      }).select().single();
      if (data) newApp.id = data.id;
    }
    const current = this.mockAppliances.get(appliance.householdId) || [];
    this.mockAppliances.set(appliance.householdId, [...current, newApp]);
    return newApp;
  }

  // --- Devices Queries ---
  async getDevices(householdId: string): Promise<IoTDevice[]> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('devices').select('*').eq('household_id', householdId);
      if (!error && data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          roomId: row.room_id,
          applianceId: row.appliance_id,
          name: row.name,
          deviceType: row.device_type,
          adapterType: row.adapter_type,
          macOrSerial: row.mac_or_serial,
          mqttTopic: row.mqtt_topic,
          isOnline: row.is_online,
          lastSeen: row.last_seen_at,
          config: row.config || {},
        }));
      }
    }
    return this.mockDevices.get(householdId) || [];
  }

  async createDevice(device: Omit<IoTDevice, 'id' | 'lastSeen'>): Promise<IoTDevice> {
    const newDevice: IoTDevice = {
      ...device,
      id: `dev_${Date.now()}`,
      lastSeen: new Date().toISOString(),
    };
    if (!this.isMockMode && this.client) {
      const { data } = await this.client.from('devices').insert({
        household_id: device.householdId,
        room_id: device.roomId,
        appliance_id: device.applianceId,
        name: device.name,
        device_type: device.deviceType,
        adapter_type: device.adapterType,
        mac_or_serial: device.macOrSerial,
        mqtt_topic: device.mqttTopic,
        is_online: device.isOnline,
        config: device.config || {},
      }).select().single();
      if (data) newDevice.id = data.id;
    }
    const current = this.mockDevices.get(device.householdId) || [];
    this.mockDevices.set(device.householdId, [...current, newDevice]);
    return newDevice;
  }
}
