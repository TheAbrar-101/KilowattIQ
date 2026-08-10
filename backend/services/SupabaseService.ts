import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Household, Room, Appliance } from '../../shared/types/household';
import { IoTDevice } from '../../shared/types/iot';

export const DEMO_HOUSEHOLD_UUID = '11111111-1111-4111-a111-111111111111';

export class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient | null = null;
  private isMockMode: boolean = false;
  private configError: string | null = null;

  private constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const key = serviceKey || anonKey;
    const useMockEnv = process.env.USE_MOCK_DATA === 'true';

    const isValidConfig = Boolean(
      url &&
      key &&
      url.length > 5 &&
      !url.includes('your-supabase-project') &&
      !key.includes('your-service-role-key') &&
      !key.includes('your-anon-key')
    );

    if (!isValidConfig) {
      if (useMockEnv) {
        console.warn('[SupabaseService WARNING] Missing valid Supabase credentials. Running in MOCK mode.');
        this.isMockMode = true;
      } else {
        const missingDetails = [];
        if (!url || url.includes('your-supabase-project')) missingDetails.push('SUPABASE_URL is missing or placeholder');
        if (!key || key.includes('your-service-role-key') || key.includes('your-anon-key')) missingDetails.push('SUPABASE_SERVICE_ROLE_KEY is missing or placeholder');
        this.configError = `Missing valid Supabase configuration: ${missingDetails.join(', ')}.`;
        console.error(`[SupabaseService CONFIG ERROR] ${this.configError}`);
      }
    } else {
      try {
        let formattedUrl = url!.trim();
        if (formattedUrl.includes('supabase.com/dashboard/project/')) {
          const ref = formattedUrl.split('supabase.com/dashboard/project/')[1].split('/')[0];
          formattedUrl = `https://${ref}.supabase.co`;
        } else if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
          formattedUrl = `https://${formattedUrl}`;
        }

        this.client = createClient(formattedUrl, key!);
        this.isMockMode = false;
        console.log('[SupabaseService] Initialized live Supabase client successfully.');
      } catch (err: any) {
        if (useMockEnv) {
          this.isMockMode = true;
        } else {
          this.configError = `Failed to initialize Supabase client: ${err?.message || String(err)}`;
        }
      }
    }
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

  private resolveHouseholdId(id?: string): string {
    if (!id || id === 'hh_gulshan_01' || id === 'default') {
      return DEMO_HOUSEHOLD_UUID;
    }
    return id;
  }

  public async testDatabaseConnection(): Promise<{
    success: boolean;
    databaseStatus: 'connected' | 'disconnected';
    error?: string;
    details?: any;
  }> {
    if (this.configError) {
      return { success: false, databaseStatus: 'disconnected', error: this.configError };
    }
    if (this.isMockMode || !this.client) {
      return { success: false, databaseStatus: 'disconnected', error: 'Running in mock mode.' };
    }

    try {
      const { data, error } = await this.client.from('households').select('id').limit(1);
      if (!error) {
        return { success: true, databaseStatus: 'connected', details: { householdFound: data?.length } };
      }
      return { success: false, databaseStatus: 'disconnected', error: error.message };
    } catch (err: any) {
      return { success: false, databaseStatus: 'disconnected', error: err?.message || String(err) };
    }
  }

  // --- AUTHENTICATION & PROFILE SERVICES ---

  public async signUpUser(params: { email: string; password: string; fullName: string; phone?: string }): Promise<any> {
    if (!this.client) throw new Error('Supabase client not initialized');

    let user: any = null;
    let session: any = null;

    // Try admin.createUser first to auto-confirm email
    try {
      const { data: adminData, error: adminErr } = await this.client.auth.admin.createUser({
        email: params.email,
        password: params.password,
        email_confirm: true,
        user_metadata: { full_name: params.fullName, phone: params.phone || '' },
      });

      if (!adminErr && adminData.user) {
        user = adminData.user;
      }
    } catch (e) {
      console.warn('[SupabaseService] Admin createUser fallback:', e);
    }

    if (!user) {
      const { data: authData, error: authErr } = await this.client.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            phone: params.phone,
          },
        },
      });

      if (authErr) throw authErr;
      user = authData.user;
      session = authData.session;
    }

    if (!user) throw new Error('User creation failed');

    // 1. Create Profile
    const profileObj = {
      id: user.id,
      email: user.email,
      full_name: params.fullName,
      phone: params.phone || null,
      role: 'owner',
      updated_at: new Date().toISOString(),
    };

    const { error: pErr } = await this.client.from('profiles').upsert(profileObj);
    if (pErr) console.error('[SupabaseService] Profile creation error:', pErr.message);

    // 2. Link to Demo Household so user can manage energy immediately
    await this.ensureHouseholdMembership(user.id);

    // If session is missing (e.g. from admin createUser), log user in
    if (!session) {
      const { data: signInData } = await this.client.auth.signInWithPassword({
        email: params.email,
        password: params.password,
      });
      session = signInData.session;
    }

    const households = await this.getHouseholdsForUser(user.id);

    return {
      session,
      user: {
        id: user.id,
        email: user.email,
        fullName: params.fullName,
        phone: params.phone,
        role: 'owner',
      },
      households,
    };
  }

  public async signInUser(params: { email: string; password: string }): Promise<any> {
    if (!this.client) throw new Error('Supabase client not initialized');

    const { data: authData, error: authErr } = await this.client.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (authErr) throw authErr;

    const user = authData.user;
    if (!user) throw new Error('Sign in failed');

    // Fetch or create profile
    let { data: profile } = await this.client.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) {
      const { data: newP } = await this.client.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'KilowattIQ Consumer',
        role: 'owner',
      }).select().single();
      profile = newP;
    }

    // Ensure household membership exists
    await this.ensureHouseholdMembership(user.id);

    const households = await this.getHouseholdsForUser(user.id);

    return {
      token: authData.session?.access_token,
      session: authData.session,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || 'KilowattIQ Consumer',
        phone: profile?.phone || '',
        role: profile?.role || 'owner',
      },
      households,
    };
  }

  public async verifyToken(token: string): Promise<{ user: any; profile: any; householdIds: string[] } | null> {
    if (!this.client) return null;

    try {
      const { data: { user }, error } = await this.client.auth.getUser(token);
      if (error || !user) return null;

      const { data: profile } = await this.client.from('profiles').select('*').eq('id', user.id).single();
      const households = await this.getHouseholdsForUser(user.id);
      const householdIds = households.map(h => h.id);

      return {
        user,
        profile: profile || { id: user.id, email: user.email, full_name: 'KilowattIQ Consumer', role: 'owner' },
        householdIds,
      };
    } catch (err) {
      console.error('[SupabaseService] Token verification error:', err);
      return null;
    }
  }

  public async ensureHouseholdMembership(userId: string): Promise<void> {
    if (!this.client) return;

    const { data: members } = await this.client.from('household_members').select('*').eq('user_id', userId);
    if (!members || members.length === 0) {
      // Safely link to default demo household
      const { error: mErr } = await this.client.from('household_members').upsert({
        household_id: DEMO_HOUSEHOLD_UUID,
        user_id: userId,
        role: 'owner',
      });
      if (mErr) console.error('[SupabaseService] Household member link error:', mErr.message);
    }
  }

  public async getHouseholdsForUser(userId: string): Promise<Household[]> {
    if (!this.client) return [];

    const { data: members, error: mErr } = await this.client.from('household_members').select('household_id').eq('user_id', userId);
    if (mErr) {
      console.error('[SupabaseService] getHouseholdsForUser member query error:', mErr.message);
    }

    let hIds = (members || []).map(m => m.household_id);
    if (hIds.length === 0) {
      hIds = [DEMO_HOUSEHOLD_UUID];
    }

    const { data: households, error: hErr } = await this.client.from('households').select('*').in('id', hIds);
    if (hErr) {
      console.error('[SupabaseService] getHouseholdsForUser household query error:', hErr.message);
      return [];
    }

    return (households || []).map(row => ({
      id: row.id,
      userId,
      name: row.name,
      utilityProvider: row.utility_provider || 'DESCO',
      accountNumber: row.account_number || '8820-9941-01',
      sanctionedLoadKw: Number(row.sanctioned_load_kw) || 5.5,
      monthlyBudgetBDT: 4500,
      address: {
        division: 'Dhaka',
        city: row.address_city || 'Dhaka',
        area: row.address_area || 'Gulshan 2',
      },
      createdAt: row.created_at,
    }));
  }

  public async getProfile(userId: string): Promise<any> {
    if (!this.client) return null;
    const { data } = await this.client.from('profiles').select('*').eq('id', userId).single();
    return data;
  }

  public async updateProfile(userId: string, updates: { fullName?: string; phone?: string; role?: string }): Promise<any> {
    if (!this.client) return null;
    const { data, error } = await this.client.from('profiles').update({
      full_name: updates.fullName,
      phone: updates.phone,
      role: updates.role,
      updated_at: new Date().toISOString(),
    }).eq('id', userId).select().single();

    if (error) throw error;
    return data;
  }

  // --- HOUSEHOLDS, ROOMS, APPLIANCES, DEVICES, TELEMETRY ---

  async getHouseholds(userId?: string): Promise<Household[]> {
    if (userId) {
      return this.getHouseholdsForUser(userId);
    }
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('households').select('*');
      if (error) {
        console.error('[SupabaseService ERROR] getHouseholds:', error.message);
        return [];
      }
      if (data) {
        return data.map(row => ({
          id: row.id,
          userId: userId || 'usr_dhaka_01',
          name: row.name,
          utilityProvider: row.utility_provider || 'DESCO',
          accountNumber: row.account_number || '8820-9941-01',
          sanctionedLoadKw: Number(row.sanctioned_load_kw) || 5.5,
          monthlyBudgetBDT: 4500,
          address: {
            division: 'Dhaka',
            city: row.address_city || 'Dhaka',
            area: row.address_area || 'Gulshan 2',
          },
          createdAt: row.created_at,
        }));
      }
    }
    return [];
  }

  async getHouseholdById(id: string): Promise<Household | null> {
    const targetId = this.resolveHouseholdId(id);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('households').select('*').eq('id', targetId).single();
      if (error) {
        console.error('[SupabaseService ERROR] getHouseholdById:', error.message);
        return null;
      }
      if (data) {
        return {
          id: data.id,
          userId: 'usr_dhaka_01',
          name: data.name,
          utilityProvider: data.utility_provider || 'DESCO',
          accountNumber: data.account_number || '8820-9941-01',
          sanctionedLoadKw: Number(data.sanctioned_load_kw) || 5.5,
          monthlyBudgetBDT: 4500,
          address: {
            division: 'Dhaka',
            city: data.address_city || 'Dhaka',
            area: data.address_area || 'Gulshan 2',
          },
          createdAt: data.created_at,
        };
      }
    }
    return null;
  }

  async createHousehold(household: Omit<Household, 'id' | 'createdAt'>): Promise<Household> {
    const id = `hh_${Date.now()}`;
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('households').insert({
        name: household.name,
        utility_provider: household.utilityProvider,
        account_number: household.accountNumber,
        sanctioned_load_kw: household.sanctionedLoadKw,
        address_street: 'Road 113, House 24',
        address_city: household.address?.city || 'Dhaka',
        address_area: household.address?.area || 'Gulshan 2',
      }).select().single();
      if (error) console.error('[SupabaseService ERROR] createHousehold:', error.message);
      if (data) return { ...household, id: data.id, createdAt: data.created_at };
    }
    return { ...household, id, createdAt: new Date().toISOString() };
  }

  // Rooms
  async getRooms(householdId: string): Promise<Room[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('rooms').select('*').eq('household_id', targetHhId);
      if (error) {
        console.error('[SupabaseService ERROR] getRooms:', error.message);
        return [];
      }
      if (data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          name: row.name,
          floorLevel: row.floor_level || 4,
          icon: row.icon || 'sofa',
        }));
      }
    }
    return [];
  }

  async createRoom(room: Omit<Room, 'id'>): Promise<Room> {
    const targetHhId = this.resolveHouseholdId(room.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('rooms').insert({
        household_id: targetHhId,
        name: room.name,
        floor_level: room.floorLevel || 1,
        icon: room.icon || 'sofa',
      }).select().single();
      if (error) console.error('[SupabaseService ERROR] createRoom:', error.message);
      if (data) return { id: data.id, householdId: data.household_id, name: data.name, floorLevel: data.floor_level, icon: data.icon };
    }
    return { ...room, id: `rm_${Date.now()}` };
  }

  // Appliances
  async getAppliances(householdId: string): Promise<Appliance[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('appliances').select('*').eq('household_id', targetHhId);
      if (error) {
        console.error('[SupabaseService ERROR] getAppliances:', error.message);
        return [];
      }
      if (data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          roomId: row.room_id || 'unassigned',
          name: row.name,
          category: row.category,
          ratedPowerW: Number(row.rated_power_w) || 100,
          standbyPowerW: Number(row.standby_power_w) || 0,
          averageHoursPerDay: Number(row.average_hours_per_day) || 6,
          isInverterType: Boolean(row.is_inverter_type),
          energyRatingStars: row.star_rating || 3,
          isVampireRisk: Boolean(row.is_vampire_risk),
          purchasePriceBDT: Number(row.purchase_price_bdt) || 0,
        }));
      }
    }
    return [];
  }

  async createAppliance(appliance: Omit<Appliance, 'id'>): Promise<Appliance> {
    const targetHhId = this.resolveHouseholdId(appliance.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('appliances').insert({
        household_id: targetHhId,
        room_id: appliance.roomId || null,
        name: appliance.name,
        category: appliance.category || 'OTHER',
        rated_power_w: appliance.ratedPowerW || 100,
        standby_power_w: appliance.standbyPowerW || 0,
        average_hours_per_day: appliance.averageHoursPerDay || 6,
        is_inverter_type: appliance.isInverterType || false,
        star_rating: appliance.energyRatingStars || 3,
        is_vampire_risk: appliance.isVampireRisk || false,
        purchase_price_bdt: appliance.purchasePriceBDT || 0,
      }).select().single();
      if (error) console.error('[SupabaseService ERROR] createAppliance:', error.message);
      if (data) {
        return {
          id: data.id,
          householdId: data.household_id,
          roomId: data.room_id,
          name: data.name,
          category: data.category,
          ratedPowerW: Number(data.rated_power_w),
          standbyPowerW: Number(data.standby_power_w),
          averageHoursPerDay: Number(data.average_hours_per_day),
          isInverterType: Boolean(data.is_inverter_type),
          energyRatingStars: data.star_rating,
          isVampireRisk: Boolean(data.is_vampire_risk),
          purchasePriceBDT: Number(data.purchase_price_bdt),
        };
      }
    }
    return { ...appliance, id: `app_${Date.now()}` };
  }

  // Devices
  async getDevices(householdId: string): Promise<IoTDevice[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('devices').select('*').eq('household_id', targetHhId);
      if (error) {
        console.error('[SupabaseService ERROR] getDevices:', error.message);
        return [];
      }
      if (data) {
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
          isOnline: Boolean(row.is_online),
          lastSeen: row.last_seen || row.updated_at || new Date().toISOString(),
          config: row.config || {},
        }));
      }
    }
    return [];
  }

  async createDevice(device: Omit<IoTDevice, 'id' | 'lastSeen'>): Promise<IoTDevice> {
    const targetHhId = this.resolveHouseholdId(device.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('devices').insert({
        household_id: targetHhId,
        room_id: device.roomId || null,
        appliance_id: device.applianceId || null,
        name: device.name,
        device_type: device.deviceType || 'SMART_PLUG',
        adapter_type: device.adapterType || 'MockAdapter',
        mac_or_serial: device.macOrSerial || `MAC-${Date.now()}`,
        mqtt_topic: device.mqttTopic || null,
        is_online: device.isOnline ?? true,
        config: device.config || {},
      }).select().single();
      if (error) console.error('[SupabaseService ERROR] createDevice:', error.message);
      if (data) {
        return {
          id: data.id,
          householdId: data.household_id,
          roomId: data.room_id,
          applianceId: data.appliance_id,
          name: data.name,
          deviceType: data.device_type,
          adapterType: data.adapter_type,
          macOrSerial: data.mac_or_serial,
          mqttTopic: data.mqtt_topic,
          isOnline: data.is_online,
          lastSeen: data.last_seen || new Date().toISOString(),
          config: data.config || {},
        };
      }
    }
    return { ...device, id: `dev_${Date.now()}`, lastSeen: new Date().toISOString() };
  }

  // Readings / Telemetry
  async getReadings(householdId: string): Promise<any[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('readings').select('*').eq('household_id', targetHhId).order('timestamp', { ascending: false }).limit(50);
      if (error) {
        console.error('[SupabaseService ERROR] getReadings:', error.message);
        return [];
      }
      return data || [];
    }
    return [];
  }

  async insertReading(reading: {
    device_id: string;
    household_id: string;
    timestamp: string;
    voltage: number;
    current: number;
    power_factor: number;
    active_power: number;
    frequency: number;
  }): Promise<boolean> {
    if (!this.isMockMode && this.client) {
      // Prevent duplicate telemetry records for same device_id and timestamp
      const { data: existing } = await this.client
        .from('readings')
        .select('id')
        .eq('device_id', reading.device_id)
        .eq('timestamp', reading.timestamp)
        .maybeSingle();

      if (existing) {
        return true;
      }

      const { error } = await this.client.from('readings').insert({
        device_id: reading.device_id,
        household_id: reading.household_id,
        timestamp: reading.timestamp,
        voltage: reading.voltage,
        current: reading.current,
        power_factor: reading.power_factor,
        active_power: reading.active_power,
        frequency: reading.frequency,
      });

      if (error) {
        console.error('[SupabaseService ERROR] insertReading:', error.message);
        return false;
      }

      // Update device online status & last seen
      await this.client.from('devices').update({
        is_online: true,
        last_seen: reading.timestamp,
      }).eq('id', reading.device_id);

      return true;
    }
    return false;
  }

  async findDeviceBySerialOrId(deviceIdOrSerial: string): Promise<{ id: string; household_id: string } | null> {
    if (!this.isMockMode && this.client) {
      const { data: devById } = await this.client
        .from('devices')
        .select('id, household_id')
        .eq('id', deviceIdOrSerial)
        .maybeSingle();

      if (devById) return devById;

      const { data: devBySerial } = await this.client
        .from('devices')
        .select('id, household_id')
        .or(`mac_or_serial.eq.${deviceIdOrSerial},mqtt_topic.eq.${deviceIdOrSerial}`)
        .limit(1)
        .maybeSingle();

      if (devBySerial) return devBySerial;

      const { data: fallbackDev } = await this.client
        .from('devices')
        .select('id, household_id')
        .limit(1)
        .maybeSingle();

      if (fallbackDev) return fallbackDev;
    }
    return null;
  }

  async getLatestReadingForDevice(deviceId: string): Promise<any | null> {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client
        .from('readings')
        .select('*')
        .eq('device_id', deviceId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[SupabaseService ERROR] getLatestReadingForDevice:', error.message);
        return null;
      }
      return data;
    }
    return null;
  }

  // Tariffs & Rules
  async getTariffs(householdId: string): Promise<any> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data: tariff, error: tErr } = await this.client.from('tariffs').select('*').eq('household_id', targetHhId).single();
      if (tErr && tErr.code !== 'PGRST116') {
        console.error('[SupabaseService ERROR] getTariffs:', tErr.message);
      }
      if (tariff) {
        const { data: rules } = await this.client.from('tariff_rate_rules').select('*').eq('tariff_id', tariff.id).order('step_number', { ascending: true });
        return { ...tariff, rules: rules || [] };
      }
    }
    return null;
  }

  // Budgets & History
  async getBudgets(householdId: string): Promise<any> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data: budget } = await this.client.from('budgets').select('*').eq('household_id', targetHhId).order('created_at', { ascending: false }).limit(1).single();
      const { data: history } = await this.client.from('budget_history').select('*').eq('household_id', targetHhId).order('month', { ascending: true });
      return { currentBudget: budget, history: history || [] };
    }
    return { currentBudget: null, history: [] };
  }

  // Suggestions / Recommendations
  async getSuggestions(householdId: string): Promise<any[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('suggestions').select('*').eq('household_id', targetHhId);
      if (error) {
        console.error('[SupabaseService ERROR] getSuggestions:', error.message);
        return [];
      }
      if (data) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          applianceId: row.appliance_id,
          title: row.title,
          type: row.type,
          severity: row.severity,
          status: row.status,
          description: row.description,
          estimatedMonthlySavingsBDT: Number(row.estimated_monthly_savings_bdt),
          actionableStep: row.actionable_step,
          createdAt: row.created_at,
        }));
      }
    }
    return [];
  }

  async updateSuggestionStatus(id: string, status: 'new' | 'resolved' | 'dismissed'): Promise<boolean> {
    if (!this.isMockMode && this.client) {
      const { error } = await this.client.from('suggestions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) {
        console.error('[SupabaseService ERROR] updateSuggestionStatus:', error.message);
        return false;
      }
      return true;
    }
    return true;
  }
}
