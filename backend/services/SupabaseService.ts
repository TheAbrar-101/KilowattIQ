import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Household, Room, Appliance } from '../../shared/types/household';
import { IoTDevice } from '../../shared/types/iot';

export const DEMO_HOUSEHOLD_UUID = '11111111-1111-4111-a111-111111111111';

export class SupabaseService {
  private static instance: SupabaseService;
  private serviceClient: SupabaseClient | null = null;
  private anonClient: SupabaseClient | null = null;
  private client: SupabaseClient | null = null;
  private isMockMode: boolean = false;
  private configError: string | null = null;

  private applianceStates: Map<string, boolean> = new Map([
    ['33333333-3333-4333-a333-333333333301', true],
    ['33333333-3333-4333-a333-333333333302', true],
    ['33333333-3333-4333-a333-333333333303', false],
    ['33333333-3333-4333-a333-333333333304', true],
    ['33333333-3333-4333-a333-333333333305', true],
    ['33333333-3333-4333-a333-333333333306', false],
    ['33333333-3333-4333-a333-333333333307', false],
    ['33333333-3333-4333-a333-333333333308', true],
    ['33333333-3333-4333-a333-333333333309', true],
  ]);

  private deviceStates: Map<string, boolean> = new Map();

  public isApplianceOn(applianceId: string): boolean {
    if (this.applianceStates.has(applianceId)) {
      return this.applianceStates.get(applianceId)!;
    }
    return true;
  }

  public setApplianceState(applianceId: string, isOn: boolean): void {
    this.applianceStates.set(applianceId, isOn);
  }

  public async toggleAppliance(applianceId: string, targetState?: boolean): Promise<{ applianceId: string; isOn: boolean }> {
    const currentState = this.isApplianceOn(applianceId);
    const newState = targetState !== undefined ? targetState : !currentState;
    this.applianceStates.set(applianceId, newState);

    const devices = await this.getDevices(DEMO_HOUSEHOLD_UUID);
    const connectedDev = devices.find(d => d.applianceId === applianceId);
    if (connectedDev) {
      this.deviceStates.set(connectedDev.id, newState);
    }

    return { applianceId, isOn: newState };
  }

  public isDeviceOn(deviceId: string): boolean {
    if (this.deviceStates.has(deviceId)) {
      return this.deviceStates.get(deviceId)!;
    }
    return true;
  }

  public async toggleDevice(deviceId: string, targetState?: boolean): Promise<{ deviceId: string; isOn: boolean }> {
    const currentState = this.isDeviceOn(deviceId);
    const newState = targetState !== undefined ? targetState : !currentState;
    this.deviceStates.set(deviceId, newState);

    const devices = await this.getDevices(DEMO_HOUSEHOLD_UUID);
    const dev = devices.find(d => d.id === deviceId);
    if (dev && dev.applianceId) {
      this.applianceStates.set(dev.applianceId, newState);
    }

    return { deviceId, isOn: newState };
  }

  private constructor() {
    const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const rawAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    const useMockEnv = process.env.USE_MOCK_DATA === 'true';

    // Clean whitespace and surrounding quotes
    const url = rawUrl?.trim().replace(/^["']|["']$/g, '');
    const serviceKey = rawServiceKey?.trim().replace(/^["']|["']$/g, '');
    const anonKey = rawAnonKey?.trim().replace(/^["']|["']$/g, '');

    const hasValidServiceKey = Boolean(
      serviceKey &&
      serviceKey.length > 10 &&
      !serviceKey.includes('your-service-role-key')
    );

    const hasValidAnonKey = Boolean(
      anonKey &&
      anonKey.length > 10 &&
      !anonKey.includes('your-anon-key')
    );

    const hasValidKey = hasValidServiceKey || hasValidAnonKey;

    let formattedUrl = '';
    if (url && url.length > 3 && !url.includes('your-supabase-project')) {
      formattedUrl = url.trim();
      // Handle project ref format (e.g. 20 alphanumeric chars)
      if (/^[a-z0-9]{20}$/i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}.supabase.co`;
      } else if (formattedUrl.includes('/project/')) {
        const ref = formattedUrl.split('/project/')[1].split('/')[0].split('?')[0];
        formattedUrl = `https://${ref}.supabase.co`;
      } else {
        if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
          formattedUrl = `https://${formattedUrl}`;
        }
        // Strip trailing slashes
        formattedUrl = formattedUrl.replace(/\/+$/, '');
      }
    }

    const hasValidUrl = Boolean(formattedUrl && formattedUrl.includes('.supabase.co'));

    if (!hasValidUrl || !hasValidKey || useMockEnv) {
      console.warn('[SupabaseService] Operating in MOCK mode with in-memory dataset.');
      this.isMockMode = true;
    } else {
      try {
        if (hasValidServiceKey) {
          this.serviceClient = createClient(formattedUrl, serviceKey!, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
        }

        if (hasValidAnonKey) {
          this.anonClient = createClient(formattedUrl, anonKey!, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
        }

        this.client = this.serviceClient || this.anonClient || createClient(formattedUrl, (serviceKey || anonKey)!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        if (!this.anonClient) {
          this.anonClient = this.client;
        }

        this.isMockMode = false;
        console.log(`[SupabaseService] Initialized live Supabase client successfully (${formattedUrl}).`);
      } catch (err: any) {
        console.warn(`[SupabaseService] Client init failed (${err?.message}). Operating in MOCK mode.`);
        this.isMockMode = true;
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

  public getServiceClient(): SupabaseClient | null {
    return this.serviceClient;
  }

  public getAnonClient(): SupabaseClient | null {
    return this.anonClient;
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
      const dbClient = this.serviceClient || this.client;
      const { data, error } = await dbClient.from('households').select('id').limit(1);
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
    if (this.isMockMode || (!this.client && !this.serviceClient && !this.anonClient)) {
      console.log('[SupabaseService] Mock registration for user:', params.email);
      return {
        session: null,
        requiresEmailConfirmation: false,
        message: 'Registration successful in simulation mode.',
        user: {
          id: `usr_${Date.now()}`,
          email: params.email,
          fullName: params.fullName || 'KilowattIQ Consumer',
          phone: params.phone || '',
          role: 'household_user',
        },
        households: await this.getHouseholdsForUser('usr_dhaka_01'),
      };
    }

    let user: any = null;
    let session: any = null;
    let requiresEmailConfirmation = false;

    // 1. Try serviceClient admin.createUser if service role key is available
    if (this.serviceClient) {
      try {
        const { data: adminData, error: adminErr } = await this.serviceClient.auth.admin.createUser({
          email: params.email,
          password: params.password,
          email_confirm: true,
          user_metadata: { full_name: params.fullName, phone: params.phone || '' },
        });

        if (!adminErr && adminData.user) {
          user = adminData.user;
        } else if (adminErr) {
          if (adminErr.message?.toLowerCase().includes('already registered') || adminErr.message?.toLowerCase().includes('already exists')) {
            throw new Error('User with this email is already registered. Please sign in instead.');
          }
          console.warn('[SupabaseService] Admin createUser warning:', adminErr.message);
        }
      } catch (e: any) {
        if (e.message?.includes('already registered') || e.message?.includes('already exists')) {
          throw e;
        }
        console.warn('[SupabaseService] Admin createUser fallback:', e?.message || e);
      }
    }

    // 2. Fallback to public auth.signUp if admin creation wasn't used or failed
    if (!user) {
      const publicClient = this.anonClient || this.client!;
      const { data: authData, error: authErr } = await publicClient.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            phone: params.phone || '',
          },
        },
      });

      if (authErr) {
        if (authErr.message?.toLowerCase().includes('already registered')) {
          throw new Error('User with this email is already registered. Please sign in instead.');
        }
        throw authErr;
      }

      user = authData.user;
      session = authData.session;
    }

    if (!user) {
      throw new Error('User creation failed. Please try again.');
    }

    // 3. Upsert Profile in profiles table
    try {
      const dbClient = this.serviceClient || this.client!;
      const profileObj = {
        id: user.id,
        email: user.email,
        full_name: params.fullName,
        phone: params.phone || null,
        role: 'household_user',
        updated_at: new Date().toISOString(),
      };
      await dbClient.from('profiles').upsert(profileObj);
    } catch (pErr: any) {
      console.warn('[SupabaseService] Non-fatal profile creation warning:', pErr?.message);
    }

    // 4. Ensure Household Membership
    try {
      await this.ensureHouseholdMembership(user.id);
    } catch (hErr: any) {
      console.warn('[SupabaseService] Non-fatal household membership warning:', hErr?.message);
    }

    // 5. If session is missing (e.g. from admin createUser), attempt sign-in
    if (!session) {
      const authClient = this.anonClient || this.client!;
      try {
        const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
          email: params.email,
          password: params.password,
        });

        if (!signInErr && signInData?.session) {
          session = signInData.session;
        } else if (signInErr) {
          if (signInErr.message?.toLowerCase().includes('email not confirmed')) {
            requiresEmailConfirmation = true;
          }
        }
      } catch (sErr: any) {
        console.warn('[SupabaseService] Post-signup sign-in warning:', sErr?.message);
      }
    }

    let households: Household[] = [];
    try {
      households = await this.getHouseholdsForUser(user.id);
    } catch (hhErr) {
      households = [{
        id: DEMO_HOUSEHOLD_UUID,
        userId: user.id,
        name: 'Gulshan Residence - Flat 4B',
        utilityProvider: 'DESCO',
        accountNumber: '8820-9941-01',
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: 'Dhaka', city: 'Dhaka', area: 'Gulshan 2' },
        createdAt: new Date().toISOString(),
      }];
    }

    return {
      session,
      requiresEmailConfirmation,
      message: requiresEmailConfirmation
        ? 'Registration successful! Email confirmation is enabled on your Supabase project. Please check your inbox to confirm before logging in.'
        : 'Registration successful.',
      user: {
        id: user.id,
        email: user.email,
        fullName: params.fullName,
        phone: params.phone || '',
        role: 'household_user',
      },
      households,
    };
  }

  public async signInUser(params: { email: string; password: string }): Promise<any> {
    const authClient = this.anonClient || this.client;
    if (!authClient || this.isMockMode) {
      const emailLower = params.email.toLowerCase();
      const isDemoUser =
        emailLower.includes('demo') ||
        emailLower.includes('tanvir') ||
        emailLower.includes('admin') ||
        emailLower === 'shahrearabrar101@gmail.com' ||
        params.password === 'demo123' ||
        params.password === 'admin123';

      if (isDemoUser) {
        const isAdmin = emailLower.includes('admin');
        return {
          token: isAdmin ? 'admin-jwt-token' : 'demo-jwt-token',
          session: null,
          user: {
            id: isAdmin ? 'usr_admin' : 'usr_dhaka_01',
            email: params.email,
            fullName: isAdmin ? 'System Administrator' : 'Tanvir Hossain',
            phone: '+880 1711-000000',
            role: isAdmin ? 'admin' : 'household_user',
          },
          households: await this.getHouseholdsForUser(isAdmin ? 'usr_admin' : 'usr_dhaka_01'),
        };
      }

      throw new Error(
        'Supabase database is currently in simulation mode because your credentials (SUPABASE_URL, SUPABASE_ANON_KEY) are not detected in the environment. Please configure your environment variables or click "Gulshan Resident" below for one-click demo access.'
      );
    }

    const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
      email: params.email,
      password: params.password,
    });

    if (authErr) {
      if (authErr.message?.toLowerCase().includes('email not confirmed')) {
        throw new Error('Email not confirmed in Supabase. Please verify your email or disable "Confirm email" in Supabase Dashboard (Authentication > Providers > Email).');
      }
      if (authErr.message?.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Invalid email or password. Please verify your credentials or register a new account.');
      }
      throw authErr;
    }

    const user = authData.user;
    if (!user) throw new Error('Sign in failed. No user found.');

    const dbClient = this.serviceClient || this.client!;

    // Fetch or create profile safely
    let profile: any = null;
    try {
      const { data: pData } = await dbClient.from('profiles').select('*').eq('id', user.id).maybeSingle();
      profile = pData;
      if (!profile) {
        const { data: newP } = await dbClient.from('profiles').upsert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || 'KilowattIQ Consumer',
          role: 'household_user',
          updated_at: new Date().toISOString(),
        }).select().maybeSingle();
        profile = newP;
      }
    } catch (pErr: any) {
      console.warn('[SupabaseService] Profile fetch/upsert warning:', pErr?.message);
    }

    // Ensure household membership exists safely
    try {
      await this.ensureHouseholdMembership(user.id);
    } catch (hErr: any) {
      console.warn('[SupabaseService] Household membership warning:', hErr?.message);
    }

    let households: Household[] = [];
    try {
      households = await this.getHouseholdsForUser(user.id);
    } catch (hhErr: any) {
      console.warn('[SupabaseService] getHouseholdsForUser warning:', hhErr?.message);
      households = [{
        id: DEMO_HOUSEHOLD_UUID,
        userId: user.id,
        name: 'Gulshan Residence - Flat 4B',
        utilityProvider: 'DESCO',
        accountNumber: '8820-9941-01',
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: 'Dhaka', city: 'Dhaka', area: 'Gulshan 2' },
        createdAt: new Date().toISOString(),
      }];
    }

    return {
      token: authData.session?.access_token || 'supabase-session-token',
      session: authData.session,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name || 'KilowattIQ Consumer',
        phone: profile?.phone || '',
        role: profile?.role || 'household_user',
      },
      households,
    };
  }

  public async verifyToken(token: string): Promise<{ user: any; profile: any; householdIds: string[] } | null> {
    const authClient = this.anonClient || this.client || this.serviceClient;
    if (!authClient) return null;

    try {
      const { data: { user }, error } = await authClient.auth.getUser(token);
      if (error || !user) return null;

      const dbClient = this.serviceClient || authClient;
      const { data: profile } = await dbClient.from('profiles').select('*').eq('id', user.id).single();
      const households = await this.getHouseholdsForUser(user.id);
      const householdIds = households.map(h => h.id);

      return {
        user,
        profile: profile || {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || 'KilowattIQ Consumer',
          role: 'household_user',
        },
        householdIds,
      };
    } catch (err) {
      console.error('[SupabaseService] Token verification error:', err);
      return null;
    }
  }

  public async ensureHouseholdMembership(userId: string): Promise<void> {
    const dbClient = this.serviceClient || this.client;
    if (!dbClient) return;

    // Check existing household memberships
    const { data: members } = await dbClient.from('household_members').select('*').eq('user_id', userId);
    if (members && members.length > 0) {
      return;
    }

    // Check if DEMO_HOUSEHOLD_UUID exists in households
    const { data: existingHh } = await dbClient.from('households').select('id').eq('id', DEMO_HOUSEHOLD_UUID).maybeSingle();

    let targetHouseholdId = DEMO_HOUSEHOLD_UUID;

    if (!existingHh) {
      const { data: newHh, error: hErr } = await dbClient.from('households').upsert({
        id: DEMO_HOUSEHOLD_UUID,
        name: 'Gulshan Residence - Flat 4B',
        utility_provider: 'DESCO',
        account_number: '8820-9941-01',
        sanctioned_load_kw: 5.5,
        address_street: 'Road 11, House 45',
        address_city: 'Dhaka',
        address_area: 'Gulshan 2',
      }).select().maybeSingle();

      if (hErr) {
        console.error('[SupabaseService] Default household creation warning:', hErr.message);
        const { data: customHh } = await dbClient.from('households').insert({
          name: 'Primary Household',
          utility_provider: 'DESCO',
          account_number: '8820-9941-01',
          sanctioned_load_kw: 5.5,
          address_city: 'Dhaka',
          address_area: 'Dhaka',
        }).select().maybeSingle();

        if (customHh) {
          targetHouseholdId = customHh.id;
        }
      }
    }

    const { error: mErr } = await dbClient.from('household_members').upsert({
      household_id: targetHouseholdId,
      user_id: userId,
      role: 'owner',
    });
    if (mErr) {
      console.error('[SupabaseService] Household member link error:', mErr.message);
    }
  }

  public async getHouseholdsForUser(userId: string): Promise<Household[]> {
    const dbClient = this.serviceClient || this.client;
    if (!dbClient || this.isMockMode) {
      return [{
        id: DEMO_HOUSEHOLD_UUID,
        userId,
        name: 'Gulshan Residence - Flat 4B',
        utilityProvider: 'DESCO',
        accountNumber: '8820-9941-01',
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: 'Dhaka', city: 'Dhaka', area: 'Gulshan 2' },
        createdAt: new Date().toISOString(),
      }];
    }

    const { data: members, error: mErr } = await dbClient.from('household_members').select('household_id').eq('user_id', userId);
    if (mErr) {
      console.error('[SupabaseService] getHouseholdsForUser member query error:', mErr.message);
    }

    let hIds = (members || []).map(m => m.household_id);
    if (hIds.length === 0) {
      hIds = [DEMO_HOUSEHOLD_UUID];
    }

    const { data: households, error: hErr } = await dbClient.from('households').select('*').in('id', hIds);
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
      } else if (data) {
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
    return [{
      id: DEMO_HOUSEHOLD_UUID,
      userId: userId || 'usr_dhaka_01',
      name: 'Gulshan Residence - Flat 4B',
      utilityProvider: 'DESCO',
      accountNumber: '8820-9941-01',
      sanctionedLoadKw: 5.5,
      monthlyBudgetBDT: 4500,
      address: { division: 'Dhaka', city: 'Dhaka', area: 'Gulshan 2' },
      createdAt: new Date().toISOString(),
    }];
  }

  async getHouseholdById(id: string): Promise<Household | null> {
    const targetId = this.resolveHouseholdId(id);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('households').select('*').eq('id', targetId).single();
      if (error) {
        console.error('[SupabaseService ERROR] getHouseholdById:', error.message);
      } else if (data) {
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
    return {
      id: DEMO_HOUSEHOLD_UUID,
      userId: 'usr_dhaka_01',
      name: 'Gulshan Residence - Flat 4B',
      utilityProvider: 'DESCO',
      accountNumber: '8820-9941-01',
      sanctionedLoadKw: 5.5,
      monthlyBudgetBDT: 4500,
      address: { division: 'Dhaka', city: 'Dhaka', area: 'Gulshan 2' },
      createdAt: new Date().toISOString(),
    };
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
      } else if (data && data.length > 0) {
        return data.map(row => ({
          id: row.id,
          householdId: row.household_id,
          name: row.name,
          floorLevel: row.floor_level || 4,
          icon: row.icon || 'sofa',
        }));
      }
    }
    return [
      { id: '22222222-2222-4222-a222-222222222201', householdId: targetHhId, name: 'Living Room', floorLevel: 4, icon: 'sofa' },
      { id: '22222222-2222-4222-a222-222222222202', householdId: targetHhId, name: 'Master Bedroom', floorLevel: 4, icon: 'bed' },
      { id: '22222222-2222-4222-a222-222222222203', householdId: targetHhId, name: 'Dining Room & Kitchen', floorLevel: 4, icon: 'utensils' },
    ];
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
      } else if (data && data.length > 0) {
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
    return [
      { id: '33333333-3333-4333-a333-333333333301', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222203', name: 'Frost Double Door Fridge', category: 'REFRIGERATOR', ratedPowerW: 180, standbyPowerW: 18, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 68000 },
      { id: '33333333-3333-4333-a333-333333333302', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222202', name: 'Master Bedroom 1.5T AC', category: 'AIR_CONDITIONER', ratedPowerW: 1650, standbyPowerW: 8, averageHoursPerDay: 7, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 62000 },
      { id: '33333333-3333-4333-a333-333333333303', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222202', name: 'Smart Fast Geyser 30L', category: 'WATER_HEATER', ratedPowerW: 2000, standbyPowerW: 0, averageHoursPerDay: 1.5, isInverterType: false, energyRatingStars: 4, isVampireRisk: false, purchasePriceBDT: 18500 },
      { id: '33333333-3333-4333-a333-333333333304', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222201', name: 'Living Room Smart TV 55"', category: 'TELEVISION', ratedPowerW: 120, standbyPowerW: 12, averageHoursPerDay: 5, isInverterType: false, energyRatingStars: 4, isVampireRisk: true, purchasePriceBDT: 54000 },
      { id: '33333333-3333-4333-a333-333333333305', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222202', name: 'Master Bed BLDC Ceiling Fan', category: 'FAN', ratedPowerW: 30, standbyPowerW: 1, averageHoursPerDay: 10, isInverterType: true, energyRatingStars: 5, isVampireRisk: false, purchasePriceBDT: 4800 },
      { id: '33333333-3333-4333-a333-333333333306', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222203', name: 'Front Load Washing Machine', category: 'WASHING_MACHINE', ratedPowerW: 1200, standbyPowerW: 5, averageHoursPerDay: 1, isInverterType: false, energyRatingStars: 4, isVampireRisk: true, purchasePriceBDT: 42000 },
      { id: '33333333-3333-4333-a333-333333333307', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222203', name: 'Digital Solo Microwave 23L', category: 'MICROWAVE', ratedPowerW: 900, standbyPowerW: 6, averageHoursPerDay: 0.5, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 12500 },
      { id: '33333333-3333-4333-a333-333333333308', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222201', name: 'Fiber Dual-Band Wi-Fi Router', category: 'ROUTER', ratedPowerW: 12, standbyPowerW: 12, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 5, isVampireRisk: true, purchasePriceBDT: 3200 },
      { id: '33333333-3333-4333-a333-333333333309', householdId: targetHhId, roomId: 'unassigned', name: 'Whole-House Service Entry', category: 'OTHER', ratedPowerW: 5500, standbyPowerW: 0, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 5, isVampireRisk: false, purchasePriceBDT: 0 },
    ];
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
      } else if (data && data.length > 0) {
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
    return [
      { id: '44444444-4444-4444-a444-444444444401', householdId: targetHhId, roomId: null, applianceId: '33333333-3333-4333-a333-333333333309', name: 'DESCO Smart AMI Service Meter', deviceType: 'SMART_METER', adapterType: 'DESCOAdapter', macOrSerial: 'DESCO-AMI-908123', mqttTopic: 'desco/ami/8820994101', isOnline: true, lastSeen: new Date().toISOString(), config: { sanctionedLoadKw: 5.5, accountNo: '8820-9941-01' } },
      { id: '44444444-4444-4444-a444-444444444402', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222202', applianceId: '33333333-3333-4333-a333-333333333302', name: 'Master AC Tuya Smart Plug', deviceType: 'SMART_PLUG', adapterType: 'TuyaAdapter', macOrSerial: 'TUYA-AC-88127', mqttTopic: 'tuya/plug/ac01', isOnline: true, lastSeen: new Date().toISOString(), config: { ratedWatts: 1650, cutoffTemp: 25 } },
      { id: '44444444-4444-4444-a444-444444444403', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222201', applianceId: '33333333-3333-4333-a333-333333333304', name: 'Distribution Box ESP32 PZEM', deviceType: 'ESP32_PZEM', adapterType: 'MQTTAdapter', macOrSerial: 'ESP32-PZEM-9021', mqttTopic: 'kilowattiq/gulshan/pzem', isOnline: true, lastSeen: new Date().toISOString(), config: { frequencyHz: 50.0 } },
      { id: '44444444-4444-4444-a444-444444444404', householdId: targetHhId, roomId: '22222222-2222-4222-a222-222222222201', applianceId: '33333333-3333-4333-a333-333333333308', name: 'Wi-Fi Router Smart Plug', deviceType: 'SMART_PLUG', adapterType: 'MockAdapter', macOrSerial: 'MOCK-PLUG-1001', mqttTopic: 'mock/plug/router', isOnline: true, lastSeen: new Date().toISOString(), config: { standbyKill: true } },
    ];
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
    return {
      id: '55555555-5555-4555-a555-555555555501',
      household_id: targetHhId,
      utility_provider: 'DESCO',
      tariff_type: 'tiered',
      tariff_code: 'DESCO_LT_A_2024',
      effective_date: '2024-03-01',
      vat_percentage: 5.0,
      demand_charge_per_kw_bdt: 42.0,
      meter_rent_bdt: 40.0,
      is_system_global: true,
      rules: [
        { id: '66666661-1111-4111-a111-111111111111', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 1, step_name: 'Life Line (0-50 kWh)', slab_min_kwh: 0, slab_max_kwh: 50, rate_bdt_per_kwh: 4.63 },
        { id: '66666662-2222-4222-a222-222222222222', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 2, step_name: 'First Step (51-75 kWh)', slab_min_kwh: 51, slab_max_kwh: 75, rate_bdt_per_kwh: 5.26 },
        { id: '66666663-3333-4333-a333-333333333333', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 3, step_name: 'Second Step (76-200 kWh)', slab_min_kwh: 76, slab_max_kwh: 200, rate_bdt_per_kwh: 7.20 },
        { id: '66666664-4444-4444-a444-444444444444', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 4, step_name: 'Third Step (201-300 kWh)', slab_min_kwh: 201, slab_max_kwh: 300, rate_bdt_per_kwh: 7.59 },
        { id: '66666665-5555-4555-a555-555555555555', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 5, step_name: 'Fourth Step (301-400 kWh)', slab_min_kwh: 301, slab_max_kwh: 400, rate_bdt_per_kwh: 8.02 },
        { id: '66666666-6666-4666-a666-666666666666', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 6, step_name: 'Fifth Step (401-600 kWh)', slab_min_kwh: 401, slab_max_kwh: 600, rate_bdt_per_kwh: 12.67 },
        { id: '66666667-7777-4777-a777-777777777777', tariff_id: '55555555-5555-4555-a555-555555555501', step_number: 7, step_name: 'Sixth Step (>600 kWh)', slab_min_kwh: 601, slab_max_kwh: null, rate_bdt_per_kwh: 14.61 }
      ]
    };
  }

  // Budgets & History
  async getBudgets(householdId: string): Promise<any> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data: budget } = await this.client.from('budgets').select('*').eq('household_id', targetHhId).order('created_at', { ascending: false }).limit(1).single();
      const { data: history } = await this.client.from('budget_history').select('*').eq('household_id', targetHhId).order('month', { ascending: true });
      if (budget || (history && history.length > 0)) {
        return { currentBudget: budget, history: history || [] };
      }
    }
    return {
      currentBudget: {
        id: '77777777-7777-4777-a777-777777777777',
        household_id: targetHhId,
        target_monthly_bdt: 4500.0,
        target_monthly_kwh: 380.0,
        alert_threshold_percent: 80,
        month: 8,
        year: 2026
      },
      history: [
        { id: '88888881-1111-4111-a111-111111111111', household_id: targetHhId, month: 6, year: 2026, target_bdt: 4500.0, actual_spend_bdt: 4120.0, projected_spend_bdt: 4120.0, overage_bdt: 0.0 },
        { id: '88888882-2222-4222-a222-222222222222', household_id: targetHhId, month: 7, year: 2026, target_bdt: 4500.0, actual_spend_bdt: 4320.0, projected_spend_bdt: 4320.0, overage_bdt: 0.0 },
        { id: '88888883-3333-4333-a333-333333333333', household_id: targetHhId, month: 8, year: 2026, target_bdt: 4500.0, actual_spend_bdt: 2150.0, projected_spend_bdt: 4400.0, overage_bdt: 0.0 }
      ]
    };
  }

  // Suggestions / Recommendations
  async getSuggestions(householdId: string): Promise<any[]> {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from('suggestions').select('*').eq('household_id', targetHhId);
      if (error) {
        console.error('[SupabaseService ERROR] getSuggestions:', error.message);
      } else if (data && data.length > 0) {
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
    return [
      {
        id: '99999991-1111-4111-a111-111111111111',
        householdId: targetHhId,
        applianceId: '33333333-3333-4333-a333-333333333302',
        title: 'Upgrade Master Bedroom 1.5T Non-Inverter AC to 5-Star Inverter',
        type: 'roi',
        severity: 'high',
        status: 'new',
        description: 'Your 1.5T non-inverter AC runs 7 hours daily consuming ~1,650W continuously. An inverter AC reduces power draw by up to 42% under Dhaka summer temperatures.',
        estimatedMonthlySavingsBDT: 1450.0,
        actionableStep: 'Consider replacing the non-inverter AC unit. Payback period is estimated at 1.8 years at current DESCO Step 5 rates.',
        createdAt: new Date().toISOString(),
      },
      {
        id: '99999992-2222-4222-a222-222222222222',
        householdId: targetHhId,
        applianceId: '33333333-3333-4333-a333-333333333304',
        title: 'Eliminate Phantom Standby Power from Smart TV & TV Box',
        type: 'standby',
        severity: 'medium',
        status: 'new',
        description: 'Living Room Smart TV and set-top box draw 12W standby power continuously when off, wasting ~8.6 kWh monthly.',
        estimatedMonthlySavingsBDT: 240.0,
        actionableStep: 'Use the connected Wi-Fi smart plug to cut off standby power automatically between 12:00 AM and 6:00 AM.',
        createdAt: new Date().toISOString(),
      }
    ];
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
