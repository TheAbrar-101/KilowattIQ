// backend/app.ts
import express from "express";

// backend/middleware/logger.ts
function requestLogger(req, res, next) {
  const startTime = Date.now();
  const { method, originalUrl } = req;
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.log(`[KilowattIQ API] ${method} ${originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
}

// backend/middleware/errorHandler.ts
function errorHandler(err, req, res, next) {
  console.error("[API Error]", err);
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(statusCode).json({
    status: "error",
    statusCode,
    message,
    details: err.details || null,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
}

// backend/services/SupabaseService.ts
import { createClient } from "@supabase/supabase-js";
var DEMO_HOUSEHOLD_UUID = "11111111-1111-4111-a111-111111111111";
var SupabaseService = class _SupabaseService {
  constructor() {
    this.serviceClient = null;
    this.anonClient = null;
    this.client = null;
    this.isMockMode = false;
    this.configError = null;
    this.applianceStates = /* @__PURE__ */ new Map([
      ["33333333-3333-4333-a333-333333333301", true],
      ["33333333-3333-4333-a333-333333333302", true],
      ["33333333-3333-4333-a333-333333333303", false],
      ["33333333-3333-4333-a333-333333333304", true],
      ["33333333-3333-4333-a333-333333333305", true],
      ["33333333-3333-4333-a333-333333333306", false],
      ["33333333-3333-4333-a333-333333333307", false],
      ["33333333-3333-4333-a333-333333333308", true],
      ["33333333-3333-4333-a333-333333333309", true]
    ]);
    this.deviceStates = /* @__PURE__ */ new Map();
    const rawUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const rawAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    const useMockEnv = process.env.USE_MOCK_DATA === "true";
    const url = rawUrl?.trim().replace(/^["']|["']$/g, "");
    const serviceKey = rawServiceKey?.trim().replace(/^["']|["']$/g, "");
    const anonKey = rawAnonKey?.trim().replace(/^["']|["']$/g, "");
    const hasValidServiceKey = Boolean(
      serviceKey && serviceKey.length > 10 && !serviceKey.includes("your-service-role-key")
    );
    const hasValidAnonKey = Boolean(
      anonKey && anonKey.length > 10 && !anonKey.includes("your-anon-key")
    );
    const hasValidKey = hasValidServiceKey || hasValidAnonKey;
    let formattedUrl = "";
    if (url && url.length > 3 && !url.includes("your-supabase-project")) {
      let candidate = url.trim();
      if (/^[a-z0-9]{20}$/i.test(candidate)) {
        formattedUrl = `https://${candidate}.supabase.co`;
      } else if (candidate.includes("/project/")) {
        const ref = candidate.split("/project/")[1].split("/")[0].split("?")[0];
        formattedUrl = `https://${ref}.supabase.co`;
      } else {
        if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
          candidate = `https://${candidate}`;
        }
        try {
          const parsed = new URL(candidate);
          formattedUrl = `${parsed.protocol}//${parsed.host}`;
        } catch {
          const match = candidate.match(/([a-z0-9_-]+\.supabase\.co)/i);
          if (match && match[1]) {
            formattedUrl = `https://${match[1]}`;
          } else {
            formattedUrl = candidate.replace(/\/+$/, "");
          }
        }
      }
    }
    const hasValidUrl = Boolean(formattedUrl && formattedUrl.includes(".supabase.co"));
    if (!hasValidUrl || !hasValidKey || useMockEnv) {
      console.warn("[SupabaseService] Operating in MOCK mode with in-memory dataset.");
      this.isMockMode = true;
    } else {
      try {
        if (hasValidServiceKey) {
          this.serviceClient = createClient(formattedUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          });
        }
        if (hasValidAnonKey) {
          this.anonClient = createClient(formattedUrl, anonKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          });
        }
        this.client = this.serviceClient || this.anonClient || createClient(formattedUrl, serviceKey || anonKey, {
          auth: { autoRefreshToken: false, persistSession: false }
        });
        if (!this.anonClient) {
          this.anonClient = this.client;
        }
        this.isMockMode = false;
        console.log(`[SupabaseService] Initialized live Supabase client successfully (${formattedUrl}).`);
      } catch (err) {
        console.warn(`[SupabaseService] Client init failed (${err?.message}). Operating in MOCK mode.`);
        this.isMockMode = true;
      }
    }
  }
  isApplianceOn(applianceId) {
    if (this.applianceStates.has(applianceId)) {
      return this.applianceStates.get(applianceId);
    }
    return true;
  }
  setApplianceState(applianceId, isOn) {
    this.applianceStates.set(applianceId, isOn);
  }
  async toggleAppliance(applianceId, targetState) {
    const currentState = this.isApplianceOn(applianceId);
    const newState = targetState !== void 0 ? targetState : !currentState;
    this.applianceStates.set(applianceId, newState);
    const devices = await this.getDevices(DEMO_HOUSEHOLD_UUID);
    const connectedDev = devices.find((d) => d.applianceId === applianceId);
    if (connectedDev) {
      this.deviceStates.set(connectedDev.id, newState);
    }
    return { applianceId, isOn: newState };
  }
  isDeviceOn(deviceId) {
    if (this.deviceStates.has(deviceId)) {
      return this.deviceStates.get(deviceId);
    }
    return true;
  }
  async toggleDevice(deviceId, targetState) {
    const currentState = this.isDeviceOn(deviceId);
    const newState = targetState !== void 0 ? targetState : !currentState;
    this.deviceStates.set(deviceId, newState);
    const devices = await this.getDevices(DEMO_HOUSEHOLD_UUID);
    const dev = devices.find((d) => d.id === deviceId);
    if (dev && dev.applianceId) {
      this.applianceStates.set(dev.applianceId, newState);
    }
    return { deviceId, isOn: newState };
  }
  static getInstance() {
    if (!_SupabaseService.instance) {
      _SupabaseService.instance = new _SupabaseService();
    }
    return _SupabaseService.instance;
  }
  getClient() {
    return this.client;
  }
  getServiceClient() {
    return this.serviceClient;
  }
  getAnonClient() {
    return this.anonClient;
  }
  isUsingMock() {
    return this.isMockMode;
  }
  resolveHouseholdId(id) {
    if (!id || id === "hh_gulshan_01" || id === "default") {
      return DEMO_HOUSEHOLD_UUID;
    }
    return id;
  }
  async testDatabaseConnection() {
    if (this.configError) {
      return { success: false, databaseStatus: "disconnected", error: this.configError };
    }
    if (this.isMockMode || !this.client) {
      return { success: false, databaseStatus: "disconnected", error: "Running in mock mode." };
    }
    try {
      const dbClient = this.serviceClient || this.client;
      const { data, error } = await dbClient.from("households").select("id").limit(1);
      if (!error) {
        return { success: true, databaseStatus: "connected", details: { householdFound: data?.length } };
      }
      return { success: false, databaseStatus: "disconnected", error: error.message };
    } catch (err) {
      return { success: false, databaseStatus: "disconnected", error: err?.message || String(err) };
    }
  }
  // --- AUTHENTICATION & PROFILE SERVICES ---
  async signUpUser(params) {
    if (this.isMockMode || !this.client && !this.serviceClient && !this.anonClient) {
      console.log("[SupabaseService] Mock registration for user:", params.email);
      return {
        session: null,
        requiresEmailConfirmation: false,
        message: "Registration successful in simulation mode.",
        user: {
          id: `usr_${Date.now()}`,
          email: params.email,
          fullName: params.fullName || "KilowattIQ Consumer",
          phone: params.phone || "",
          role: "household_user"
        },
        households: await this.getHouseholdsForUser("usr_dhaka_01")
      };
    }
    let user = null;
    let session = null;
    let requiresEmailConfirmation = false;
    if (this.serviceClient) {
      try {
        const { data: adminData, error: adminErr } = await this.serviceClient.auth.admin.createUser({
          email: params.email,
          password: params.password,
          email_confirm: true,
          user_metadata: { full_name: params.fullName, phone: params.phone || "" }
        });
        if (!adminErr && adminData.user) {
          user = adminData.user;
        } else if (adminErr) {
          if (adminErr.message?.toLowerCase().includes("already registered") || adminErr.message?.toLowerCase().includes("already exists")) {
            throw new Error("User with this email is already registered. Please sign in instead.");
          }
          console.warn("[SupabaseService] Admin createUser warning:", adminErr.message);
        }
      } catch (e) {
        if (e.message?.includes("already registered") || e.message?.includes("already exists")) {
          throw e;
        }
        console.warn("[SupabaseService] Admin createUser fallback:", e?.message || e);
      }
    }
    if (!user) {
      const publicClient = this.anonClient || this.client;
      const { data: authData, error: authErr } = await publicClient.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            phone: params.phone || ""
          }
        }
      });
      if (authErr) {
        if (authErr.message?.toLowerCase().includes("already registered")) {
          throw new Error("User with this email is already registered. Please sign in instead.");
        }
        throw authErr;
      }
      user = authData.user;
      session = authData.session;
    }
    if (!user) {
      throw new Error("User creation failed. Please try again.");
    }
    try {
      const dbClient = this.serviceClient || this.client;
      const profileObj = {
        id: user.id,
        email: user.email,
        full_name: params.fullName,
        phone: params.phone || null,
        role: "household_user",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      await dbClient.from("profiles").upsert(profileObj);
    } catch (pErr) {
      console.warn("[SupabaseService] Non-fatal profile creation warning:", pErr?.message);
    }
    try {
      await this.ensureHouseholdMembership(user.id);
    } catch (hErr) {
      console.warn("[SupabaseService] Non-fatal household membership warning:", hErr?.message);
    }
    if (!session) {
      const authClient = this.anonClient || this.client;
      try {
        const { data: signInData, error: signInErr } = await authClient.auth.signInWithPassword({
          email: params.email,
          password: params.password
        });
        if (!signInErr && signInData?.session) {
          session = signInData.session;
        } else if (signInErr) {
          if (signInErr.message?.toLowerCase().includes("email not confirmed")) {
            requiresEmailConfirmation = true;
          }
        }
      } catch (sErr) {
        console.warn("[SupabaseService] Post-signup sign-in warning:", sErr?.message);
      }
    }
    let households = [];
    try {
      households = await this.getHouseholdsForUser(user.id);
    } catch (hhErr) {
      households = [{
        id: DEMO_HOUSEHOLD_UUID,
        userId: user.id,
        name: "Gulshan Residence - Flat 4B",
        utilityProvider: "DESCO",
        accountNumber: "8820-9941-01",
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: "Dhaka", city: "Dhaka", area: "Gulshan 2" },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }];
    }
    return {
      session,
      requiresEmailConfirmation,
      message: requiresEmailConfirmation ? "Registration successful! Email confirmation is enabled on your Supabase project. Please check your inbox to confirm before logging in." : "Registration successful.",
      user: {
        id: user.id,
        email: user.email,
        fullName: params.fullName,
        phone: params.phone || "",
        role: "household_user"
      },
      households
    };
  }
  async signInUser(params) {
    const authClient = this.anonClient || this.client;
    if (!authClient || this.isMockMode) {
      const emailLower = params.email.toLowerCase();
      const isDemoUser = emailLower.includes("demo") || emailLower.includes("tanvir") || emailLower.includes("admin") || emailLower === "shahrearabrar101@gmail.com" || params.password === "demo123" || params.password === "admin123";
      if (isDemoUser) {
        const isAdmin = emailLower.includes("admin");
        return {
          token: isAdmin ? "admin-jwt-token" : "demo-jwt-token",
          session: null,
          user: {
            id: isAdmin ? "usr_admin" : "usr_dhaka_01",
            email: params.email,
            fullName: isAdmin ? "System Administrator" : "Tanvir Hossain",
            phone: "+880 1711-000000",
            role: isAdmin ? "admin" : "household_user"
          },
          households: await this.getHouseholdsForUser(isAdmin ? "usr_admin" : "usr_dhaka_01")
        };
      }
      throw new Error(
        'Supabase database is currently in simulation mode because your credentials (SUPABASE_URL, SUPABASE_ANON_KEY) are not detected in the environment. Please configure your environment variables or click "Gulshan Resident" below for one-click demo access.'
      );
    }
    const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
      email: params.email,
      password: params.password
    });
    if (authErr) {
      const errMsg = authErr.message?.toLowerCase() || "";
      if (errMsg.includes("invalid path")) {
        throw new Error(
          'Supabase URL contained an extra subpath (such as /rest/v1). KilowattIQ has normalized this to "https://<ref>.supabase.co". Please verify that SUPABASE_URL in your hosting environment is set to "https://<your-project-ref>.supabase.co" without any trailing path.'
        );
      }
      if (errMsg.includes("email not confirmed")) {
        throw new Error('Email not confirmed in Supabase. Please verify your email or disable "Confirm email" in Supabase Dashboard (Authentication > Providers > Email).');
      }
      if (errMsg.includes("invalid login credentials")) {
        throw new Error('Invalid email or password. If this is a new Supabase database, please click "Register Household" above to create your account first, or use the demo buttons below.');
      }
      throw authErr;
    }
    const user = authData.user;
    if (!user) throw new Error("Sign in failed. No user found.");
    const dbClient = this.serviceClient || this.client;
    let profile = null;
    try {
      const { data: pData } = await dbClient.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = pData;
      if (!profile) {
        const { data: newP } = await dbClient.from("profiles").upsert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "KilowattIQ Consumer",
          role: "household_user",
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }).select().maybeSingle();
        profile = newP;
      }
    } catch (pErr) {
      console.warn("[SupabaseService] Profile fetch/upsert warning:", pErr?.message);
    }
    try {
      await this.ensureHouseholdMembership(user.id);
    } catch (hErr) {
      console.warn("[SupabaseService] Household membership warning:", hErr?.message);
    }
    let households = [];
    try {
      households = await this.getHouseholdsForUser(user.id);
    } catch (hhErr) {
      console.warn("[SupabaseService] getHouseholdsForUser warning:", hhErr?.message);
      households = [{
        id: DEMO_HOUSEHOLD_UUID,
        userId: user.id,
        name: "Gulshan Residence - Flat 4B",
        utilityProvider: "DESCO",
        accountNumber: "8820-9941-01",
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: "Dhaka", city: "Dhaka", area: "Gulshan 2" },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }];
    }
    return {
      token: authData.session?.access_token || "supabase-session-token",
      session: authData.session,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.full_name || user.user_metadata?.full_name || "KilowattIQ Consumer",
        phone: profile?.phone || "",
        role: profile?.role || "household_user"
      },
      households
    };
  }
  async verifyToken(token) {
    const authClient = this.anonClient || this.client || this.serviceClient;
    if (!authClient) return null;
    try {
      const { data: { user }, error } = await authClient.auth.getUser(token);
      if (error || !user) return null;
      const dbClient = this.serviceClient || authClient;
      const { data: profile } = await dbClient.from("profiles").select("*").eq("id", user.id).single();
      const households = await this.getHouseholdsForUser(user.id);
      const householdIds = households.map((h) => h.id);
      return {
        user,
        profile: profile || {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || "KilowattIQ Consumer",
          role: "household_user"
        },
        householdIds
      };
    } catch (err) {
      console.error("[SupabaseService] Token verification error:", err);
      return null;
    }
  }
  async ensureHouseholdMembership(userId) {
    const dbClient = this.serviceClient || this.client;
    if (!dbClient) return;
    const { data: members } = await dbClient.from("household_members").select("*").eq("user_id", userId);
    if (members && members.length > 0) {
      return;
    }
    const { data: existingHh } = await dbClient.from("households").select("id").eq("id", DEMO_HOUSEHOLD_UUID).maybeSingle();
    let targetHouseholdId = DEMO_HOUSEHOLD_UUID;
    if (!existingHh) {
      const { data: newHh, error: hErr } = await dbClient.from("households").upsert({
        id: DEMO_HOUSEHOLD_UUID,
        name: "Gulshan Residence - Flat 4B",
        utility_provider: "DESCO",
        account_number: "8820-9941-01",
        sanctioned_load_kw: 5.5,
        address_street: "Road 11, House 45",
        address_city: "Dhaka",
        address_area: "Gulshan 2"
      }).select().maybeSingle();
      if (hErr) {
        console.error("[SupabaseService] Default household creation warning:", hErr.message);
        const { data: customHh } = await dbClient.from("households").insert({
          name: "Primary Household",
          utility_provider: "DESCO",
          account_number: "8820-9941-01",
          sanctioned_load_kw: 5.5,
          address_city: "Dhaka",
          address_area: "Dhaka"
        }).select().maybeSingle();
        if (customHh) {
          targetHouseholdId = customHh.id;
        }
      }
    }
    const { error: mErr } = await dbClient.from("household_members").upsert({
      household_id: targetHouseholdId,
      user_id: userId,
      role: "owner"
    });
    if (mErr) {
      console.error("[SupabaseService] Household member link error:", mErr.message);
    }
  }
  async getHouseholdsForUser(userId) {
    const dbClient = this.serviceClient || this.client;
    if (!dbClient || this.isMockMode) {
      return [{
        id: DEMO_HOUSEHOLD_UUID,
        userId,
        name: "Gulshan Residence - Flat 4B",
        utilityProvider: "DESCO",
        accountNumber: "8820-9941-01",
        sanctionedLoadKw: 5.5,
        monthlyBudgetBDT: 4500,
        address: { division: "Dhaka", city: "Dhaka", area: "Gulshan 2" },
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }];
    }
    const { data: members, error: mErr } = await dbClient.from("household_members").select("household_id").eq("user_id", userId);
    if (mErr) {
      console.error("[SupabaseService] getHouseholdsForUser member query error:", mErr.message);
    }
    let hIds = (members || []).map((m) => m.household_id);
    if (hIds.length === 0) {
      hIds = [DEMO_HOUSEHOLD_UUID];
    }
    const { data: households, error: hErr } = await dbClient.from("households").select("*").in("id", hIds);
    if (hErr) {
      console.error("[SupabaseService] getHouseholdsForUser household query error:", hErr.message);
      return [];
    }
    return (households || []).map((row) => ({
      id: row.id,
      userId,
      name: row.name,
      utilityProvider: row.utility_provider || "DESCO",
      accountNumber: row.account_number || "8820-9941-01",
      sanctionedLoadKw: Number(row.sanctioned_load_kw) || 5.5,
      monthlyBudgetBDT: 4500,
      address: {
        division: "Dhaka",
        city: row.address_city || "Dhaka",
        area: row.address_area || "Gulshan 2"
      },
      createdAt: row.created_at
    }));
  }
  async getProfile(userId) {
    if (!this.client) return null;
    const { data } = await this.client.from("profiles").select("*").eq("id", userId).single();
    return data;
  }
  async updateProfile(userId, updates) {
    if (!this.client) return null;
    const { data, error } = await this.client.from("profiles").update({
      full_name: updates.fullName,
      phone: updates.phone,
      role: updates.role,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", userId).select().single();
    if (error) throw error;
    return data;
  }
  // --- HOUSEHOLDS, ROOMS, APPLIANCES, DEVICES, TELEMETRY ---
  async getHouseholds(userId) {
    if (userId) {
      return this.getHouseholdsForUser(userId);
    }
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("households").select("*");
      if (error) {
        console.error("[SupabaseService ERROR] getHouseholds:", error.message);
      } else if (data) {
        return data.map((row) => ({
          id: row.id,
          userId: userId || "usr_dhaka_01",
          name: row.name,
          utilityProvider: row.utility_provider || "DESCO",
          accountNumber: row.account_number || "8820-9941-01",
          sanctionedLoadKw: Number(row.sanctioned_load_kw) || 5.5,
          monthlyBudgetBDT: 4500,
          address: {
            division: "Dhaka",
            city: row.address_city || "Dhaka",
            area: row.address_area || "Gulshan 2"
          },
          createdAt: row.created_at
        }));
      }
    }
    return [{
      id: DEMO_HOUSEHOLD_UUID,
      userId: userId || "usr_dhaka_01",
      name: "Gulshan Residence - Flat 4B",
      utilityProvider: "DESCO",
      accountNumber: "8820-9941-01",
      sanctionedLoadKw: 5.5,
      monthlyBudgetBDT: 4500,
      address: { division: "Dhaka", city: "Dhaka", area: "Gulshan 2" },
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }];
  }
  async getHouseholdById(id) {
    const targetId = this.resolveHouseholdId(id);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("households").select("*").eq("id", targetId).single();
      if (error) {
        console.error("[SupabaseService ERROR] getHouseholdById:", error.message);
      } else if (data) {
        return {
          id: data.id,
          userId: "usr_dhaka_01",
          name: data.name,
          utilityProvider: data.utility_provider || "DESCO",
          accountNumber: data.account_number || "8820-9941-01",
          sanctionedLoadKw: Number(data.sanctioned_load_kw) || 5.5,
          monthlyBudgetBDT: 4500,
          address: {
            division: "Dhaka",
            city: data.address_city || "Dhaka",
            area: data.address_area || "Gulshan 2"
          },
          createdAt: data.created_at
        };
      }
    }
    return {
      id: DEMO_HOUSEHOLD_UUID,
      userId: "usr_dhaka_01",
      name: "Gulshan Residence - Flat 4B",
      utilityProvider: "DESCO",
      accountNumber: "8820-9941-01",
      sanctionedLoadKw: 5.5,
      monthlyBudgetBDT: 4500,
      address: { division: "Dhaka", city: "Dhaka", area: "Gulshan 2" },
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async createHousehold(household) {
    const id = `hh_${Date.now()}`;
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("households").insert({
        name: household.name,
        utility_provider: household.utilityProvider,
        account_number: household.accountNumber,
        sanctioned_load_kw: household.sanctionedLoadKw,
        address_street: "Road 113, House 24",
        address_city: household.address?.city || "Dhaka",
        address_area: household.address?.area || "Gulshan 2"
      }).select().single();
      if (error) console.error("[SupabaseService ERROR] createHousehold:", error.message);
      if (data) return { ...household, id: data.id, createdAt: data.created_at };
    }
    return { ...household, id, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  // Rooms
  async getRooms(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("rooms").select("*").eq("household_id", targetHhId);
      if (error) {
        console.error("[SupabaseService ERROR] getRooms:", error.message);
      } else if (data && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          householdId: row.household_id,
          name: row.name,
          floorLevel: row.floor_level || 4,
          icon: row.icon || "sofa"
        }));
      }
    }
    return [
      { id: "22222222-2222-4222-a222-222222222201", householdId: targetHhId, name: "Living Room", floorLevel: 4, icon: "sofa" },
      { id: "22222222-2222-4222-a222-222222222202", householdId: targetHhId, name: "Master Bedroom", floorLevel: 4, icon: "bed" },
      { id: "22222222-2222-4222-a222-222222222203", householdId: targetHhId, name: "Dining Room & Kitchen", floorLevel: 4, icon: "utensils" }
    ];
  }
  async createRoom(room) {
    const targetHhId = this.resolveHouseholdId(room.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("rooms").insert({
        household_id: targetHhId,
        name: room.name,
        floor_level: room.floorLevel || 1,
        icon: room.icon || "sofa"
      }).select().single();
      if (error) console.error("[SupabaseService ERROR] createRoom:", error.message);
      if (data) return { id: data.id, householdId: data.household_id, name: data.name, floorLevel: data.floor_level, icon: data.icon };
    }
    return { ...room, id: `rm_${Date.now()}` };
  }
  // Appliances
  async getAppliances(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("appliances").select("*").eq("household_id", targetHhId);
      if (error) {
        console.error("[SupabaseService ERROR] getAppliances:", error.message);
      } else if (data && data.length > 0) {
        return data.map((row) => ({
          id: row.id,
          householdId: row.household_id,
          roomId: row.room_id || "unassigned",
          name: row.name,
          category: row.category,
          ratedPowerW: Number(row.rated_power_w) || 100,
          standbyPowerW: Number(row.standby_power_w) || 0,
          averageHoursPerDay: Number(row.average_hours_per_day) || 6,
          isInverterType: Boolean(row.is_inverter_type),
          energyRatingStars: row.star_rating || 3,
          isVampireRisk: Boolean(row.is_vampire_risk),
          purchasePriceBDT: Number(row.purchase_price_bdt) || 0
        }));
      }
    }
    return [
      { id: "33333333-3333-4333-a333-333333333301", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222203", name: "Frost Double Door Fridge", category: "REFRIGERATOR", ratedPowerW: 180, standbyPowerW: 18, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 68e3 },
      { id: "33333333-3333-4333-a333-333333333302", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222202", name: "Master Bedroom 1.5T AC", category: "AIR_CONDITIONER", ratedPowerW: 1650, standbyPowerW: 8, averageHoursPerDay: 7, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 62e3 },
      { id: "33333333-3333-4333-a333-333333333303", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222202", name: "Smart Fast Geyser 30L", category: "WATER_HEATER", ratedPowerW: 2e3, standbyPowerW: 0, averageHoursPerDay: 1.5, isInverterType: false, energyRatingStars: 4, isVampireRisk: false, purchasePriceBDT: 18500 },
      { id: "33333333-3333-4333-a333-333333333304", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222201", name: 'Living Room Smart TV 55"', category: "TELEVISION", ratedPowerW: 120, standbyPowerW: 12, averageHoursPerDay: 5, isInverterType: false, energyRatingStars: 4, isVampireRisk: true, purchasePriceBDT: 54e3 },
      { id: "33333333-3333-4333-a333-333333333305", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222202", name: "Master Bed BLDC Ceiling Fan", category: "FAN", ratedPowerW: 30, standbyPowerW: 1, averageHoursPerDay: 10, isInverterType: true, energyRatingStars: 5, isVampireRisk: false, purchasePriceBDT: 4800 },
      { id: "33333333-3333-4333-a333-333333333306", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222203", name: "Front Load Washing Machine", category: "WASHING_MACHINE", ratedPowerW: 1200, standbyPowerW: 5, averageHoursPerDay: 1, isInverterType: false, energyRatingStars: 4, isVampireRisk: true, purchasePriceBDT: 42e3 },
      { id: "33333333-3333-4333-a333-333333333307", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222203", name: "Digital Solo Microwave 23L", category: "MICROWAVE", ratedPowerW: 900, standbyPowerW: 6, averageHoursPerDay: 0.5, isInverterType: false, energyRatingStars: 3, isVampireRisk: true, purchasePriceBDT: 12500 },
      { id: "33333333-3333-4333-a333-333333333308", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222201", name: "Fiber Dual-Band Wi-Fi Router", category: "ROUTER", ratedPowerW: 12, standbyPowerW: 12, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 5, isVampireRisk: true, purchasePriceBDT: 3200 },
      { id: "33333333-3333-4333-a333-333333333309", householdId: targetHhId, roomId: "unassigned", name: "Whole-House Service Entry", category: "OTHER", ratedPowerW: 5500, standbyPowerW: 0, averageHoursPerDay: 24, isInverterType: false, energyRatingStars: 5, isVampireRisk: false, purchasePriceBDT: 0 }
    ];
  }
  async createAppliance(appliance) {
    const targetHhId = this.resolveHouseholdId(appliance.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("appliances").insert({
        household_id: targetHhId,
        room_id: appliance.roomId || null,
        name: appliance.name,
        category: appliance.category || "OTHER",
        rated_power_w: appliance.ratedPowerW || 100,
        standby_power_w: appliance.standbyPowerW || 0,
        average_hours_per_day: appliance.averageHoursPerDay || 6,
        is_inverter_type: appliance.isInverterType || false,
        star_rating: appliance.energyRatingStars || 3,
        is_vampire_risk: appliance.isVampireRisk || false,
        purchase_price_bdt: appliance.purchasePriceBDT || 0
      }).select().single();
      if (error) console.error("[SupabaseService ERROR] createAppliance:", error.message);
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
          purchasePriceBDT: Number(data.purchase_price_bdt)
        };
      }
    }
    return { ...appliance, id: `app_${Date.now()}` };
  }
  // Devices
  async getDevices(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("devices").select("*").eq("household_id", targetHhId);
      if (error) {
        console.error("[SupabaseService ERROR] getDevices:", error.message);
      } else if (data && data.length > 0) {
        return data.map((row) => ({
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
          lastSeen: row.last_seen || row.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
          config: row.config || {}
        }));
      }
    }
    return [
      { id: "44444444-4444-4444-a444-444444444401", householdId: targetHhId, roomId: null, applianceId: "33333333-3333-4333-a333-333333333309", name: "DESCO Smart AMI Service Meter", deviceType: "SMART_METER", adapterType: "DESCOAdapter", macOrSerial: "DESCO-AMI-908123", mqttTopic: "desco/ami/8820994101", isOnline: true, lastSeen: (/* @__PURE__ */ new Date()).toISOString(), config: { sanctionedLoadKw: 5.5, accountNo: "8820-9941-01" } },
      { id: "44444444-4444-4444-a444-444444444402", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222202", applianceId: "33333333-3333-4333-a333-333333333302", name: "Master AC Tuya Smart Plug", deviceType: "SMART_PLUG", adapterType: "TuyaAdapter", macOrSerial: "TUYA-AC-88127", mqttTopic: "tuya/plug/ac01", isOnline: true, lastSeen: (/* @__PURE__ */ new Date()).toISOString(), config: { ratedWatts: 1650, cutoffTemp: 25 } },
      { id: "44444444-4444-4444-a444-444444444403", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222201", applianceId: "33333333-3333-4333-a333-333333333304", name: "Distribution Box ESP32 PZEM", deviceType: "ESP32_PZEM", adapterType: "MQTTAdapter", macOrSerial: "ESP32-PZEM-9021", mqttTopic: "kilowattiq/gulshan/pzem", isOnline: true, lastSeen: (/* @__PURE__ */ new Date()).toISOString(), config: { frequencyHz: 50 } },
      { id: "44444444-4444-4444-a444-444444444404", householdId: targetHhId, roomId: "22222222-2222-4222-a222-222222222201", applianceId: "33333333-3333-4333-a333-333333333308", name: "Wi-Fi Router Smart Plug", deviceType: "SMART_PLUG", adapterType: "MockAdapter", macOrSerial: "MOCK-PLUG-1001", mqttTopic: "mock/plug/router", isOnline: true, lastSeen: (/* @__PURE__ */ new Date()).toISOString(), config: { standbyKill: true } }
    ];
  }
  async createDevice(device) {
    const targetHhId = this.resolveHouseholdId(device.householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("devices").insert({
        household_id: targetHhId,
        room_id: device.roomId || null,
        appliance_id: device.applianceId || null,
        name: device.name,
        device_type: device.deviceType || "SMART_PLUG",
        adapter_type: device.adapterType || "MockAdapter",
        mac_or_serial: device.macOrSerial || `MAC-${Date.now()}`,
        mqtt_topic: device.mqttTopic || null,
        is_online: device.isOnline ?? true,
        config: device.config || {}
      }).select().single();
      if (error) console.error("[SupabaseService ERROR] createDevice:", error.message);
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
          lastSeen: data.last_seen || (/* @__PURE__ */ new Date()).toISOString(),
          config: data.config || {}
        };
      }
    }
    return { ...device, id: `dev_${Date.now()}`, lastSeen: (/* @__PURE__ */ new Date()).toISOString() };
  }
  // Readings / Telemetry
  async getReadings(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("readings").select("*").eq("household_id", targetHhId).order("timestamp", { ascending: false }).limit(50);
      if (error) {
        console.error("[SupabaseService ERROR] getReadings:", error.message);
        return [];
      }
      return data || [];
    }
    return [];
  }
  async insertReading(reading) {
    if (!this.isMockMode && this.client) {
      const { data: existing } = await this.client.from("readings").select("id").eq("device_id", reading.device_id).eq("timestamp", reading.timestamp).maybeSingle();
      if (existing) {
        return true;
      }
      const { error } = await this.client.from("readings").insert({
        device_id: reading.device_id,
        household_id: reading.household_id,
        timestamp: reading.timestamp,
        voltage: reading.voltage,
        current: reading.current,
        power_factor: reading.power_factor,
        active_power: reading.active_power,
        frequency: reading.frequency
      });
      if (error) {
        console.error("[SupabaseService ERROR] insertReading:", error.message);
        return false;
      }
      await this.client.from("devices").update({
        is_online: true,
        last_seen: reading.timestamp
      }).eq("id", reading.device_id);
      return true;
    }
    return false;
  }
  async findDeviceBySerialOrId(deviceIdOrSerial) {
    if (!this.isMockMode && this.client) {
      const { data: devById } = await this.client.from("devices").select("id, household_id").eq("id", deviceIdOrSerial).maybeSingle();
      if (devById) return devById;
      const { data: devBySerial } = await this.client.from("devices").select("id, household_id").or(`mac_or_serial.eq.${deviceIdOrSerial},mqtt_topic.eq.${deviceIdOrSerial}`).limit(1).maybeSingle();
      if (devBySerial) return devBySerial;
      const { data: fallbackDev } = await this.client.from("devices").select("id, household_id").limit(1).maybeSingle();
      if (fallbackDev) return fallbackDev;
    }
    return null;
  }
  async getLatestReadingForDevice(deviceId) {
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("readings").select("*").eq("device_id", deviceId).order("timestamp", { ascending: false }).limit(1).maybeSingle();
      if (error) {
        console.error("[SupabaseService ERROR] getLatestReadingForDevice:", error.message);
        return null;
      }
      return data;
    }
    return null;
  }
  // Tariffs & Rules
  async getTariffs(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data: tariff, error: tErr } = await this.client.from("tariffs").select("*").eq("household_id", targetHhId).single();
      if (tErr && tErr.code !== "PGRST116") {
        console.error("[SupabaseService ERROR] getTariffs:", tErr.message);
      }
      if (tariff) {
        const { data: rules } = await this.client.from("tariff_rate_rules").select("*").eq("tariff_id", tariff.id).order("step_number", { ascending: true });
        return { ...tariff, rules: rules || [] };
      }
    }
    return {
      id: "55555555-5555-4555-a555-555555555501",
      household_id: targetHhId,
      utility_provider: "DESCO",
      tariff_type: "tiered",
      tariff_code: "DESCO_LT_A_2024",
      effective_date: "2024-03-01",
      vat_percentage: 5,
      demand_charge_per_kw_bdt: 42,
      meter_rent_bdt: 40,
      is_system_global: true,
      rules: [
        { id: "66666661-1111-4111-a111-111111111111", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 1, step_name: "Life Line (0-50 kWh)", slab_min_kwh: 0, slab_max_kwh: 50, rate_bdt_per_kwh: 4.63 },
        { id: "66666662-2222-4222-a222-222222222222", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 2, step_name: "First Step (51-75 kWh)", slab_min_kwh: 51, slab_max_kwh: 75, rate_bdt_per_kwh: 5.26 },
        { id: "66666663-3333-4333-a333-333333333333", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 3, step_name: "Second Step (76-200 kWh)", slab_min_kwh: 76, slab_max_kwh: 200, rate_bdt_per_kwh: 7.2 },
        { id: "66666664-4444-4444-a444-444444444444", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 4, step_name: "Third Step (201-300 kWh)", slab_min_kwh: 201, slab_max_kwh: 300, rate_bdt_per_kwh: 7.59 },
        { id: "66666665-5555-4555-a555-555555555555", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 5, step_name: "Fourth Step (301-400 kWh)", slab_min_kwh: 301, slab_max_kwh: 400, rate_bdt_per_kwh: 8.02 },
        { id: "66666666-6666-4666-a666-666666666666", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 6, step_name: "Fifth Step (401-600 kWh)", slab_min_kwh: 401, slab_max_kwh: 600, rate_bdt_per_kwh: 12.67 },
        { id: "66666667-7777-4777-a777-777777777777", tariff_id: "55555555-5555-4555-a555-555555555501", step_number: 7, step_name: "Sixth Step (>600 kWh)", slab_min_kwh: 601, slab_max_kwh: null, rate_bdt_per_kwh: 14.61 }
      ]
    };
  }
  // Budgets & History
  async getBudgets(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data: budget } = await this.client.from("budgets").select("*").eq("household_id", targetHhId).order("created_at", { ascending: false }).limit(1).single();
      const { data: history } = await this.client.from("budget_history").select("*").eq("household_id", targetHhId).order("month", { ascending: true });
      if (budget || history && history.length > 0) {
        return { currentBudget: budget, history: history || [] };
      }
    }
    return {
      currentBudget: {
        id: "77777777-7777-4777-a777-777777777777",
        household_id: targetHhId,
        target_monthly_bdt: 4500,
        target_monthly_kwh: 380,
        alert_threshold_percent: 80,
        month: 8,
        year: 2026
      },
      history: [
        { id: "88888881-1111-4111-a111-111111111111", household_id: targetHhId, month: 6, year: 2026, target_bdt: 4500, actual_spend_bdt: 4120, projected_spend_bdt: 4120, overage_bdt: 0 },
        { id: "88888882-2222-4222-a222-222222222222", household_id: targetHhId, month: 7, year: 2026, target_bdt: 4500, actual_spend_bdt: 4320, projected_spend_bdt: 4320, overage_bdt: 0 },
        { id: "88888883-3333-4333-a333-333333333333", household_id: targetHhId, month: 8, year: 2026, target_bdt: 4500, actual_spend_bdt: 2150, projected_spend_bdt: 4400, overage_bdt: 0 }
      ]
    };
  }
  // Suggestions / Recommendations
  async getSuggestions(householdId) {
    const targetHhId = this.resolveHouseholdId(householdId);
    if (!this.isMockMode && this.client) {
      const { data, error } = await this.client.from("suggestions").select("*").eq("household_id", targetHhId);
      if (error) {
        console.error("[SupabaseService ERROR] getSuggestions:", error.message);
      } else if (data && data.length > 0) {
        return data.map((row) => ({
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
          createdAt: row.created_at
        }));
      }
    }
    return [
      {
        id: "99999991-1111-4111-a111-111111111111",
        householdId: targetHhId,
        applianceId: "33333333-3333-4333-a333-333333333302",
        title: "Upgrade Master Bedroom 1.5T Non-Inverter AC to 5-Star Inverter",
        type: "roi",
        severity: "high",
        status: "new",
        description: "Your 1.5T non-inverter AC runs 7 hours daily consuming ~1,650W continuously. An inverter AC reduces power draw by up to 42% under Dhaka summer temperatures.",
        estimatedMonthlySavingsBDT: 1450,
        actionableStep: "Consider replacing the non-inverter AC unit. Payback period is estimated at 1.8 years at current DESCO Step 5 rates.",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      {
        id: "99999992-2222-4222-a222-222222222222",
        householdId: targetHhId,
        applianceId: "33333333-3333-4333-a333-333333333304",
        title: "Eliminate Phantom Standby Power from Smart TV & TV Box",
        type: "standby",
        severity: "medium",
        status: "new",
        description: "Living Room Smart TV and set-top box draw 12W standby power continuously when off, wasting ~8.6 kWh monthly.",
        estimatedMonthlySavingsBDT: 240,
        actionableStep: "Use the connected Wi-Fi smart plug to cut off standby power automatically between 12:00 AM and 6:00 AM.",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    ];
  }
  async updateSuggestionStatus(id, status) {
    if (!this.isMockMode && this.client) {
      const { error } = await this.client.from("suggestions").update({ status, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
      if (error) {
        console.error("[SupabaseService ERROR] updateSuggestionStatus:", error.message);
        return false;
      }
      return true;
    }
    return true;
  }
};

// backend/middleware/authMiddleware.ts
async function authMiddleware(req, res, next) {
  try {
    const db12 = SupabaseService.getInstance();
    const authHeader = req.headers.authorization || (req.query.token ? `Bearer ${req.query.token}` : void 0) || (req.query.access_token ? `Bearer ${req.query.access_token}` : void 0);
    const path = req.path.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "/api" || !path.startsWith("/api") && !path.startsWith("/v1") && !path.startsWith("/auth") && !path.startsWith("/devices") && !path.startsWith("/telemetry") && !path.startsWith("/analytics") && !path.startsWith("/reports") && !path.startsWith("/admin") && !path.startsWith("/tariffs") && !path.startsWith("/budgets") && !path.startsWith("/profile") && !path.startsWith("/households")) {
      return next();
    }
    const isPublicPath = path === "/" || path === "/api" || path.endsWith("/health") || path.endsWith("/auth/login") || path.endsWith("/auth/register") || path.includes("/system/");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      if (token === "admin-jwt-token") {
        req.user = {
          id: "usr_admin",
          email: "admin@kilowattiq.bd",
          fullName: "System Administrator",
          role: "ADMIN",
          householdIds: ["11111111-1111-4111-a111-111111111111"]
        };
        return next();
      } else if (token === "demo-jwt-token") {
        req.user = {
          id: "usr_dhaka_01",
          email: "demo@kilowattiq.bd",
          fullName: "Tanvir Hossain",
          role: "CONSUMER",
          householdIds: ["11111111-1111-4111-a111-111111111111"]
        };
        return next();
      }
      try {
        const verified = await db12.verifyToken(token);
        if (verified && verified.user) {
          req.user = {
            id: verified.user.id,
            email: verified.user.email,
            fullName: verified.profile?.full_name || "KilowattIQ Consumer",
            phone: verified.profile?.phone || "",
            role: verified.profile?.role || "owner",
            householdIds: verified.householdIds || []
          };
          return next();
        } else {
          return res.status(401).json({
            status: "error",
            message: "Unauthorized: Invalid or expired authentication token"
          });
        }
      } catch (err) {
        return res.status(401).json({
          status: "error",
          message: `Unauthorized: ${err?.message || "Token verification failed"}`
        });
      }
    }
    if (isPublicPath) {
      return next();
    }
    const demoHeader = req.headers["x-demo-mode"];
    if (demoHeader === "true") {
      req.user = {
        id: "usr_dhaka_01",
        email: "demo@kilowattiq.bd",
        fullName: "Tanvir Hossain",
        role: "CONSUMER",
        householdIds: ["11111111-1111-4111-a111-111111111111"]
      };
      return next();
    }
    return res.status(401).json({
      status: "error",
      message: "Authentication required. Please log in or provide a valid Bearer token."
    });
  } catch (fatalErr) {
    console.error("[authMiddleware Fatal Error]:", fatalErr);
    return res.status(500).json({
      status: "error",
      statusCode: 500,
      message: `Authentication middleware error: ${fatalErr?.message || "Unknown error"}`
    });
  }
}

// backend/routes/v1/auth.ts
import { Router } from "express";
var router = Router();
var db = SupabaseService.getInstance();
router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, phone } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({
        status: "error",
        message: "Full Name, Email, and Password are required for registration."
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters long."
      });
    }
    const result = await db.signUpUser({ email, password, fullName, phone });
    if (result.requiresEmailConfirmation || !result.session?.access_token) {
      return res.status(200).json({
        status: "success",
        message: result.message || "Account registered successfully. Please check your email to confirm before logging in.",
        data: {
          requiresEmailConfirmation: true,
          token: null,
          user: result.user,
          households: result.households
        }
      });
    }
    res.status(201).json({
      status: "success",
      message: "Account registered successfully.",
      data: {
        token: result.session.access_token,
        user: result.user,
        households: result.households
      }
    });
  } catch (err) {
    console.error("[Auth Route Error] Register:", err?.message || err);
    res.status(400).json({
      status: "error",
      message: err?.message || "Registration failed. Please check your credentials."
    });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required."
      });
    }
    if (email === "admin@kilowattiq.bd" && password === "admin123") {
      return res.json({
        status: "success",
        data: {
          token: "admin-jwt-token",
          user: {
            id: "usr_admin",
            email: "admin@kilowattiq.bd",
            fullName: "System Administrator",
            role: "ADMIN"
          },
          households: await db.getHouseholdsForUser("usr_admin")
        }
      });
    } else if (email === "demo@kilowattiq.bd" && password === "demo123") {
      return res.json({
        status: "success",
        data: {
          token: "demo-jwt-token",
          user: {
            id: "usr_dhaka_01",
            email: "demo@kilowattiq.bd",
            fullName: "Tanvir Hossain",
            role: "CONSUMER"
          },
          households: await db.getHouseholdsForUser("usr_dhaka_01")
        }
      });
    }
    const result = await db.signInUser({ email, password });
    res.json({
      status: "success",
      message: "Logged in successfully.",
      data: {
        token: result.token,
        user: result.user,
        households: result.households
      }
    });
  } catch (err) {
    console.error("[Auth Route Error] Login:", err?.message || err);
    res.status(401).json({
      status: "error",
      message: err?.message || "Invalid email or password."
    });
  }
});
router.post("/logout", (req, res) => {
  res.json({
    status: "success",
    message: "Logged out successfully."
  });
});
router.get("/me", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Not authenticated" });
  }
  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({
    status: "success",
    data: {
      user: req.user,
      households
    }
  });
});
router.get("/session", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "No active session" });
  }
  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({
    status: "success",
    data: {
      authenticated: true,
      user: req.user,
      households
    }
  });
});
var auth_default = router;

// backend/routes/v1/profile.ts
import { Router as Router2 } from "express";
var router2 = Router2();
var db2 = SupabaseService.getInstance();
router2.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }
  const profile = await db2.getProfile(req.user.id);
  res.json({
    status: "success",
    data: profile || {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.fullName,
      phone: req.user.phone,
      role: req.user.role
    }
  });
});
router2.put("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }
  try {
    const { fullName, phone, role } = req.body;
    const updated = await db2.updateProfile(req.user.id, { fullName, phone, role });
    res.json({
      status: "success",
      message: "Profile updated successfully.",
      data: updated
    });
  } catch (err) {
    res.status(400).json({
      status: "error",
      message: err?.message || "Failed to update profile."
    });
  }
});
var profile_default = router2;

// backend/routes/v1/households.ts
import { Router as Router3 } from "express";
var router3 = Router3();
var db3 = SupabaseService.getInstance();
function isHouseholdAuthorized(req, householdId) {
  if (!req.user) return false;
  if (req.user.role === "ADMIN") return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  if (householdId === "11111111-1111-4111-a111-111111111111") return true;
  return false;
}
router3.get("/my-households", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required" });
  }
  const households = await db3.getHouseholdsForUser(req.user.id);
  res.json({ status: "success", data: households });
});
router3.get("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required" });
  }
  const households = await db3.getHouseholdsForUser(req.user.id);
  res.json({ status: "success", data: households });
});
router3.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({
      status: "error",
      message: "Access denied: You do not have permission to access this household."
    });
  }
  const household = await db3.getHouseholdById(id);
  if (!household) {
    return res.status(404).json({ status: "error", message: "Household not found" });
  }
  res.json({ status: "success", data: household });
});
router3.post("/", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required" });
  }
  const newHousehold = await db3.createHousehold({
    userId: req.user.id,
    name: req.body.name || "New Bangladesh Household",
    utilityProvider: req.body.utilityProvider || "DESCO",
    accountNumber: req.body.accountNumber || "DESCO-0001",
    sanctionedLoadKw: req.body.sanctionedLoadKw || 3,
    monthlyBudgetBDT: req.body.monthlyBudgetBDT || 3500,
    address: req.body.address || { division: "Dhaka", city: "Dhaka", area: "Dhanmondi" }
  });
  res.status(201).json({ status: "success", data: newHousehold });
});
router3.get("/:id/rooms", async (req, res) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household." });
  }
  const rooms = await db3.getRooms(id);
  res.json({ status: "success", data: rooms });
});
router3.post("/:id/rooms", async (req, res) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household." });
  }
  const room = await db3.createRoom({
    householdId: id,
    name: req.body.name,
    floorLevel: req.body.floorLevel || 1,
    icon: req.body.icon || "home"
  });
  res.status(201).json({ status: "success", data: room });
});
router3.get("/:id/appliances", async (req, res) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household." });
  }
  const appliances = await db3.getAppliances(id);
  res.json({ status: "success", data: appliances });
});
router3.post("/:id/appliances", async (req, res) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household." });
  }
  const appliance = await db3.createAppliance({
    householdId: id,
    roomId: req.body.roomId,
    name: req.body.name,
    category: req.body.category || "OTHER",
    ratedPowerW: Number(req.body.ratedPowerW) || 100,
    standbyPowerW: Number(req.body.standbyPowerW) || 5,
    averageHoursPerDay: Number(req.body.averageHoursPerDay) || 6,
    isInverterType: Boolean(req.body.isInverterType),
    isVampireRisk: Boolean(req.body.isVampireRisk),
    purchasePriceBDT: Number(req.body.purchasePriceBDT) || 0
  });
  res.status(201).json({ status: "success", data: appliance });
});
router3.post("/:id/appliances/:applianceId/toggle", async (req, res) => {
  const { id, applianceId } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household." });
  }
  const { isOn } = req.body || {};
  const result = await db3.toggleAppliance(applianceId, isOn);
  res.json({
    status: "success",
    data: {
      applianceId: result.applianceId,
      householdId: id,
      isOn: result.isOn,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
var households_default = router3;

// backend/routes/v1/devices.ts
import { Router as Router4 } from "express";

// backend/adapters/DeviceAdapter.ts
var BaseDeviceAdapter = class {
  async discoverDevices() {
    return [];
  }
  async pairDevice(deviceInfo) {
    const id = deviceInfo.id || `dev_${Math.random().toString(36).substring(2, 9)}`;
    return {
      id,
      householdId: deviceInfo.householdId || "hh_demo_01",
      name: deviceInfo.name || "Discovered Smart Device",
      deviceType: deviceInfo.deviceType || "SMART_PLUG",
      adapterType: this.adapterType,
      macOrSerial: deviceInfo.macOrSerial || "AA:BB:CC:DD:EE:FF",
      isOnline: true,
      lastSeen: (/* @__PURE__ */ new Date()).toISOString(),
      config: deviceInfo.config || {}
    };
  }
  async removeDevice(deviceId) {
    await this.disconnect(deviceId);
    return true;
  }
  async getDeviceStatus(deviceId) {
    return { isOnline: true, latencyMs: 25, signalQualityPct: 92 };
  }
  async getDeviceHistory(deviceId, timeframe = "24h") {
    const history = [];
    const count = timeframe === "1h" ? 12 : timeframe === "24h" ? 24 : 30;
    const now = Date.now();
    for (let i = count; i >= 0; i--) {
      const ts = new Date(now - i * (timeframe === "1h" ? 5 * 60 * 1e3 : 3600 * 1e3)).toISOString();
      const reading = this.createBaseReading(deviceId, 150 + Math.random() * 50);
      reading.timestamp = ts;
      history.push(reading);
    }
    return history;
  }
  async getEnergySummary(deviceId) {
    return {
      todayKwh: 3.42,
      monthKwh: 98.5,
      averageWatts: 185.2
    };
  }
  async getStandbyAnalysis(deviceId) {
    const standbyWatts = 12.5;
    const wasteKwhMonth = standbyWatts * 24 * 30 / 1e3;
    const estimatedMonthlyWasteBDT = Math.round(wasteKwhMonth * 7.5);
    return {
      isVampirePower: standbyWatts > 5,
      standbyWatts,
      estimatedMonthlyWasteBDT
    };
  }
  async toggleState(deviceId, state) {
    return true;
  }
  createBaseReading(deviceId, activePowerW, energyKwhDelta = 0.01) {
    const now = /* @__PURE__ */ new Date();
    const voltage = 220 + Math.sin(now.getTime() / 1e4) * 8 + (Math.random() * 2 - 1);
    const powerFactor = 0.92 + Math.random() * 0.06;
    const current = activePowerW > 0 ? activePowerW / (voltage * powerFactor) : 0;
    return {
      timestamp: now.toISOString(),
      voltage: Number(voltage.toFixed(2)),
      current: Number(current.toFixed(2)),
      activePowerW: Number(activePowerW.toFixed(1)),
      energyKwh: Number(energyKwhDelta.toFixed(3)),
      powerFactor: Number(powerFactor.toFixed(2)),
      frequency: 50,
      deviceId
    };
  }
};

// backend/adapters/MockAdapter.ts
var MockAdapter = class extends BaseDeviceAdapter {
  constructor() {
    super(...arguments);
    this.adapterType = "MockAdapter";
    this.connectedDevices = /* @__PURE__ */ new Set();
  }
  async connect(device) {
    this.connectedDevices.add(device.id);
    return true;
  }
  async disconnect(deviceId) {
    this.connectedDevices.delete(deviceId);
  }
  async fetchTelemetry(device) {
    const db12 = SupabaseService.getInstance();
    const isOn = device.applianceId ? db12.isApplianceOn(device.applianceId) : db12.isDeviceOn(device.id);
    const basePower = device.config?.baseWatts || 450;
    const hour = (/* @__PURE__ */ new Date()).getHours();
    const peakFactor = hour >= 18 && hour <= 23 ? 1.4 : hour >= 12 && hour <= 17 ? 1.25 : 0.8;
    const randomJitter = (Math.random() - 0.5) * 40;
    const activeWatts = isOn ? Math.max(5, Math.round(basePower * peakFactor + randomJitter)) : 0;
    const cumulativeKwh = (device.config?.accumulatedKwh || 120) + activeWatts / 1e3 * (5 / 3600);
    if (device.config) {
      device.config.accumulatedKwh = cumulativeKwh;
    }
    return this.createBaseReading(device.id, activeWatts, cumulativeKwh);
  }
  async getHealthStatus(device) {
    return {
      isOnline: true,
      latencyMs: Math.floor(15 + Math.random() * 20),
      signalQualityPct: Math.floor(88 + Math.random() * 12)
    };
  }
};

// backend/adapters/TuyaAdapter.ts
var TuyaAdapter = class extends BaseDeviceAdapter {
  constructor() {
    super(...arguments);
    this.adapterType = "TuyaAdapter";
  }
  async connect(device) {
    return true;
  }
  async disconnect(deviceId) {
    return;
  }
  async fetchTelemetry(device) {
    const db12 = SupabaseService.getInstance();
    const isOn = device.applianceId ? db12.isApplianceOn(device.applianceId) : db12.isDeviceOn(device.id);
    const ratedWatts = device.config?.ratedWatts || 1650;
    const activeWatts = isOn ? Math.round(ratedWatts * (0.95 + Math.random() * 0.1)) : 0;
    const accumulatedKwh = (device.config?.accumulatedKwh || 45) + activeWatts / 1e3 * (3 / 3600);
    if (device.config) device.config.accumulatedKwh = accumulatedKwh;
    return this.createBaseReading(device.id, activeWatts, accumulatedKwh);
  }
  async getHealthStatus(device) {
    return {
      isOnline: true,
      latencyMs: Math.floor(40 + Math.random() * 60),
      // Tuya Cloud HTTP API latency
      signalQualityPct: 82
    };
  }
};

// backend/services/MqttTelemetryService.ts
import mqtt from "mqtt";
var MqttTelemetryService = class _MqttTelemetryService {
  constructor() {
    this.status = "NOT_CONFIGURED";
    this.lastTelemetryReceived = null;
    this.packetStats = {
      totalReceived: 0,
      totalValid: 0,
      totalInvalid: 0,
      totalSavedToDb: 0
    };
    this.latestReadings = /* @__PURE__ */ new Map();
    this.client = null;
    this.topic = "kilowattiq/telemetry/+";
    this.initialized = false;
  }
  static getInstance() {
    if (!_MqttTelemetryService.instance) {
      _MqttTelemetryService.instance = new _MqttTelemetryService();
    }
    return _MqttTelemetryService.instance;
  }
  init() {
    if (this.initialized) return;
    this.initialized = true;
    const brokerUrl = (process.env.MQTT_BROKER_URL || "").trim();
    const username = process.env.MQTT_USERNAME || void 0;
    const password = process.env.MQTT_PASSWORD || void 0;
    const clientId = process.env.MQTT_CLIENT_ID || `kilowattiq_backend_${Math.random().toString(16).substring(2, 8)}`;
    this.topic = process.env.MQTT_TELEMETRY_TOPIC || "kilowattiq/telemetry/+";
    const isUnconfigured = !brokerUrl || brokerUrl === "" || brokerUrl.includes("your-broker") || brokerUrl.includes("example.com") || brokerUrl.includes("broker.hivemq.com");
    if (isUnconfigured) {
      this.status = "NOT_CONFIGURED";
      console.log("[MqttTelemetryService] MQTT integration not configured; running without MQTT.");
      return;
    }
    const safeUrlLog = brokerUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
    console.log(`[MqttTelemetryService] Initializing MQTT client connection to ${safeUrlLog} (Client ID: ${clientId})...`);
    this.status = "MQTT_DISCONNECTED";
    try {
      let reconnectCount = 0;
      const maxReconnectAttempts = 5;
      this.client = mqtt.connect(brokerUrl, {
        clientId,
        username,
        password,
        clean: true,
        reconnectPeriod: 1e4,
        connectTimeout: 5e3
      });
      this.client.on("connect", () => {
        reconnectCount = 0;
        this.status = "MQTT_CONNECTED";
        console.log(`[MqttTelemetryService] MQTT Connected successfully. Subscribing to topic: ${this.topic}`);
        this.client?.subscribe(this.topic, (err) => {
          if (err) {
            console.error(`[MqttTelemetryService ERROR] Failed to subscribe to ${this.topic}:`, err.message);
          } else {
            console.log(`[MqttTelemetryService] Subscribed to telemetry topic: ${this.topic}`);
          }
        });
      });
      this.client.on("reconnect", () => {
        reconnectCount++;
        if (reconnectCount > maxReconnectAttempts) {
          console.warn(`[MqttTelemetryService] MQTT reached maximum reconnect attempts (${maxReconnectAttempts}). Disconnecting.`);
          this.client?.end(true);
          this.status = "MQTT_DISCONNECTED";
          return;
        }
        console.log(`[MqttTelemetryService] Reconnecting to MQTT broker (Attempt ${reconnectCount}/${maxReconnectAttempts})...`);
      });
      this.client.on("offline", () => {
        this.status = "MQTT_DISCONNECTED";
      });
      this.client.on("close", () => {
        this.status = "MQTT_DISCONNECTED";
      });
      this.client.on("error", (err) => {
        this.status = "MQTT_DISCONNECTED";
        console.error("[MqttTelemetryService ERROR] MQTT Client Error:", err?.message || String(err));
      });
      this.client.on("message", (topic, payloadBuffer) => {
        const rawString = payloadBuffer.toString("utf-8");
        this.processTelemetryPacket(rawString, topic, "MQTT").catch((err) => {
          console.error("[MqttTelemetryService ERROR] Processing telemetry packet failed:", err);
        });
      });
    } catch (err) {
      this.status = "MQTT_DISCONNECTED";
      console.error("[MqttTelemetryService ERROR] Exception during mqtt.connect:", err?.message || String(err));
    }
  }
  async processTelemetryPacket(rawPayload, topic, source = "MQTT") {
    this.packetStats.totalReceived++;
    let data = {};
    if (typeof rawPayload === "string") {
      try {
        data = JSON.parse(rawPayload);
      } catch {
        this.packetStats.totalInvalid++;
        console.warn("[MqttTelemetryService] Rejected telemetry packet: Malformed JSON payload");
        return { success: false, reason: "Malformed JSON payload" };
      }
    } else {
      data = rawPayload;
    }
    if (!data || typeof data !== "object") {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Invalid payload object" };
    }
    let deviceId = data.deviceId || data.device_id || data.id;
    if (!deviceId && topic) {
      const parts = topic.split("/");
      deviceId = parts[parts.length - 1];
    }
    const voltage = Number(data.voltage);
    const current = Number(data.current);
    const powerFactor = Number(data.powerFactor ?? data.power_factor ?? data.pf ?? 1);
    const frequency = Number(data.frequency ?? data.freq ?? 50);
    const timestamp = data.timestamp || data.time || (/* @__PURE__ */ new Date()).toISOString();
    let activePower = data.activePower ?? data.active_power ?? data.power ?? data.powerW;
    if (activePower === void 0 || activePower === null || isNaN(Number(activePower))) {
      if (!isNaN(voltage) && !isNaN(current) && !isNaN(powerFactor)) {
        activePower = voltage * current * powerFactor;
      } else {
        activePower = NaN;
      }
    } else {
      activePower = Number(activePower);
    }
    if (!deviceId || typeof deviceId !== "string" || deviceId.trim() === "") {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Missing or invalid deviceId" };
    }
    if (isNaN(voltage) || voltage <= 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Voltage must be greater than 0" };
    }
    if (isNaN(current) || current < 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Current must be non-negative (>= 0)" };
    }
    if (isNaN(powerFactor) || powerFactor < 0 || powerFactor > 1) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Power factor must be between 0 and 1" };
    }
    if (isNaN(frequency) || frequency < 45 || frequency > 65) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Frequency out of reasonable range (45 - 65 Hz)" };
    }
    if (isNaN(activePower) || activePower < 0) {
      this.packetStats.totalInvalid++;
      return { success: false, reason: "Active power must be non-negative (>= 0)" };
    }
    this.packetStats.totalValid++;
    this.lastTelemetryReceived = (/* @__PURE__ */ new Date()).toISOString();
    const mappedDevice = await SupabaseService.getInstance().findDeviceBySerialOrId(deviceId);
    const targetDeviceId = mappedDevice?.id || deviceId;
    const targetHouseholdId = mappedDevice?.household_id || DEMO_HOUSEHOLD_UUID;
    const saved = await SupabaseService.getInstance().insertReading({
      device_id: targetDeviceId,
      household_id: targetHouseholdId,
      timestamp,
      voltage: Number(voltage.toFixed(1)),
      current: Number(current.toFixed(2)),
      power_factor: Number(powerFactor.toFixed(2)),
      active_power: Number(activePower.toFixed(1)),
      frequency: Number(frequency.toFixed(1))
    });
    if (saved) {
      this.packetStats.totalSavedToDb++;
    }
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
      source
    };
    this.latestReadings.set(targetDeviceId, readingObj);
    return {
      success: true,
      deviceId: targetDeviceId,
      householdId: targetHouseholdId,
      reading: readingObj
    };
  }
  getStatus() {
    return {
      mqttStatus: this.status,
      lastTelemetryReceived: this.lastTelemetryReceived,
      packetStats: { ...this.packetStats },
      topic: this.topic,
      isConfigured: this.status !== "NOT_CONFIGURED"
    };
  }
  getLatestForDevice(deviceId) {
    return this.latestReadings.get(deviceId) || null;
  }
  getLatestForHousehold(householdId) {
    const list = [];
    this.latestReadings.forEach((reading) => {
      if (reading.householdId === householdId || householdId === DEMO_HOUSEHOLD_UUID) {
        list.push(reading);
      }
    });
    return list;
  }
};

// backend/adapters/MQTTAdapter.ts
var MQTTAdapter = class extends BaseDeviceAdapter {
  constructor() {
    super(...arguments);
    this.adapterType = "MQTTAdapter";
  }
  async connect(device) {
    const mqttService2 = MqttTelemetryService.getInstance();
    const status = mqttService2.getStatus();
    return status.mqttStatus === "MQTT_CONNECTED";
  }
  async disconnect(deviceId) {
    return;
  }
  async fetchTelemetry(device) {
    const mqttService2 = MqttTelemetryService.getInstance();
    const latestLive = mqttService2.getLatestForDevice(device.id);
    if (latestLive) {
      return {
        timestamp: latestLive.timestamp,
        voltage: latestLive.voltage,
        current: latestLive.current,
        activePowerW: latestLive.activePowerW,
        energyKwh: latestLive.energyKwh || 0,
        powerFactor: latestLive.powerFactor,
        frequency: latestLive.frequency,
        deviceId: device.id
      };
    }
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
        deviceId: device.id
      };
    }
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      voltage: 220,
      current: 0,
      activePowerW: 0,
      energyKwh: 0,
      powerFactor: 1,
      frequency: 50,
      deviceId: device.id
    };
  }
  async getHealthStatus(device) {
    const mqttService2 = MqttTelemetryService.getInstance();
    const status = mqttService2.getStatus();
    const isOnline = status.mqttStatus === "MQTT_CONNECTED";
    return {
      isOnline,
      latencyMs: isOnline ? 12 : 0,
      signalQualityPct: isOnline ? 95 : 0
    };
  }
};

// backend/adapters/DESCOAdapter.ts
var DESCOAdapter = class extends BaseDeviceAdapter {
  constructor() {
    super(...arguments);
    this.adapterType = "DESCOAdapter";
  }
  async connect(device) {
    return true;
  }
  async disconnect(deviceId) {
    return;
  }
  async fetchTelemetry(device) {
    const db12 = SupabaseService.getInstance();
    const appliances = await db12.getAppliances(device.householdId);
    let calculatedWatts = 0;
    for (const app2 of appliances) {
      if (app2.category === "OTHER" || app2.name.toLowerCase().includes("service entry")) {
        continue;
      }
      if (db12.isApplianceOn(app2.id)) {
        calculatedWatts += app2.ratedPowerW;
      } else {
        calculatedWatts += app2.standbyPowerW || 0;
      }
    }
    const noise = (Math.random() - 0.5) * 30;
    const activeWatts = Math.max(12, Math.round(calculatedWatts + noise));
    const cumulativeKwh = (device.config?.accumulatedKwh || 310) + activeWatts / 1e3 * (3 / 3600);
    if (device.config) device.config.accumulatedKwh = cumulativeKwh;
    return this.createBaseReading(device.id, activeWatts, cumulativeKwh);
  }
  async getHealthStatus(device) {
    return {
      isOnline: true,
      latencyMs: Math.floor(120 + Math.random() * 80),
      // Polled utility AMI API latency
      signalQualityPct: 76
    };
  }
};

// backend/adapters/CompositeAdapter.ts
var CompositeAdapter = class extends BaseDeviceAdapter {
  constructor(adapters = []) {
    super();
    this.adapterType = "CompositeAdapter";
    this.childAdapters = [];
    this.childAdapters = adapters;
  }
  async connect(device) {
    const results = await Promise.all(this.childAdapters.map((a) => a.connect(device)));
    return results.every(Boolean);
  }
  async disconnect(deviceId) {
    await Promise.all(this.childAdapters.map((a) => a.disconnect(deviceId)));
  }
  async fetchTelemetry(device) {
    if (this.childAdapters.length === 0) {
      return this.createBaseReading(device.id, 350, 50);
    }
    const readings = await Promise.all(this.childAdapters.map((a) => a.fetchTelemetry(device)));
    const totalWatts = readings.reduce((acc, r) => acc + r.activePowerW, 0);
    const maxKwh = Math.max(...readings.map((r) => r.energyKwh));
    return this.createBaseReading(device.id, totalWatts, maxKwh);
  }
  async getHealthStatus(device) {
    return {
      isOnline: true,
      latencyMs: 25,
      signalQualityPct: 90
    };
  }
};

// backend/services/IoTService.ts
var IoTService = class _IoTService {
  constructor() {
    this.adapters = /* @__PURE__ */ new Map();
    this.telemetryCache = /* @__PURE__ */ new Map();
    this.adapters.set("MockAdapter", new MockAdapter());
    this.adapters.set("TuyaAdapter", new TuyaAdapter());
    this.adapters.set("MQTTAdapter", new MQTTAdapter());
    this.adapters.set("DESCOAdapter", new DESCOAdapter());
    const composite = new CompositeAdapter([
      this.adapters.get("MockAdapter"),
      this.adapters.get("TuyaAdapter"),
      this.adapters.get("MQTTAdapter"),
      this.adapters.get("DESCOAdapter")
    ]);
    this.adapters.set("CompositeAdapter", composite);
  }
  static getInstance() {
    if (!_IoTService.instance) {
      _IoTService.instance = new _IoTService();
    }
    return _IoTService.instance;
  }
  getAdapter(adapterType) {
    return this.adapters.get(adapterType) || this.adapters.get("MockAdapter");
  }
  async pollDeviceTelemetry(device) {
    const adapter = this.getAdapter(device.adapterType);
    await adapter.connect(device);
    const reading = await adapter.fetchTelemetry(device);
    this.telemetryCache.set(device.id, reading);
    return reading;
  }
  getLatestTelemetry(deviceId) {
    return this.telemetryCache.get(deviceId) || null;
  }
  async getDeviceHealth(device) {
    const adapter = this.getAdapter(device.adapterType);
    return adapter.getHealthStatus(device);
  }
};

// backend/routes/v1/devices.ts
var router4 = Router4();
var db4 = SupabaseService.getInstance();
var iot = IoTService.getInstance();
router4.get("/", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const devices = await db4.getDevices(householdId);
  res.json({ status: "success", data: devices });
});
router4.post("/", async (req, res) => {
  const newDevice = await db4.createDevice({
    householdId: req.body.householdId,
    roomId: req.body.roomId,
    applianceId: req.body.applianceId,
    name: req.body.name,
    deviceType: req.body.deviceType || "SMART_PLUG",
    adapterType: req.body.adapterType || "MockAdapter",
    macOrSerial: req.body.macOrSerial || `MAC-${Date.now()}`,
    isOnline: true,
    config: req.body.config || { baseWatts: 500 }
  });
  res.status(201).json({ status: "success", data: newDevice });
});
router4.get("/:id/health", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const devices = await db4.getDevices(householdId);
  const device = devices.find((d) => d.id === req.params.id);
  if (!device) {
    return res.status(404).json({ status: "error", message: "Device not found" });
  }
  const health = await iot.getDeviceHealth(device);
  res.json({ status: "success", data: { deviceId: device.id, adapter: device.adapterType, health } });
});
router4.post("/:id/toggle", async (req, res) => {
  const deviceId = req.params.id;
  const { isOn } = req.body || {};
  const result = await db4.toggleDevice(deviceId, isOn);
  res.json({
    status: "success",
    data: {
      deviceId: result.deviceId,
      isOn: result.isOn,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
var devices_default = router4;

// backend/routes/v1/telemetry.ts
import { Router as Router5 } from "express";
var router5 = Router5();
var db5 = SupabaseService.getInstance();
var iot2 = IoTService.getInstance();
var mqttService = MqttTelemetryService.getInstance();
router5.get("/live", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const devices = await db5.getDevices(householdId);
  const mqttStatus = mqttService.getStatus();
  const readings = await Promise.all(
    devices.map((device) => iot2.pollDeviceTelemetry(device))
  );
  const totalWatts = readings.reduce((acc, r) => acc + (r.activePowerW || 0), 0);
  const avgVoltage = readings.length > 0 ? readings.reduce((acc, r) => acc + (r.voltage || 220), 0) / readings.length : 220;
  res.json({
    status: "success",
    data: {
      householdId,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      mqttStatus: mqttStatus.mqttStatus,
      lastTelemetryReceived: mqttStatus.lastTelemetryReceived,
      packetStats: mqttStatus.packetStats,
      summary: {
        totalActivePowerW: Number(totalWatts.toFixed(1)),
        gridVoltageV: Number(avgVoltage.toFixed(1)),
        activeDeviceCount: devices.filter((d) => d.isOnline).length
      },
      readings
    }
  });
});
router5.get("/stream", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  let isClosed = false;
  const pushTelemetry = async () => {
    if (isClosed) return;
    try {
      const devices = await db5.getDevices(householdId);
      const mqttStatus = mqttService.getStatus();
      const readings = await Promise.all(
        devices.map((device) => iot2.pollDeviceTelemetry(device))
      );
      const totalWatts = readings.reduce((acc, r) => acc + (r.activePowerW || 0), 0);
      const avgVoltage = readings.length > 0 ? readings.reduce((acc, r) => acc + (r.voltage || 220), 0) / readings.length : 220;
      const payload = {
        householdId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        transport: "SSE",
        mqttStatus: mqttStatus.mqttStatus,
        lastTelemetryReceived: mqttStatus.lastTelemetryReceived,
        packetStats: mqttStatus.packetStats,
        summary: {
          totalActivePowerW: Number(totalWatts.toFixed(1)),
          gridVoltageV: Number(avgVoltage.toFixed(1)),
          activeDeviceCount: devices.filter((d) => d.isOnline).length
        },
        readings
      };
      res.write(`event: telemetry
data: ${JSON.stringify(payload)}

`);
    } catch (err) {
    }
  };
  await pushTelemetry();
  const timer = setInterval(pushTelemetry, 1500);
  req.on("close", () => {
    isClosed = true;
    clearInterval(timer);
    res.end();
  });
});
router5.get("/history", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const rawReadings = await db5.getReadings(householdId);
  res.json({
    status: "success",
    data: {
      householdId,
      count: rawReadings.length,
      readings: rawReadings
    }
  });
});
router5.post("/simulate", async (req, res) => {
  try {
    const payload = req.body || {};
    const topic = payload.topic || "simulated/kilowattiq/esp32-pzem-001";
    const result = await mqttService.processTelemetryPacket(payload, topic, "SIMULATOR");
    if (!result.success) {
      return res.status(400).json({
        status: "error",
        message: `Telemetry validation failed: ${result.reason}`
      });
    }
    return res.json({
      status: "success",
      message: "Simulated telemetry packet validated and processed successfully",
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err?.message || "Failed to simulate telemetry packet"
    });
  }
});
var telemetry_default = router5;

// backend/routes/v1/analytics.ts
import { Router as Router6 } from "express";

// shared/constants/bdTariffs.ts
var BD_DEFAULT_SLAB_TARIFF = {
  id: "DESCO-LTA-2025",
  utilityName: "DESCO / DPDC / BPDB (LT-A Residential)",
  tariffType: "SLAB",
  slabs: [
    { minKwh: 0, maxKwh: 75, ratePerKwh: 5.26, stepName: "Step 1 (0 - 75 kWh)" },
    { minKwh: 76, maxKwh: 200, ratePerKwh: 7.2, stepName: "Step 2 (76 - 200 kWh)" },
    { minKwh: 201, maxKwh: 300, ratePerKwh: 7.59, stepName: "Step 3 (201 - 300 kWh)" },
    { minKwh: 301, maxKwh: 400, ratePerKwh: 8.02, stepName: "Step 4 (301 - 400 kWh)" },
    { minKwh: 401, maxKwh: 600, ratePerKwh: 12.67, stepName: "Step 5 (401 - 600 kWh)" },
    { minKwh: 601, maxKwh: null, ratePerKwh: 14.61, stepName: "Step 6 (Above 600 kWh)" }
  ],
  flatRatePerKwh: 8.95,
  touRates: {
    offPeakRate: 7.05,
    // 23:00 to 17:00
    peakRate: 12.1
    // 17:00 to 23:00 (Peak hours in BD)
  },
  seasonalMultipliers: {
    summer: 1.15,
    // Hot summer humidity increases AC/Fan load
    winter: 0.85
    // Cooler winter reduces AC load
  },
  demandChargePerKw: 42,
  // BDT 42/kW/month
  meterRent: 40,
  // BDT 40/month
  vatPercent: 5
  // 5% Govt VAT
};

// backend/engine/TariffCalculator.ts
var TariffCalculator = class {
  /**
   * Calculates comprehensive electricity bill breakdown in BDT
   */
  static calculateCost(kwhConsumption, sanctionedLoadKw = 3, tariffType = "SLAB", tariffConfig = BD_DEFAULT_SLAB_TARIFF, options) {
    const totalKwh = Math.max(0, kwhConsumption);
    let energyCostBDT = 0;
    const slabBreakdown = [];
    if (tariffType === "SLAB") {
      let remainingKwh = totalKwh;
      for (const slab of tariffConfig.slabs) {
        if (remainingKwh <= 0) break;
        const maxInSlab = slab.maxKwh !== null ? slab.maxKwh - slab.minKwh : Infinity;
        const kwhInSlab = Math.min(remainingKwh, maxInSlab);
        const costForSlab = kwhInSlab * slab.ratePerKwh;
        energyCostBDT += costForSlab;
        slabBreakdown.push({
          stepName: slab.stepName,
          kwhInSlab: Number(kwhInSlab.toFixed(2)),
          rate: slab.ratePerKwh,
          costBDT: Number(costForSlab.toFixed(2))
        });
        remainingKwh -= kwhInSlab;
      }
    } else if (tariffType === "FLAT") {
      energyCostBDT = totalKwh * tariffConfig.flatRatePerKwh;
    } else if (tariffType === "TOU") {
      const peakRatio = options?.isPeakHourRatio ?? 0.25;
      const peakKwh = totalKwh * peakRatio;
      const offPeakKwh = totalKwh * (1 - peakRatio);
      const peakRate = tariffConfig.touRates?.peakRate ?? 12.1;
      const offPeakRate = tariffConfig.touRates?.offPeakRate ?? 7.05;
      energyCostBDT = peakKwh * peakRate + offPeakKwh * offPeakRate;
    } else if (tariffType === "SEASONAL") {
      const multiplier = options?.seasonMultiplier ?? 1;
      const baseCalc = this.calculateCost(totalKwh, sanctionedLoadKw, "SLAB", tariffConfig);
      energyCostBDT = baseCalc.energyCostBDT * multiplier;
    }
    const demandChargeBDT = sanctionedLoadKw * tariffConfig.demandChargePerKw;
    const meterRentBDT = tariffConfig.meterRent;
    const subtotal = energyCostBDT + demandChargeBDT + meterRentBDT;
    const vatBDT = subtotal * (tariffConfig.vatPercent / 100);
    const grossTotalBDT = subtotal + vatBDT;
    const effectiveRate = totalKwh > 0 ? grossTotalBDT / totalKwh : 0;
    return {
      tariffType,
      totalKwh: Number(totalKwh.toFixed(2)),
      energyCostBDT: Number(energyCostBDT.toFixed(2)),
      slabBreakdown,
      demandChargeBDT: Number(demandChargeBDT.toFixed(2)),
      meterRentBDT: Number(meterRentBDT.toFixed(2)),
      vatBDT: Number(vatBDT.toFixed(2)),
      grossTotalBDT: Number(grossTotalBDT.toFixed(2)),
      effectiveRatePerKwh: Number(effectiveRate.toFixed(2))
    };
  }
  /**
   * Predictive analysis for BERC slab step-jump risks and countdown
   */
  static analyzeSlabThreshold(currentKwh, daysPassed = 18, totalDaysInMonth = 30, sanctionedLoadKw = 3, tariffConfig = BD_DEFAULT_SLAB_TARIFF) {
    const safeDaysPassed = Math.max(1, daysPassed);
    const safeTotalDays = Math.max(safeDaysPassed, totalDaysInMonth);
    const remainingDays = safeTotalDays - safeDaysPassed;
    const burnRateKwhPerDay = currentKwh / safeDaysPassed;
    const projectedMonthEndKwh = burnRateKwhPerDay * safeTotalDays;
    let currentSlab = tariffConfig.slabs[0];
    let nextSlab = tariffConfig.slabs[1] || null;
    for (let i = 0; i < tariffConfig.slabs.length; i++) {
      const slab = tariffConfig.slabs[i];
      if (currentKwh >= slab.minKwh && (slab.maxKwh === null || currentKwh <= slab.maxKwh)) {
        currentSlab = slab;
        nextSlab = tariffConfig.slabs[i + 1] || null;
        break;
      }
    }
    const thresholdKwh = currentSlab.maxKwh;
    const kwhRemainingToBreach = thresholdKwh !== null ? Math.max(0, thresholdKwh - currentKwh) : 0;
    let daysUntilBreach = null;
    if (thresholdKwh !== null && burnRateKwhPerDay > 0) {
      daysUntilBreach = Number((kwhRemainingToBreach / burnRateKwhPerDay).toFixed(1));
    }
    const projectedBreachOccurs = thresholdKwh !== null && projectedMonthEndKwh > thresholdKwh;
    const currentRateBDT = currentSlab.ratePerKwh;
    const nextRateBDT = nextSlab ? nextSlab.ratePerKwh : null;
    const rateJumpPercentage = nextRateBDT ? Number(((nextRateBDT - currentRateBDT) / currentRateBDT * 100).toFixed(1)) : 0;
    const maxDailyKwhToStayInSlab = remainingDays > 0 && thresholdKwh !== null ? Number((kwhRemainingToBreach / remainingDays).toFixed(1)) : 0;
    const costAtCap = thresholdKwh !== null ? this.calculateCost(thresholdKwh, sanctionedLoadKw, "SLAB", tariffConfig).grossTotalBDT : 0;
    const costAtProjected = this.calculateCost(projectedMonthEndKwh, sanctionedLoadKw, "SLAB", tariffConfig).grossTotalBDT;
    const avoidableMonthlySurchargeBDT = Math.max(0, Number((costAtProjected - costAtCap).toFixed(2)));
    return {
      currentSlabName: currentSlab.stepName,
      currentRateBDT,
      nextSlabName: nextSlab ? nextSlab.stepName : null,
      nextRateBDT,
      rateJumpPercentage,
      thresholdKwh,
      kwhRemainingToBreach: Number(kwhRemainingToBreach.toFixed(1)),
      burnRateKwhPerDay: Number(burnRateKwhPerDay.toFixed(2)),
      projectedMonthEndKwh: Number(projectedMonthEndKwh.toFixed(1)),
      daysUntilBreach,
      projectedBreachOccurs,
      maxDailyKwhToStayInSlab,
      avoidableMonthlySurchargeBDT
    };
  }
};

// backend/engine/BudgetEngine.ts
var BudgetEngine = class {
  /**
   * Projects month-end electricity expenditure and checks against household budget
   */
  static evaluateBudget(householdId, monthlyBudgetBDT, currentKwh, daysPassed, daysInMonth = 30, sanctionedLoadKw = 3, tariffType = "SLAB") {
    const validDaysPassed = Math.max(1, daysPassed);
    const dailyKwhAverage = currentKwh / validDaysPassed;
    const projectedKwh = dailyKwhAverage * daysInMonth;
    const currentCost = TariffCalculator.calculateCost(currentKwh, sanctionedLoadKw, tariffType);
    const projectedCost = TariffCalculator.calculateCost(projectedKwh, sanctionedLoadKw, tariffType);
    const projectedCostBDT = projectedCost.grossTotalBDT;
    const isOverageLikely = projectedCostBDT > monthlyBudgetBDT;
    const overagePercentage = monthlyBudgetBDT > 0 ? Number(((projectedCostBDT - monthlyBudgetBDT) / monthlyBudgetBDT * 100).toFixed(1)) : 0;
    return {
      householdId,
      monthlyBudgetBDT,
      currentSpentBDT: currentCost.grossTotalBDT,
      currentKwh: Number(currentKwh.toFixed(1)),
      daysPassed,
      daysInMonth,
      projectedKwh: Number(projectedKwh.toFixed(1)),
      projectedCostBDT: Number(projectedCostBDT.toFixed(2)),
      isOverageLikely,
      overagePercentage
    };
  }
};

// backend/engine/VampirePowerEngine.ts
var VampirePowerEngine = class {
  /**
   * Audits appliances for standby/vampire power loss during off-hours
   */
  static analyzeVampirePower(appliances, rooms, avgKwhCostBDT = 8.02) {
    const roomMap = new Map(rooms.map((r) => [r.id, r.name]));
    return appliances.filter((app2) => app2.standbyPowerW > 2 || app2.isVampireRisk).map((app2) => {
      const standbyWatts = app2.standbyPowerW || 12;
      const standbyHoursPerDay = Math.max(0, 24 - app2.averageHoursPerDay);
      const dailyStandbyKwh = standbyWatts * standbyHoursPerDay / 1e3;
      const monthlyWastedBDT = dailyStandbyKwh * 30 * avgKwhCostBDT;
      const annualWastedBDT = monthlyWastedBDT * 12;
      let severity = "LOW";
      if (monthlyWastedBDT > 250) severity = "HIGH";
      else if (monthlyWastedBDT > 80) severity = "MEDIUM";
      return {
        applianceId: app2.id,
        applianceName: app2.name,
        roomName: roomMap.get(app2.roomId) || "Main Area",
        standbyWatts,
        dailyStandbyKwh: Number(dailyStandbyKwh.toFixed(3)),
        monthlyWastedBDT: Number(monthlyWastedBDT.toFixed(2)),
        annualWastedBDT: Number(annualWastedBDT.toFixed(2)),
        severity
      };
    }).sort((a, b) => b.monthlyWastedBDT - a.monthlyWastedBDT);
  }
};

// backend/engine/ROICalculator.ts
var ROICalculator = class {
  /**
   * Computes payback period and financial savings for appliance upgrades
   */
  static calculateUpgradeROI(currentApplianceName, proposedApplianceName, currentWatts, proposedWatts, usageHoursPerDay, initialInvestmentBDT, electricityRateBDT = 8.02) {
    const dailyWattsSaved = Math.max(0, currentWatts - proposedWatts) * usageHoursPerDay;
    const dailyKwhSaved = dailyWattsSaved / 1e3;
    const monthlyKwhSaved = dailyKwhSaved * 30;
    const monthlySavingsBDT = monthlyKwhSaved * electricityRateBDT;
    const annualSavingsBDT = monthlySavingsBDT * 12;
    const paybackPeriodMonths = monthlySavingsBDT > 0 ? Number((initialInvestmentBDT / monthlySavingsBDT).toFixed(1)) : 0;
    const fiveYearNetSavingsBDT = annualSavingsBDT * 5 - initialInvestmentBDT;
    return {
      currentAppliance: currentApplianceName,
      proposedAppliance: proposedApplianceName,
      currentWatts,
      proposedWatts,
      usageHoursPerDay,
      initialInvestmentBDT,
      monthlySavingsBDT: Number(monthlySavingsBDT.toFixed(2)),
      annualSavingsBDT: Number(annualSavingsBDT.toFixed(2)),
      paybackPeriodMonths,
      fiveYearNetSavingsBDT: Number(fiveYearNetSavingsBDT.toFixed(2))
    };
  }
};

// backend/routes/v1/analytics.ts
var router6 = Router6();
var db6 = SupabaseService.getInstance();
router6.get("/cost", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const household = await db6.getHouseholdById(householdId);
  const kwh = Number(req.query.kwh) || 285;
  const tariffType = req.query.tariffType?.toUpperCase() || "SLAB";
  const sanctionedLoad = household?.sanctionedLoadKw || 4.5;
  const cost = TariffCalculator.calculateCost(kwh, sanctionedLoad, tariffType);
  res.json({ status: "success", data: cost });
});
router6.get("/budget", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const household = await db6.getHouseholdById(householdId);
  const currentKwh = Number(req.query.currentKwh) || 210;
  const daysPassed = Number(req.query.daysPassed) || 18;
  const budgetBDT = household?.monthlyBudgetBDT || 4500;
  const loadKw = household?.sanctionedLoadKw || 4.5;
  const status = BudgetEngine.evaluateBudget(
    householdId,
    budgetBDT,
    currentKwh,
    daysPassed,
    30,
    loadKw,
    "SLAB"
  );
  res.json({ status: "success", data: status });
});
router6.get("/vampire-power", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const rooms = await db6.getRooms(householdId);
  const appliances = await db6.getAppliances(householdId);
  const report = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
  res.json({ status: "success", data: report });
});
router6.post("/roi", (req, res) => {
  const {
    currentApplianceName,
    proposedApplianceName,
    currentWatts,
    proposedWatts,
    usageHoursPerDay,
    initialInvestmentBDT,
    electricityRateBDT
  } = req.body;
  const result = ROICalculator.calculateUpgradeROI(
    currentApplianceName || "Non-Inverter AC 1.5 Ton",
    proposedApplianceName || "5-Star Inverter AC 1.5 Ton",
    Number(currentWatts) || 1650,
    Number(proposedWatts) || 1050,
    Number(usageHoursPerDay) || 7,
    Number(initialInvestmentBDT) || 62e3,
    Number(electricityRateBDT) || 8.02
  );
  res.json({ status: "success", data: result });
});
router6.get("/monthly-trend", async (req, res) => {
  const householdId = req.query.householdId || "11111111-1111-4111-a111-111111111111";
  const household = await db6.getHouseholdById(householdId);
  const budgetBDT = household?.monthlyBudgetBDT || 4500;
  const loadKw = household?.sanctionedLoadKw || 3;
  const months = ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026"];
  const baseKwh = [240, 265, 310, 325, 295, 285];
  const trend = months.map((month, idx) => {
    const kwh = baseKwh[idx];
    const cost = TariffCalculator.calculateCost(kwh, loadKw, "SLAB");
    return {
      month,
      consumptionKwh: kwh,
      costBDT: cost.grossTotalBDT,
      budgetBDT,
      effectiveRateBDT: cost.effectiveRatePerKwh,
      isOverBudget: cost.grossTotalBDT > budgetBDT
    };
  });
  res.json({
    status: "success",
    data: {
      householdId,
      sanctionedLoadKw: loadKw,
      monthlyBudgetBDT: budgetBDT,
      trend
    }
  });
});
var analytics_default = router6;

// backend/routes/v1/recommendations.ts
import { Router as Router7 } from "express";

// backend/engine/RecommendationEngine.ts
var RecommendationEngine = class {
  /**
   * Generates localized energy efficiency recommendations
   */
  static generateRecommendations(appliances, currentMonthlyKwh, currentStepName) {
    const recommendations = [];
    const nonInverterACs = appliances.filter((a) => a.category === "AIR_CONDITIONER" && !a.isInverterType);
    if (nonInverterACs.length > 0) {
      recommendations.push({
        id: "rec_ac_inverter",
        title: "Upgrade Non-Inverter AC to 5-Star Inverter Model",
        category: "APPLIANCE_UPGRADE",
        priority: "HIGH",
        description: `You have ${nonInverterACs.length} non-inverter Air Conditioner(s). Replacing a 1.5 Ton non-inverter AC with an inverter AC reduces cooling power consumption by up to 45% in Bangladeshi summer conditions.`,
        estimatedMonthlySavingsBDT: 1450 * nonInverterACs.length,
        actionableStep: "Set target temperature to 25\xB0C and consider replacing non-inverter units to achieve a ~1.8 year payback period."
      });
    }
    if (currentMonthlyKwh > 200) {
      recommendations.push({
        id: "rec_peak_shift",
        title: "Shift Heavy Load Usage Away From Peak Hours (5 PM - 11 PM)",
        category: "PEAK_SHIFTING",
        priority: "HIGH",
        description: "Running water heaters (geysers), washing machines, and water pumps during evening peak hours (17:00 to 23:00) puts high demand on national grid and increases peak tariff rates.",
        estimatedMonthlySavingsBDT: 380,
        actionableStep: "Schedule water pumping and laundry operations between 7:00 AM and 4:00 PM."
      });
    }
    const vampireCount = appliances.filter((a) => a.isVampireRisk || a.standbyPowerW > 10).length;
    if (vampireCount > 0) {
      recommendations.push({
        id: "rec_vampire_kill",
        title: "Eliminate Phantom Standby Power with Smart Plugs",
        category: "VAMPIRE_POWER",
        priority: "MEDIUM",
        description: `Found ${vampireCount} appliances drawing continuous standby power (TV set-top boxes, microwave clocks, chargers).`,
        estimatedMonthlySavingsBDT: 240,
        actionableStep: "Use smart Wi-Fi cut-off plugs or main switch extension boards to cut power automatically at night."
      });
    }
    const fridges = appliances.filter((a) => a.category === "REFRIGERATOR");
    if (fridges.length > 0) {
      recommendations.push({
        id: "rec_fridge_opt",
        title: "Optimize Refrigerator Wall Clearance & Gasket Seal",
        category: "BEHAVIORAL",
        priority: "LOW",
        description: "Keeping refrigerators too close to walls reduces heat dissipation from condenser coils, forcing compressor to work 20% harder.",
        estimatedMonthlySavingsBDT: 160,
        actionableStep: "Maintain at least 4 inches (10 cm) clearance behind the refrigerator and inspect door magnetic rubber seals."
      });
    }
    return recommendations;
  }
};

// backend/services/GeminiAdvisorService.ts
import { GoogleGenAI, Type } from "@google/genai";
var GeminiAdvisorService = class {
  /**
   * Generates natural language AI energy advisory content based on deterministic backend calculations.
   */
  static async generateAdvisory(payload) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return {
        available: false,
        fallbackReason: "GEMINI_API_KEY is not configured in backend environment. Operating in Deterministic Energy Advisory mode.",
        aiAdvice: this.generateDeterministicFallback(payload)
      };
    }
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      const advisorySchema = {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "Executive energy summary explaining usage and financial projection."
          },
          priorityActions: {
            type: Type.ARRAY,
            description: "Prioritized energy and cost savings actions.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                reason: { type: Type.STRING },
                impact: { type: Type.STRING, description: "high, medium, or low" }
              },
              required: ["title", "reason", "impact"]
            }
          },
          explanation: {
            type: Type.STRING,
            description: "Detailed breakdown explaining DESCO tariff slabs, peak load reduction, or vampire power savings."
          },
          language: { type: Type.STRING, description: "en or bn" }
        },
        required: ["summary", "priorityActions", "explanation", "language"]
      };
      const systemInstruction = `You are KilowattIQ's Expert Household Energy Advisor for Bangladesh.
Your role is to summarize and explain the deterministic energy calculations provided in the prompt for a Bangladeshi household user.

STRICT CONSTRAINTS:
1. DO NOT invent, alter, or override ANY numerical values. All cost estimates (BDT), kWh numbers, current load (Watts), and savings figures MUST come directly from the supplied data.
2. DO NOT claim physical IoT hardware is connected or DESCO live API connectivity unless explicitly stated in the input data.
3. If language is 'bn', write ALL fields (summary, priorityActions, explanation) in natural, idiomatic Bangla suitable for Bangladeshi homeowners. Do not use literal robotic translations or unneeded English technical jargon.
4. If language is 'en', write in clear, professional, friendly English.
5. Explain recommendations using supplied deterministic values and Bangladesh DESCO LT-A tariff slab context.`;
      const promptText = `Please analyze the following household energy metrics and deterministic recommendations:

Household Name: ${payload.householdName}
Sanctioned Load: ${payload.sanctionedLoadKw} kW
Current Active Load: ${payload.currentActiveWatts} W
Current Estimated Monthly Consumption: ${payload.monthlyKwh} kWh
Projected Monthly Bill: BDT ${payload.projectedBillBDT}
Monthly Budget: BDT ${payload.monthlyBudgetBDT} (Overage: ${payload.overagePercentage}%)
Current Tariff Slab: ${payload.tariffSlabName}
Standby / Vampire Power Waste: BDT ${payload.vampirePowerBDT} / month

Top Appliances:
${payload.topAppliances.map((a) => `- ${a.name}: ${a.powerW}W (${a.isOn ? "ON" : "OFF"})`).join("\n")}

Deterministic Recommendations from Calculation Engine:
${payload.deterministicRecommendations.map(
        (r, i) => `${i + 1}. [${r.priority}] ${r.title}
   Description: ${r.description}
   Est. Monthly Savings: BDT ${r.estimatedMonthlySavingsBDT}
   Actionable Step: ${r.actionableStep}`
      ).join("\n\n")}

Requested Response Language: ${payload.language === "bn" ? "Bangla (bn)" : "English (en)"}

Return the advisory response in the requested JSON structure.`;
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Gemini API call timed out after 6 seconds")), 6e3)
      );
      const generatePromise = ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: advisorySchema
        }
      });
      const response = await Promise.race([generatePromise, timeoutPromise]);
      const jsonText = response.text;
      if (!jsonText) {
        throw new Error("Empty response from Gemini API");
      }
      const parsed = JSON.parse(jsonText);
      if (!parsed.summary || !Array.isArray(parsed.priorityActions) || !parsed.explanation) {
        throw new Error("Incomplete JSON schema returned by Gemini model");
      }
      const validActions = parsed.priorityActions.map((act) => ({
        title: act.title || "Action",
        reason: act.reason || "",
        impact: ["high", "medium", "low"].includes(act.impact?.toLowerCase()) ? act.impact.toLowerCase() : "medium"
      }));
      return {
        available: true,
        aiAdvice: {
          summary: parsed.summary,
          priorityActions: validActions,
          explanation: parsed.explanation,
          language: payload.language === "bn" ? "bn" : "en"
        }
      };
    } catch (err) {
      let cleanReason = "AI service temporarily unavailable.";
      const rawMsg = err?.message || String(err);
      if (typeof rawMsg === "string") {
        try {
          const parsedErr = JSON.parse(rawMsg);
          if (parsedErr?.error?.message) {
            cleanReason = parsedErr.error.message;
          } else {
            cleanReason = rawMsg;
          }
        } catch {
          cleanReason = rawMsg;
        }
      }
      if (cleanReason.includes("Quota exceeded") || cleanReason.includes("429") || cleanReason.includes("RESOURCE_EXHAUSTED") || cleanReason.includes("limit: 0")) {
        cleanReason = "Gemini API free tier quota or rate limit reached. Rule-based energy advisor calculations active.";
      }
      console.warn(`[GeminiAdvisorService] Advisory fallback triggered: ${cleanReason}`);
      return {
        available: false,
        fallbackReason: cleanReason,
        aiAdvice: this.generateDeterministicFallback(payload)
      };
    }
  }
  /**
   * Generates deterministic, localized energy advisory in English or Bangla
   * when LLM credentials are not configured or rate-limited.
   */
  static generateDeterministicFallback(payload) {
    const isBn = payload.language === "bn";
    if (isBn) {
      const summary2 = `${payload.householdName}-\u098F\u09B0 \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8 \u09B8\u0995\u09CD\u09B0\u09BF\u09AF\u09BC \u09AC\u09BF\u09A6\u09CD\u09AF\u09C1\u09CE \u09B2\u09CB\u09A1 ${payload.currentActiveWatts} \u0993\u09AF\u09BC\u09BE\u099F \u098F\u09AC\u0982 \u09AE\u09BE\u09B8\u09BF\u0995 \u0986\u09A8\u09C1\u09AE\u09BE\u09A8\u09BF\u0995 \u0996\u09B0\u099A ${payload.monthlyKwh} \u0987\u0989\u09A8\u09BF\u099F (\u0986\u09A8\u09C1\u09AE\u09BE\u09A8\u09BF\u0995 \u09AE\u09CB\u099F \u09AC\u09BF\u09B2: \u09F3${payload.projectedBillBDT.toLocaleString("en-US", { maximumFractionDigits: 0 })})\u0964 \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09BF\u09A4 \u09B2\u09CB\u09A1 ${payload.sanctionedLoadKw} \u0995\u09BF\u09B2\u09CB\u0993\u09AF\u09BC\u09BE\u099F \u098F\u09AC\u0982 \u09AE\u09BE\u09B8\u09BF\u0995 \u09AC\u09BE\u099C\u09C7\u099F \u09F3${payload.monthlyBudgetBDT.toLocaleString("en-US", { maximumFractionDigits: 0 })}-\u098F\u09B0 \u09AC\u09BF\u09AA\u09B0\u09C0\u09A4\u09C7 \u0986\u09AA\u09A8\u09BE\u09B0 \u0996\u09B0\u099A \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 ${payload.overagePercentage > 0 ? `${payload.overagePercentage.toFixed(1)}% \u09AC\u09BE\u099C\u09C7\u099F\u09C7\u09B0 \u09AC\u09C7\u09B6\u09BF \u09B0\u09AF\u09BC\u09C7\u099B\u09C7\u0964` : "\u09AC\u09BE\u099C\u09C7\u099F\u09C7\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7 \u09B8\u09C1\u09B0\u0995\u09CD\u09B7\u09BF\u09A4 \u09B0\u09AF\u09BC\u09C7\u099B\u09C7\u0964"}`;
      const priorityActions2 = (payload.deterministicRecommendations || []).slice(0, 3).map((rec) => ({
        title: rec.title,
        reason: rec.description,
        impact: rec.priority.toLowerCase()
      }));
      if (priorityActions2.length === 0) {
        priorityActions2.push(
          {
            title: "\u09AA\u09BF\u0995 \u0986\u0993\u09AF\u09BC\u09BE\u09B0 \u09B2\u09CB\u09A1 \u09B8\u09CD\u09A5\u09BE\u09A8\u09BE\u09A8\u09CD\u09A4\u09B0",
            reason: "\u09AC\u09BF\u0995\u09BE\u09B2 \u09EB\u099F\u09BE \u09A5\u09C7\u0995\u09C7 \u09B0\u09BE\u09A4 \u09E7\u09E7\u099F\u09BE \u09AA\u09B0\u09CD\u09AF\u09A8\u09CD\u09A4 \u0989\u099A\u09CD\u099A \u09B6\u0995\u09CD\u09A4\u09BF\u09B0 \u098F\u09B8\u09BF \u09AC\u09BE \u0997\u09BF\u099C\u09BE\u09B0 \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09AE\u09BF\u09AF\u09BC\u09C7 \u09AC\u09BF\u09A6\u09CD\u09AF\u09C1\u09A4\u09C7\u09B0 \u099A\u09BE\u09AA \u09B9\u09CD\u09B0\u09BE\u09B8 \u0995\u09B0\u09C1\u09A8\u0964",
            impact: "high"
          },
          {
            title: "\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u09AC\u09BE\u0987 \u09AD\u09CD\u09AF\u09BE\u09AE\u09CD\u09AA\u09BE\u09AF\u09BC\u09BE\u09B0 \u09AC\u09BF\u09A6\u09CD\u09AF\u09C1\u09CE \u09B0\u09CB\u09A7",
            reason: `\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u09AC\u09BE\u0987 \u09AE\u09CB\u09A1\u09C7 \u099F\u09BF\u09AD\u09BF, \u09AE\u09BE\u0987\u0995\u09CD\u09B0\u09CB\u0993\u09AF\u09BC\u09C7\u09AD \u0993 \u099A\u09BE\u09B0\u09CD\u099C\u09BE\u09B0 \u09AC\u09A8\u09CD\u09A7 \u0995\u09B0\u09C7 \u09AE\u09BE\u09B8\u09C7 \u09AA\u09CD\u09B0\u09BE\u09AF\u09BC \u09F3${payload.vampirePowerBDT} \u09B8\u09BE\u09B6\u09CD\u09B0\u09AF\u09BC \u0995\u09B0\u09C1\u09A8\u0964`,
            impact: "medium"
          }
        );
      }
      const explanation2 = `\u09E7. \u09A1\u09C7\u09B8\u0995\u09CB/\u09A1\u09BF\u09AA\u09BF\u09A1\u09BF\u09B8\u09BF \u09B8\u09CD\u09B2\u09CD\u09AF\u09BE\u09AC \u09AC\u09BF\u09B6\u09CD\u09B2\u09C7\u09B7\u09A3: \u0986\u09AA\u09A8\u09BE\u09B0 \u09AA\u09B0\u09BF\u09AC\u09BE\u09B0 \u09AC\u09B0\u09CD\u09A4\u09AE\u09BE\u09A8\u09C7 "${payload.tariffSlabName}" \u09B8\u09CD\u09A4\u09B0\u09C7 \u09AC\u09BF\u09A6\u09CD\u09AF\u09C1\u09CE \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u099B\u09C7\u0964 \u09AA\u09B0\u09AC\u09B0\u09CD\u09A4\u09C0 \u0989\u099A\u09CD\u099A\u09A4\u09B0 \u09B8\u09CD\u09B2\u09CD\u09AF\u09BE\u09AC\u09C7 \u0997\u09C7\u09B2\u09C7 \u09AA\u09CD\u09B0\u09A4\u09BF \u0987\u0989\u09A8\u09BF\u099F\u09C7\u09B0 \u09AE\u09C2\u09B2\u09CD\u09AF \u0989\u09B2\u09CD\u09B2\u09C7\u0996\u09AF\u09CB\u0997\u09CD\u09AF \u09B9\u09BE\u09B0\u09C7 \u09AC\u09C3\u09A6\u09CD\u09A7\u09BF \u09AA\u09BE\u09AC\u09C7\u0964
\u09E8. \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09BF\u09A4 \u09B2\u09CB\u09A1 \u09B8\u09C1\u09B0\u0995\u09CD\u09B7\u09BE: \u0986\u09AA\u09A8\u09BE\u09B0 \u09B8\u09B0\u09CD\u09AC\u09CB\u099A\u09CD\u099A \u0985\u09A8\u09C1\u09AE\u09CB\u09A6\u09BF\u09A4 \u09B2\u09CB\u09A1 ${payload.sanctionedLoadKw} kW\u0964 \u098F\u0995\u09BE\u09A7\u09BF\u0995 \u09AD\u09BE\u09B0\u09C0 \u09B8\u09B0\u099E\u09CD\u099C\u09BE\u09AE (\u09AF\u09C7\u09AE\u09A8 \u098F\u0995\u09BE\u09A7\u09BF\u0995 \u098F\u09B8\u09BF \u0993 \u0993\u09AF\u09BC\u09BE\u099F\u09BE\u09B0 \u09B9\u09BF\u099F\u09BE\u09B0) \u098F\u0995\u09B8\u09BE\u09A5\u09C7 \u099A\u09BE\u09B2\u09BE\u09B2\u09C7 \u0985\u09A4\u09BF\u09B0\u09BF\u0995\u09CD\u09A4 \u09B2\u09CB\u09A1 \u09AA\u09C7\u09A8\u09BE\u09B2\u09CD\u099F\u09BF \u09AC\u09BE \u09AE\u09BF\u099F\u09BE\u09B0 \u099F\u09CD\u09B0\u09BF\u09AA \u09B9\u09A4\u09C7 \u09AA\u09BE\u09B0\u09C7\u0964
\u09E9. \u09AD\u09CD\u09AF\u09BE\u09AE\u09CD\u09AA\u09BE\u09AF\u09BC\u09BE\u09B0 \u09AA\u09BE\u0993\u09AF\u09BC\u09BE\u09B0: \u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u09AC\u09BE\u0987 \u09AA\u09CD\u09B2\u09BE\u0997 \u09B2\u09CB\u09A1 \u09A5\u09C7\u0995\u09C7 \u09AE\u09BE\u09B8\u09C7 \u0986\u09A8\u09C1\u09AE\u09BE\u09A8\u09BF\u0995 \u09F3${payload.vampirePowerBDT} \u0985\u09AA\u099A\u09AF\u09BC \u09B9\u099A\u09CD\u099B\u09C7\u0964 \u09B8\u09CD\u09AE\u09BE\u09B0\u09CD\u099F \u09AA\u09CD\u09B2\u09BE\u0997 \u09AC\u09BE \u09B8\u09C1\u0987\u099A \u09AC\u09CD\u09AF\u09AC\u09B9\u09BE\u09B0 \u0995\u09B0\u09C7 \u098F\u0987 \u09B8\u09BE\u09B6\u09CD\u09B0\u09AF\u09BC \u09A8\u09BF\u09B6\u09CD\u099A\u09BF\u09A4 \u0995\u09B0\u09BE \u09B8\u09AE\u09CD\u09AD\u09AC\u0964`;
      return {
        summary: summary2,
        priorityActions: priorityActions2,
        explanation: explanation2,
        language: "bn"
      };
    }
    const summary = `${payload.householdName} is currently drawing ${payload.currentActiveWatts} W of active load with projected monthly consumption of ${payload.monthlyKwh} kWh (projected bill: \u09F3${payload.projectedBillBDT.toLocaleString("en-US", { maximumFractionDigits: 0 })}). Compared against your sanctioned load of ${payload.sanctionedLoadKw} kW and monthly budget of \u09F3${payload.monthlyBudgetBDT.toLocaleString("en-US", { maximumFractionDigits: 0 })}, usage is ${payload.overagePercentage > 0 ? `${payload.overagePercentage.toFixed(1)}% over your set budget.` : "well within your allocated monthly budget."}`;
    const priorityActions = (payload.deterministicRecommendations || []).slice(0, 3).map((rec) => ({
      title: rec.title,
      reason: rec.description,
      impact: rec.priority.toLowerCase()
    }));
    if (priorityActions.length === 0) {
      priorityActions.push(
        {
          title: "Shift Inductive Loads off Peak Hours",
          reason: "Avoid concurrent running of Air Conditioners and Water Geysers during national peak hours (5:00 PM \u2013 11:00 PM).",
          impact: "high"
        },
        {
          title: "Eliminate Phantom Standby Waste",
          reason: `Unplug idle appliances (microwave clocks, TV standby, set-top boxes) to reclaim ~\u09F3${payload.vampirePowerBDT}/month in wasted energy.`,
          impact: "medium"
        }
      );
    }
    const explanation = `1. DESCO LT-A Slab Context: Your household is currently consuming in "${payload.tariffSlabName}". Under Bangladesh BERC residential tariff rules, crossing into higher tiers incurs steeper marginal rates per kWh.
2. Sanctioned Demand Management: Your sanctioned load is ${payload.sanctionedLoadKw} kW. Keeping combined peak load under this threshold avoids utility demand penalties and feeder circuit breaker trips.
3. Standby Vampire Loads: Approximately \u09F3${payload.vampirePowerBDT}/month is lost to standby leakage. Using smart power strips for entertainment units and chargers delivers immediate recurring savings.`;
    return {
      summary,
      priorityActions,
      explanation,
      language: "en"
    };
  }
};

// backend/routes/v1/recommendations.ts
var router7 = Router7();
var db7 = SupabaseService.getInstance();
function isHouseholdAuthorized2(req, householdId) {
  if (!req.user) return false;
  if (req.user.role === "ADMIN") return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  if (householdId === "11111111-1111-4111-a111-111111111111" || householdId === "hh_gulshan_01") return true;
  return false;
}
router7.get("/", async (req, res) => {
  const householdId = req.query.householdId || "11111111-1111-4111-a111-111111111111";
  const dbSuggestions = await db7.getSuggestions(householdId);
  if (dbSuggestions && dbSuggestions.length > 0) {
    const formatted = dbSuggestions.map((s) => ({
      id: s.id,
      householdId: s.householdId,
      title: s.title,
      type: s.type,
      severity: s.severity,
      status: s.status,
      description: s.description,
      estimatedMonthlySavingsBDT: s.estimatedMonthlySavingsBDT,
      paybackPeriodMonths: s.type === "roi" ? 22 : void 0,
      actionableStep: s.actionableStep
    }));
    return res.json({ status: "success", data: formatted });
  }
  const appliances = await db7.getAppliances(householdId);
  const recommendations = RecommendationEngine.generateRecommendations(
    appliances,
    285,
    "Step 3 (201 - 300 kWh)"
  );
  res.json({ status: "success", data: recommendations });
});
router7.post("/ai-advisor", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required. Please log in." });
  }
  const { householdId = "11111111-1111-4111-a111-111111111111", language = "en" } = req.body || {};
  if (!isHouseholdAuthorized2(req, householdId)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household data." });
  }
  const lang = language === "bn" ? "bn" : "en";
  try {
    const household = await db7.getHouseholdById(householdId);
    const appliances = await db7.getAppliances(householdId);
    const rooms = await db7.getRooms(householdId);
    let currentActiveWatts = 0;
    for (const app2 of appliances) {
      if (db7.isApplianceOn(app2.id)) {
        currentActiveWatts += app2.ratedPowerW;
      }
    }
    const estimatedMonthlyKwh = 285;
    const sanctionedLoadKw = household?.sanctionedLoadKw || 3;
    const monthlyBudgetBDT = household?.monthlyBudgetBDT || 4500;
    const deterministicRecommendations = RecommendationEngine.generateRecommendations(
      appliances,
      estimatedMonthlyKwh,
      "Step 3 (201 - 300 kWh)"
    );
    const tariffCost = TariffCalculator.calculateCost(estimatedMonthlyKwh, sanctionedLoadKw);
    const budgetStatus = BudgetEngine.evaluateBudget(
      householdId,
      monthlyBudgetBDT,
      estimatedMonthlyKwh,
      15,
      30,
      sanctionedLoadKw
    );
    const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
    const totalVampireBDT = vampireReports.reduce((acc, v) => acc + v.monthlyWastedBDT, 0);
    const aiResult = await GeminiAdvisorService.generateAdvisory({
      householdName: household?.name || "Gulshan Residence",
      sanctionedLoadKw,
      currentActiveWatts,
      monthlyKwh: budgetStatus.projectedKwh,
      projectedBillBDT: budgetStatus.projectedCostBDT,
      monthlyBudgetBDT,
      overagePercentage: budgetStatus.overagePercentage,
      tariffSlabName: tariffCost.slabBreakdown?.[2]?.stepName || "Step 3 (201 - 300 kWh)",
      vampirePowerBDT: totalVampireBDT,
      topAppliances: appliances.slice(0, 5).map((a) => ({
        name: a.name,
        powerW: a.ratedPowerW,
        isOn: db7.isApplianceOn(a.id)
      })),
      deterministicRecommendations,
      language: lang
    });
    res.json({
      status: "success",
      data: {
        available: aiResult.available,
        aiAdvice: aiResult.aiAdvice,
        fallbackReason: aiResult.fallbackReason,
        sourceMetrics: {
          currentLoadW: currentActiveWatts,
          projectedBillBDT: budgetStatus.projectedCostBDT,
          monthlyBudgetBDT,
          vampireWasteBDT: totalVampireBDT,
          sanctionedLoadKw,
          tariffSlabName: "Step 3 (201 - 300 kWh)"
        },
        deterministicRecommendations
      }
    });
  } catch (err) {
    console.error("Error in AI advisor endpoint:", err);
    res.status(500).json({ status: "error", message: "Internal server error processing AI advisor." });
  }
});
router7.put("/:id", async (req, res) => {
  const { status } = req.body;
  const success = await db7.updateSuggestionStatus(req.params.id, status || "resolved");
  res.json({ status: success ? "success" : "error", message: `Recommendation marked as ${status}` });
});
var recommendations_default = router7;

// backend/routes/v1/reports.ts
import { Router as Router8 } from "express";

// backend/services/ReportService.ts
import PDFDocument from "pdfkit";
var ReportService = class {
  /**
   * Generates formatted CSV energy audit report string for export
   */
  static generateCSVReport(data) {
    const lines = [];
    const escapeCsv = (val) => {
      if (val === void 0 || val === null) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };
    lines.push("=== KILOWATTIQ SMART ENERGY AUDIT & ANALYTICS REPORT ===");
    lines.push(`Household Name,${escapeCsv(data.household.name)}`);
    lines.push(`Utility Provider,${escapeCsv(data.household.utilityProvider)}`);
    lines.push(`Account Number,${escapeCsv(data.household.accountNumber)}`);
    lines.push(`Sanctioned Capacity,${escapeCsv(data.household.sanctionedLoadKw)} kW`);
    lines.push(`Monthly Budget,BDT ${data.household.monthlyBudgetBDT}`);
    lines.push(`Reporting Period,${escapeCsv(data.reportingPeriod)}`);
    lines.push(`Report Generated Date,${escapeCsv(data.generatedAt)}`);
    lines.push("");
    lines.push("--- CONSUMPTION & ENERGY SUMMARY ---");
    lines.push(`Total Monthly Energy,${data.energySummary.totalMonthlyKwh} kWh`);
    lines.push(`Average Daily Consumption,${data.energySummary.avgDailyKwh} kWh/day`);
    lines.push(`Average Active Load,${data.energySummary.avgActivePowerW} W`);
    lines.push(`Peak Power Recorded,${data.energySummary.peakPowerW} W`);
    lines.push(`Peak Power Timestamp,${escapeCsv(data.energySummary.peakTimestamp)}`);
    lines.push("");
    lines.push("--- MONTHLY BILL BREAKDOWN (DESCO/DPDC BDT) ---");
    lines.push(`Tariff Type,${escapeCsv(data.costAnalysis.tariffType)}`);
    lines.push(`Energy Charge,BDT ${data.costAnalysis.energyCostBDT}`);
    lines.push(`Demand Charge,BDT ${data.costAnalysis.demandChargeBDT}`);
    lines.push(`Meter Rent,BDT ${data.costAnalysis.meterRentBDT}`);
    lines.push(`Govt VAT (5%),BDT ${data.costAnalysis.vatBDT}`);
    lines.push(`Gross Total Bill,BDT ${data.costAnalysis.grossTotalBDT}`);
    lines.push(`Effective Rate per kWh,BDT ${data.costAnalysis.effectiveRatePerKwh}`);
    lines.push("");
    if (data.costAnalysis.slabBreakdown && data.costAnalysis.slabBreakdown.length > 0) {
      lines.push("--- TARIFF SLAB STEP BREAKDOWN ---");
      lines.push("Slab Step,kWh in Slab,Rate per kWh (BDT),Cost in Slab (BDT)");
      for (const step of data.costAnalysis.slabBreakdown) {
        lines.push(`${escapeCsv(step.stepName)},${step.kwhInSlab},${step.rate},${step.costBDT}`);
      }
      lines.push("");
    }
    lines.push("--- BUDGET UTILIZATION STATUS ---");
    lines.push(`Target Monthly Budget,BDT ${data.budgetAnalysis.monthlyBudgetBDT}`);
    lines.push(`Current Spending (Est.),BDT ${data.budgetAnalysis.currentSpentBDT}`);
    lines.push(`Projected Month-End Cost,BDT ${data.budgetAnalysis.projectedCostBDT}`);
    lines.push(`Remaining Budget Balance,BDT ${data.budgetAnalysis.remainingBudgetBDT}`);
    lines.push(`Budget Utilization,${data.budgetAnalysis.budgetUtilizationPct}%`);
    lines.push(`Over-Budget Warning,${data.budgetAnalysis.isOverBudget ? "YES - OVER BUDGET" : "NO - WITHIN BUDGET"}`);
    lines.push("");
    lines.push("--- APPLIANCE ENERGY CONSUMPTION BREAKDOWN ---");
    lines.push("Appliance Name,Room,Rated Power (W),Monthly Est. kWh,Est. Monthly Cost (BDT),Status");
    for (const app2 of data.applianceAnalysis) {
      lines.push(`${escapeCsv(app2.name)},${escapeCsv(app2.roomName)},${app2.ratedPowerW},${app2.estimatedMonthlyKwh},${app2.estimatedMonthlyCostBDT},${app2.isOn ? "ON" : "OFF"}`);
    }
    lines.push("");
    lines.push("--- VAMPIRE / STANDBY POWER AUDIT ---");
    lines.push("Appliance Name,Room Area,Standby Power (W),Monthly Wasted (BDT),Annual Wasted (BDT),Severity");
    for (const v of data.vampirePowerAudit.reports) {
      lines.push(`${escapeCsv(v.applianceName)},${escapeCsv(v.roomName)},${v.standbyWatts},${v.monthlyWastedBDT},${v.annualWastedBDT},${escapeCsv(v.severity)}`);
    }
    lines.push(`Total Standby Load,${data.vampirePowerAudit.totalStandbyWatts} W`);
    lines.push(`Total Monthly Wasted Standby,BDT ${data.vampirePowerAudit.totalMonthlyWastedBDT}`);
    lines.push(`Total Annual Wasted Standby,BDT ${data.vampirePowerAudit.totalAnnualWastedBDT}`);
    lines.push("");
    lines.push("--- DETERMINISTIC RECOMMENDATIONS & EFFICIENCY ROI ---");
    lines.push("Priority,Title,Estimated Savings (BDT/mo),Actionable Step");
    for (const rec of data.recommendations) {
      lines.push(`${escapeCsv(rec.priority)},${escapeCsv(rec.title)},${rec.estimatedMonthlySavingsBDT},${escapeCsv(rec.actionableStep)}`);
    }
    lines.push("");
    if (data.roiAnalyses && data.roiAnalyses.length > 0) {
      lines.push("--- APPLIANCE UPGRADE ROI ---");
      lines.push("Current Appliance,Proposed Upgrade,Investment (BDT),Monthly Savings (BDT),Payback (Months),5-Yr Net Savings (BDT)");
      for (const roi of data.roiAnalyses) {
        lines.push(`${escapeCsv(roi.currentAppliance)},${escapeCsv(roi.proposedAppliance)},${roi.initialInvestmentBDT},${roi.monthlySavingsBDT},${roi.paybackPeriodMonths},${roi.fiveYearNetSavingsBDT}`);
      }
      lines.push("");
    }
    if (data.aiAdvice) {
      lines.push("--- AI ENERGY ADVISOR EXECUTIVE INSIGHTS ---");
      lines.push(`AI Summary,${escapeCsv(data.aiAdvice.summary)}`);
      lines.push("Priority Actions:");
      for (const act of data.aiAdvice.priorityActions) {
        lines.push(`- [${act.impact.toUpperCase()}] ${escapeCsv(act.title)}: ${escapeCsv(act.reason)}`);
      }
      lines.push(`Explanation,${escapeCsv(data.aiAdvice.explanation)}`);
      lines.push("");
    }
    return lines.join("\n");
  }
  /**
   * Generates a PDF buffer using PDFKit for official energy report download
   */
  static async generatePDFReport(data) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: "A4",
          margin: 36,
          bufferPages: true
        });
        const buffers = [];
        doc.on("data", (b) => buffers.push(b));
        doc.on("end", () => resolve(Buffer.concat(buffers)));
        doc.on("error", (err) => reject(err));
        const primaryColor = "#0f172a";
        const accentEmerald = "#059669";
        const textColor = "#1e293b";
        const mutedTextColor = "#64748b";
        const tableBgHeader = "#f1f5f9";
        const tableBgAlt = "#f8fafc";
        doc.rect(36, 36, 523, 60).fill(primaryColor);
        doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text("KILOWATTIQ", 50, 48);
        doc.fillColor("#10b981").fontSize(11).font("Helvetica-Bold").text("ENERGY AUDIT & ANALYTICS REPORT", 50, 68);
        doc.fillColor("#94a3b8").fontSize(9).font("Helvetica").text(`Reporting Period: ${data.reportingPeriod}`, 320, 50, { align: "right", width: 220 });
        doc.text(`Generated: ${data.generatedAt}`, 320, 65, { align: "right", width: 220 });
        let y = 110;
        doc.rect(36, y, 523, 65).fillAndStroke("#f8fafc", "#cbd5e1");
        doc.fillColor(primaryColor).fontSize(11).font("Helvetica-Bold").text("HOUSEHOLD INFORMATION", 48, y + 10);
        doc.fontSize(9).font("Helvetica").fillColor(textColor);
        doc.text(`Household Name: ${data.household.name}`, 48, y + 28);
        doc.text(`Account Serial: ${data.household.accountNumber}`, 48, y + 42);
        doc.text(`Utility Provider: ${data.household.utilityProvider}`, 300, y + 28);
        doc.text(`Sanctioned Capacity: ${data.household.sanctionedLoadKw} kW`, 300, y + 42);
        y += 80;
        doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("1. Executive Energy & Billing Summary", 36, y);
        y += 18;
        const summaryBoxWidth = 120;
        const summaryBoxHeight = 50;
        doc.rect(36, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, "#e2e8f0");
        doc.fillColor(mutedTextColor).fontSize(8).font("Helvetica-Bold").text("TOTAL CONSUMPTION", 42, y + 8);
        doc.fillColor(primaryColor).fontSize(13).font("Helvetica-Bold").text(`${data.energySummary.totalMonthlyKwh} kWh`, 42, y + 24);
        doc.rect(170, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, "#e2e8f0");
        doc.fillColor(mutedTextColor).fontSize(8).font("Helvetica-Bold").text("PROJECTED BILL (BDT)", 176, y + 8);
        doc.fillColor(accentEmerald).fontSize(13).font("Helvetica-Bold").text(`BDT ${data.costAnalysis.grossTotalBDT}`, 176, y + 24);
        doc.rect(304, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, "#e2e8f0");
        doc.fillColor(mutedTextColor).fontSize(8).font("Helvetica-Bold").text("MONTHLY BUDGET", 310, y + 8);
        doc.fillColor("#d97706").fontSize(13).font("Helvetica-Bold").text(`BDT ${data.household.monthlyBudgetBDT}`, 310, y + 24);
        doc.rect(438, y, summaryBoxWidth, summaryBoxHeight).fillAndStroke(tableBgAlt, "#e2e8f0");
        doc.fillColor(mutedTextColor).fontSize(8).font("Helvetica-Bold").text("EFFECTIVE RATE", 444, y + 8);
        doc.fillColor(textColor).fontSize(13).font("Helvetica-Bold").text(`BDT ${data.costAnalysis.effectiveRatePerKwh}/kWh`, 444, y + 24);
        y += 65;
        doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("2. DESCO/DPDC LT-A Tariff Step Breakdown", 36, y);
        y += 18;
        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
        doc.text("Slab Tier", 46, y + 5);
        doc.text("kWh in Slab", 200, y + 5);
        doc.text("Rate (BDT/kWh)", 330, y + 5);
        doc.text("Cost in Slab (BDT)", 440, y + 5);
        y += 20;
        if (data.costAnalysis.slabBreakdown) {
          data.costAnalysis.slabBreakdown.forEach((slab, i) => {
            if (i % 2 === 1) {
              doc.rect(36, y, 523, 18).fill(tableBgAlt);
            }
            doc.fillColor(textColor).fontSize(8.5).font("Helvetica");
            doc.text(slab.stepName, 46, y + 4);
            doc.text(`${slab.kwhInSlab} kWh`, 200, y + 4);
            doc.text(`BDT ${slab.rate.toFixed(2)}`, 330, y + 4);
            doc.text(`BDT ${slab.costBDT.toFixed(2)}`, 440, y + 4);
            y += 18;
          });
        }
        y += 5;
        doc.fontSize(8.5).font("Helvetica").fillColor(mutedTextColor);
        doc.text(`Energy Charge: BDT ${data.costAnalysis.energyCostBDT} | Demand Charge: BDT ${data.costAnalysis.demandChargeBDT} | Meter Rent: BDT ${data.costAnalysis.meterRentBDT} | VAT (5%): BDT ${data.costAnalysis.vatBDT}`, 46, y);
        y += 25;
        doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("3. Household Appliance Energy Breakdown", 36, y);
        y += 18;
        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
        doc.text("Appliance", 46, y + 5);
        doc.text("Room", 180, y + 5);
        doc.text("Power (W)", 280, y + 5);
        doc.text("Est. Monthly kWh", 370, y + 5);
        doc.text("Est. Cost (BDT)", 470, y + 5);
        y += 20;
        data.applianceAnalysis.slice(0, 6).forEach((app2, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          doc.fillColor(textColor).fontSize(8.5).font("Helvetica");
          doc.text(app2.name, 46, y + 4);
          doc.text(app2.roomName, 180, y + 4);
          doc.text(`${app2.ratedPowerW} W`, 280, y + 4);
          doc.text(`${app2.estimatedMonthlyKwh} kWh`, 370, y + 4);
          doc.text(`BDT ${app2.estimatedMonthlyCostBDT}`, 470, y + 4);
          y += 18;
        });
        y += 20;
        doc.addPage();
        y = 36;
        doc.rect(36, y, 523, 30).fill(primaryColor);
        doc.fillColor("#ffffff").fontSize(11).font("Helvetica-Bold").text("KILOWATTIQ \u2022 VAMPIRE AUDIT & AI ADVISORY", 48, y + 10);
        y += 45;
        doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("4. Vampire / Standby Power Loss Audit", 36, y);
        y += 18;
        doc.rect(36, y, 523, 20).fill(tableBgHeader);
        doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
        doc.text("Appliance", 46, y + 5);
        doc.text("Room", 180, y + 5);
        doc.text("Standby W", 270, y + 5);
        doc.text("Monthly Loss (BDT)", 360, y + 5);
        doc.text("Annual Loss (BDT)", 460, y + 5);
        y += 20;
        data.vampirePowerAudit.reports.forEach((v, i) => {
          if (i % 2 === 1) {
            doc.rect(36, y, 523, 18).fill(tableBgAlt);
          }
          doc.fillColor(textColor).fontSize(8.5).font("Helvetica");
          doc.text(v.applianceName, 46, y + 4);
          doc.text(v.roomName, 180, y + 4);
          doc.text(`${v.standbyWatts} W`, 270, y + 4);
          doc.text(`BDT ${v.monthlyWastedBDT}`, 360, y + 4);
          doc.text(`BDT ${v.annualWastedBDT}`, 460, y + 4);
          y += 18;
        });
        y += 10;
        doc.rect(36, y, 523, 22).fillAndStroke("#fef2f2", "#fca5a5");
        doc.fillColor("#b91c1c").fontSize(9).font("Helvetica-Bold");
        doc.text(`Total Standby Waste: ${data.vampirePowerAudit.totalStandbyWatts} W  |  Monthly Loss: BDT ${data.vampirePowerAudit.totalMonthlyWastedBDT}  |  Annual Wasted: BDT ${data.vampirePowerAudit.totalAnnualWastedBDT}`, 46, y + 6);
        y += 35;
        doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("5. Deterministic Recommendations", 36, y);
        y += 18;
        data.recommendations.forEach((rec) => {
          doc.rect(36, y, 523, 35).fillAndStroke(tableBgAlt, "#e2e8f0");
          doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold").text(`[${rec.priority}] ${rec.title}`, 44, y + 6);
          doc.fillColor(accentEmerald).fontSize(9).font("Helvetica-Bold").text(`Save BDT ${rec.estimatedMonthlySavingsBDT}/mo`, 380, y + 6, { align: "right", width: 170 });
          doc.fillColor(textColor).fontSize(8).font("Helvetica").text(rec.actionableStep, 44, y + 20, { width: 500 });
          y += 40;
        });
        y += 10;
        if (data.aiAdvice) {
          doc.fillColor(accentEmerald).fontSize(12).font("Helvetica-Bold").text("6. Server-Side Gemini AI Energy Advisory", 36, y);
          y += 18;
          doc.rect(36, y, 523, 80).fillAndStroke("#f0fdf4", "#86efac");
          doc.fillColor("#166534").fontSize(9.5).font("Helvetica-Bold").text("Executive AI Advisory Summary", 46, y + 8);
          doc.fillColor(textColor).fontSize(8.5).font("Helvetica").text(data.aiAdvice.summary, 46, y + 22, { width: 503 });
          y += 90;
        }
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          doc.fontSize(8).font("Helvetica").fillColor(mutedTextColor);
          doc.text(
            "KilowattIQ Smart Energy Management Platform \u2022 Verified DESCO/DPDC Tariff Slabs \u2022 Page " + (i + 1) + " of " + range.count,
            36,
            800,
            { align: "center", width: 523 }
          );
        }
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
};

// backend/routes/v1/reports.ts
var router8 = Router8();
var db8 = SupabaseService.getInstance();
function isHouseholdAuthorized3(req, householdId) {
  if (!req.user) return false;
  if (req.user.role === "ADMIN") return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  if (householdId === "11111111-1111-4111-a111-111111111111" || householdId === "hh_gulshan_01") return true;
  return false;
}
async function buildReportData(householdId) {
  const household = await db8.getHouseholdById(householdId);
  if (!household) return null;
  const rooms = await db8.getRooms(householdId);
  const appliances = await db8.getAppliances(householdId);
  const totalMonthlyKwh = 285;
  const sanctionedLoadKw = household.sanctionedLoadKw || 3;
  const monthlyBudgetBDT = household.monthlyBudgetBDT || 4500;
  const costCalc = TariffCalculator.calculateCost(totalMonthlyKwh, sanctionedLoadKw, "SLAB");
  const budgetStatus = BudgetEngine.evaluateBudget(
    householdId,
    monthlyBudgetBDT,
    180,
    18,
    30,
    sanctionedLoadKw,
    "SLAB"
  );
  const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
  const totalStandbyWatts = vampireReports.reduce((acc, v) => acc + v.standbyWatts, 0);
  const totalMonthlyWastedBDT = vampireReports.reduce((acc, v) => acc + v.monthlyWastedBDT, 0);
  const totalAnnualWastedBDT = vampireReports.reduce((acc, v) => acc + v.annualWastedBDT, 0);
  const recommendations = RecommendationEngine.generateRecommendations(
    appliances,
    totalMonthlyKwh,
    costCalc.slabBreakdown?.[2]?.stepName || "Step 3 (201 - 300 kWh)"
  );
  const roiAnalyses = [
    ROICalculator.calculateUpgradeROI("1.5T Non-Inverter AC", "1.5T 5-Star Inverter AC", 1650, 1050, 7, 62e3, 8.02),
    ROICalculator.calculateUpgradeROI("75W Standard Fan", "28W BLDC Fan", 75, 28, 12, 4200, 8.02)
  ];
  const roomMap = /* @__PURE__ */ new Map();
  for (const r of rooms) {
    roomMap.set(r.id, r.name);
  }
  const applianceAnalysis = appliances.map((app2) => {
    const isOn = db8.isApplianceOn(app2.id);
    const estimatedMonthlyKwh = Math.round(app2.ratedPowerW * (app2.averageHoursPerDay || 4) * 30 / 1e3);
    const estimatedMonthlyCostBDT = Math.round(estimatedMonthlyKwh * costCalc.effectiveRatePerKwh);
    return {
      id: app2.id,
      name: app2.name,
      roomName: roomMap.get(app2.roomId) || "Living Area",
      ratedPowerW: app2.ratedPowerW,
      estimatedMonthlyKwh,
      estimatedMonthlyCostBDT,
      isOn
    };
  });
  const now = /* @__PURE__ */ new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    household: {
      id: household.id,
      name: household.name,
      utilityProvider: household.utilityProvider || "DESCO",
      accountNumber: household.accountNumber || "ACC-8849201",
      sanctionedLoadKw,
      monthlyBudgetBDT
    },
    reportingPeriod: `${now.toLocaleString("default", { month: "long" })} ${now.getFullYear()}`,
    generatedAt: now.toISOString().replace("T", " ").substring(0, 19),
    energySummary: {
      totalMonthlyKwh,
      avgDailyKwh: Number((totalMonthlyKwh / 30).toFixed(1)),
      avgActivePowerW: 395,
      peakPowerW: 3420,
      peakTimestamp: `${yearMonth}-10 19:45:00`
    },
    costAnalysis: costCalc,
    budgetAnalysis: {
      monthlyBudgetBDT,
      currentSpentBDT: budgetStatus.currentSpentBDT,
      projectedKwh: budgetStatus.projectedKwh,
      projectedCostBDT: budgetStatus.projectedCostBDT,
      remainingBudgetBDT: Math.max(0, monthlyBudgetBDT - budgetStatus.projectedCostBDT),
      budgetUtilizationPct: Math.round(budgetStatus.projectedCostBDT / monthlyBudgetBDT * 100),
      isOverBudget: budgetStatus.isOverageLikely
    },
    applianceAnalysis,
    vampirePowerAudit: {
      totalStandbyWatts,
      totalMonthlyWastedBDT,
      totalAnnualWastedBDT,
      reports: vampireReports
    },
    recommendations,
    roiAnalyses
  };
}
router8.get("/data", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required." });
  }
  const householdId = req.query.householdId || "11111111-1111-4111-a111-111111111111";
  if (!isHouseholdAuthorized3(req, householdId)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household data." });
  }
  try {
    const data = await buildReportData(householdId);
    if (!data) {
      return res.status(404).json({ status: "error", message: "Household not found" });
    }
    return res.json({ status: "success", data });
  } catch (err) {
    console.error("Error fetching report data:", err);
    return res.status(500).json({ status: "error", message: "Internal server error compiling report data." });
  }
});
router8.get("/export", async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ status: "error", message: "Authentication required. Please log in." });
  }
  const householdId = req.query.householdId || "11111111-1111-4111-a111-111111111111";
  const format = req.query.format?.toLowerCase() === "pdf" ? "pdf" : "csv";
  if (!isHouseholdAuthorized3(req, householdId)) {
    return res.status(403).json({ status: "error", message: "Access denied to requested household report." });
  }
  try {
    const reportData = await buildReportData(householdId);
    if (!reportData) {
      return res.status(404).json({ status: "error", message: "Household not found" });
    }
    const now = /* @__PURE__ */ new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (format === "pdf") {
      const pdfBuffer = await ReportService.generatePDFReport(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=kilowattiq-energy-report-${dateStr}.pdf`);
      return res.status(200).send(pdfBuffer);
    } else {
      const csvContent = ReportService.generateCSVReport(reportData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=kilowattiq-energy-report-${dateStr}.csv`);
      return res.status(200).send(csvContent);
    }
  } catch (err) {
    console.error("Error generating report export:", err);
    return res.status(500).json({ status: "error", message: "Internal server error exporting report." });
  }
});
var reports_default = router8;

// backend/routes/v1/admin.ts
import { Router as Router9 } from "express";
var router9 = Router9();
var db9 = SupabaseService.getInstance();
router9.get("/overview", async (req, res) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ status: "error", message: "Forbidden: Admin access required." });
  }
  const households = await db9.getHouseholds(req.user.id);
  const devices = await db9.getDevices("11111111-1111-4111-a111-111111111111");
  res.json({
    status: "success",
    data: {
      systemHealth: "OPERATIONAL",
      activeAdapters: ["MockAdapter", "TuyaAdapter", "MQTTAdapter", "DESCOAdapter", "CompositeAdapter"],
      totalMonitoredHouseholds: households.length,
      totalConnectedIoTDevices: devices.length,
      nationalGridFrequencyHz: 50,
      supabaseStatus: db9.isUsingMock() ? "MOCK_FALLBACK_MODE" : "LIVE_SUPABASE_CONNECTED",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
});
var admin_default = router9;

// backend/routes/v1/system.ts
import { Router as Router10 } from "express";
var router10 = Router10();
router10.get("/supabase-test", async (req, res) => {
  const db12 = SupabaseService.getInstance();
  const urlConfigured = Boolean(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes("your-supabase-project"));
  const secretConfigured = Boolean(
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) && !process.env.SUPABASE_SERVICE_ROLE_KEY?.includes("your-service-role-key")
  );
  const isMock = db12.isUsingMock();
  const testResult = await db12.testDatabaseConnection();
  if (testResult.success) {
    return res.status(200).json({
      success: true,
      message: testResult.details?.note || "Supabase PostgreSQL connection successfully verified.",
      data: {
        service: "KilowattIQ API",
        supabaseUrlConfigured: urlConfigured ? "YES" : "NO",
        supabaseSecretConfigured: secretConfigured ? "YES" : "NO",
        usingMockData: isMock,
        databaseStatus: testResult.databaseStatus,
        connectionTestDetails: testResult.details
      }
    });
  } else {
    return res.status(503).json({
      success: false,
      message: "Supabase PostgreSQL connection test failed.",
      error: testResult.error,
      data: {
        service: "KilowattIQ API",
        supabaseUrlConfigured: urlConfigured ? "YES" : "NO",
        supabaseSecretConfigured: secretConfigured ? "YES" : "NO",
        usingMockData: isMock,
        databaseStatus: "disconnected"
      }
    });
  }
});
var system_default = router10;

// backend/routes/v1/tariffs.ts
import { Router as Router11 } from "express";
var router11 = Router11();
var db10 = SupabaseService.getInstance();
router11.get("/", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const tariffData = await db10.getTariffs(householdId);
  res.json({ status: "success", data: tariffData });
});
var tariffs_default = router11;

// backend/routes/v1/budgets.ts
import { Router as Router12 } from "express";
var router12 = Router12();
var db11 = SupabaseService.getInstance();
router12.get("/", async (req, res) => {
  const householdId = req.query.householdId || "hh_gulshan_01";
  const budgetData = await db11.getBudgets(householdId);
  res.json({ status: "success", data: budgetData });
});
var budgets_default = router12;

// backend/app.ts
var app = express();
app.use((req, res, next) => {
  const matchedPath = req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"];
  if (matchedPath && (req.url === "/api" || req.url === "/api/") && matchedPath !== req.url) {
    req.url = matchedPath;
  }
  next();
});
app.use(express.json());
app.use(requestLogger);
app.use(authMiddleware);
var handleHealthCheck = async (req, res) => {
  const db12 = SupabaseService.getInstance();
  const testResult = await db12.testDatabaseConnection();
  if (testResult.success) {
    return res.status(200).json({
      success: true,
      data: {
        service: "KilowattIQ API",
        database: "Supabase PostgreSQL",
        databaseStatus: "connected"
      }
    });
  } else {
    return res.status(503).json({
      success: false,
      data: {
        service: "KilowattIQ API",
        database: "Supabase PostgreSQL",
        databaseStatus: "disconnected",
        error: testResult.error
      }
    });
  }
};
app.get(["/", "/api"], (req, res) => {
  res.json({
    status: "success",
    service: "KilowattIQ Backend API",
    version: "1.0.0",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/health", handleHealthCheck);
app.get("/api/v1/health", handleHealthCheck);
app.get("/health", handleHealthCheck);
app.get("/v1/health", handleHealthCheck);
var routes = [
  { path: "auth", router: auth_default },
  { path: "profile", router: profile_default },
  { path: "my-households", router: households_default },
  { path: "households", router: households_default },
  { path: "devices", router: devices_default },
  { path: "telemetry", router: telemetry_default },
  { path: "analytics", router: analytics_default },
  { path: "recommendations", router: recommendations_default },
  { path: "reports", router: reports_default },
  { path: "admin", router: admin_default },
  { path: "system", router: system_default },
  { path: "tariffs", router: tariffs_default },
  { path: "budgets", router: budgets_default }
];
for (const { path, router: router13 } of routes) {
  app.use(`/api/v1/${path}`, router13);
  app.use(`/v1/${path}`, router13);
  app.use(`/api/${path}`, router13);
  app.use(`/${path}`, router13);
}
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    statusCode: 404,
    message: `API endpoint not found: ${req.method} ${req.originalUrl || req.url}`
  });
});
app.use(errorHandler);
var app_default = app;

// api_entry.ts
function handler(req, res) {
  try {
    const matchedPath = req.headers["x-matched-path"] || req.headers["x-vercel-matched-path"];
    if (matchedPath && typeof matchedPath === "string" && (req.url === "/api" || req.url === "/api/")) {
      req.url = matchedPath;
    }
    return app_default(req, res);
  } catch (err) {
    console.error("[Vercel Serverless Invocation Error]:", err);
    return res.status(500).json({
      status: "error",
      statusCode: 500,
      message: err?.message || "Serverless function invocation error"
    });
  }
}
export {
  handler as default
};
