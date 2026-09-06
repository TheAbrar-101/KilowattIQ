-- ====================================================================
-- KilowattIQ Smart Energy Management Schema Migration
-- Migration: 20260810000000_complete_kilowattiq_schema.sql
-- Target: Supabase PostgreSQL
-- ====================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'household_user' CHECK (role IN ('household_user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HOUSEHOLDS
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    utility_provider TEXT NOT NULL CHECK (utility_provider IN ('DESCO', 'DPDC', 'NESCO', 'BREB', 'WZPDCL', 'OTHER')),
    account_number TEXT,
    sanctioned_load_kw NUMERIC(8,2) NOT NULL DEFAULT 5.00 CHECK (sanctioned_load_kw > 0),
    address_street TEXT,
    address_city TEXT DEFAULT 'Dhaka',
    address_area TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. HOUSEHOLD MEMBERS
CREATE TABLE IF NOT EXISTS public.household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT household_members_unique_user UNIQUE (household_id, user_id)
);

-- 4. ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor_level INTEGER DEFAULT 1,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. APPLIANCES
CREATE TABLE IF NOT EXISTS public.appliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    rated_power_w NUMERIC(10,2) NOT NULL CHECK (rated_power_w >= 0),
    standby_power_w NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (standby_power_w >= 0),
    purchase_price_bdt NUMERIC(12,2) CHECK (purchase_price_bdt IS NULL OR purchase_price_bdt >= 0),
    purchase_date DATE,
    star_rating INTEGER CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5)),
    is_vampire_risk BOOLEAN NOT NULL DEFAULT false,
    is_inverter_type BOOLEAN NOT NULL DEFAULT false,
    average_hours_per_day NUMERIC(4,2) NOT NULL DEFAULT 4.00 CHECK (average_hours_per_day >= 0 AND average_hours_per_day <= 24),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. DEVICES (IoT & Smart Meters)
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
    appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('SMART_METER', 'SMART_PLUG', 'ESP32_PZEM', 'VIRTUAL_DEVICE', 'DESCO_AMI')),
    adapter_type TEXT NOT NULL CHECK (adapter_type IN ('MockAdapter', 'TuyaAdapter', 'MQTTAdapter', 'DESCOAdapter')),
    integration_tier TEXT NOT NULL DEFAULT 'tier_1' CHECK (integration_tier IN ('tier_0', 'tier_1', 'tier_2')),
    mac_or_serial TEXT,
    mqtt_topic TEXT,
    is_online BOOLEAN NOT NULL DEFAULT true,
    last_seen TIMESTAMPTZ,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. READINGS (Time-series energy data)
CREATE TABLE IF NOT EXISTS public.readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    power_watts NUMERIC(10,2) NOT NULL CHECK (power_watts >= 0),
    voltage_v NUMERIC(6,2),
    current_a NUMERIC(8,3),
    power_factor NUMERIC(4,3) CHECK (power_factor IS NULL OR (power_factor >= 0 AND power_factor <= 1)),
    frequency_hz NUMERIC(5,2),
    energy_kwh NUMERIC(12,4),
    cumulative_energy_kwh NUMERIC(14,4),
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'standby', 'offline'))
);

CREATE INDEX IF NOT EXISTS idx_readings_device_time ON public.readings (device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_readings_household_time ON public.readings (household_id, timestamp DESC);

-- 8. TARIFFS
CREATE TABLE IF NOT EXISTS public.tariffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,
    utility_provider TEXT NOT NULL,
    tariff_type TEXT NOT NULL CHECK (tariff_type IN ('flat_rate', 'time_of_use', 'tiered', 'seasonal')),
    tariff_code TEXT NOT NULL,
    effective_date DATE NOT NULL,
    expiry_date DATE,
    vat_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    demand_charge_per_kw_bdt NUMERIC(10,2) NOT NULL DEFAULT 42.00,
    meter_rent_bdt NUMERIC(10,2) NOT NULL DEFAULT 40.00,
    is_system_global BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TARIFF RATE RULES (Slab / Tier breakdown)
CREATE TABLE IF NOT EXISTS public.tariff_rate_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tariff_id UUID NOT NULL REFERENCES public.tariffs(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    slab_min_kwh NUMERIC(10,2) NOT NULL DEFAULT 0,
    slab_max_kwh NUMERIC(10,2),
    rate_bdt_per_kwh NUMERIC(10,4) NOT NULL CHECK (rate_bdt_per_kwh >= 0),
    time_of_day_start TIME,
    time_of_day_end TIME,
    start_month INTEGER CHECK (start_month IS NULL OR (start_month >= 1 AND start_month <= 12)),
    end_month INTEGER CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12))
);

-- 10. BUDGETS
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    target_monthly_bdt NUMERIC(12,2) NOT NULL CHECK (target_monthly_bdt > 0),
    target_monthly_kwh NUMERIC(10,2),
    alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 100),
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT budgets_unique_household_period UNIQUE (household_id, month, year)
);

-- 11. BUDGET HISTORY
CREATE TABLE IF NOT EXISTS public.budget_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL CHECK (year >= 2020),
    target_bdt NUMERIC(12,2) NOT NULL,
    actual_spend_bdt NUMERIC(12,2) NOT NULL DEFAULT 0,
    projected_spend_bdt NUMERIC(12,2),
    overage_bdt NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT budget_history_unique_household_period UNIQUE (household_id, month, year)
);

-- 12. SUGGESTIONS
CREATE TABLE IF NOT EXISTS public.suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('standby', 'diagnostic', 'roi', 'budget')),
    severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
    description TEXT NOT NULL,
    estimated_monthly_savings_bdt NUMERIC(10,2) DEFAULT 0,
    actionable_step TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. DEVICE CREDENTIALS (SENSITIVE - RESTRICTED FROM NORMAL HOUSEHOLD USERS)
CREATE TABLE IF NOT EXISTS public.device_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
    api_key TEXT,
    mqtt_username TEXT,
    mqtt_password TEXT,
    access_token TEXT,
    refresh_token TEXT,
    auth_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT device_credentials_unique_device UNIQUE (device_id)
);

-- 14. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additional Performance Indexes
CREATE INDEX IF NOT EXISTS idx_household_members_user ON public.household_members (user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_household ON public.rooms (household_id);
CREATE INDEX IF NOT EXISTS idx_appliances_household ON public.appliances (household_id);
CREATE INDEX IF NOT EXISTS idx_devices_household ON public.devices (household_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_household ON public.suggestions (household_id);

-- ====================================================================
-- SECURITY FUNCTIONS & ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Helper function to check household membership safely (SECURITY DEFINER prevents recursion)
CREATE OR REPLACE FUNCTION public.is_household_member(lookup_household_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.household_members
    WHERE household_id = lookup_household_id
      AND user_id = auth.uid()
  );
$$;

-- Helper function to check admin role safely
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

-- Enable RLS on all 14 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_rate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
DROP POLICY IF EXISTS "Users view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users view own profile or admins view all"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- 2. Households Policies
DROP POLICY IF EXISTS "Members or admins view households" ON public.households;
CREATE POLICY "Members or admins view households"
  ON public.households FOR SELECT
  USING (public.is_household_member(id) OR public.is_admin());

DROP POLICY IF EXISTS "Authenticated users create households" ON public.households;
CREATE POLICY "Authenticated users create households"
  ON public.households FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Members or admins update households" ON public.households;
CREATE POLICY "Members or admins update households"
  ON public.households FOR UPDATE
  USING (public.is_household_member(id) OR public.is_admin());

-- 3. Household Members Policies
DROP POLICY IF EXISTS "Members view household membership" ON public.household_members;
CREATE POLICY "Members view household membership"
  ON public.household_members FOR SELECT
  USING (public.is_household_member(household_id) OR user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Owners or admins manage household members" ON public.household_members;
CREATE POLICY "Owners or admins manage household members"
  ON public.household_members FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 4. Rooms Policies
DROP POLICY IF EXISTS "Household members manage rooms" ON public.rooms;
CREATE POLICY "Household members manage rooms"
  ON public.rooms FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 5. Appliances Policies
DROP POLICY IF EXISTS "Household members manage appliances" ON public.appliances;
CREATE POLICY "Household members manage appliances"
  ON public.appliances FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 6. Devices Policies
DROP POLICY IF EXISTS "Household members manage devices" ON public.devices;
CREATE POLICY "Household members manage devices"
  ON public.devices FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 7. Readings Policies
DROP POLICY IF EXISTS "Household members view readings" ON public.readings;
CREATE POLICY "Household members view readings"
  ON public.readings FOR SELECT
  USING (public.is_household_member(household_id) OR public.is_admin());

DROP POLICY IF EXISTS "Household members insert readings" ON public.readings;
CREATE POLICY "Household members insert readings"
  ON public.readings FOR INSERT
  WITH CHECK (public.is_household_member(household_id) OR public.is_admin());

-- 8. Tariffs Policies
DROP POLICY IF EXISTS "Members view tariffs" ON public.tariffs;
CREATE POLICY "Members view tariffs"
  ON public.tariffs FOR SELECT
  USING (is_system_global = true OR public.is_household_member(household_id) OR public.is_admin());

DROP POLICY IF EXISTS "Members or admins manage tariffs" ON public.tariffs;
CREATE POLICY "Members or admins manage tariffs"
  ON public.tariffs FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 9. Tariff Rate Rules Policies
DROP POLICY IF EXISTS "Members view tariff rate rules" ON public.tariff_rate_rules;
CREATE POLICY "Members view tariff rate rules"
  ON public.tariff_rate_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tariffs
      WHERE tariffs.id = tariff_rate_rules.tariff_id
        AND (tariffs.is_system_global = true OR public.is_household_member(tariffs.household_id) OR public.is_admin())
    )
  );

-- 10. Budgets Policies
DROP POLICY IF EXISTS "Household members manage budgets" ON public.budgets;
CREATE POLICY "Household members manage budgets"
  ON public.budgets FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 11. Budget History Policies
DROP POLICY IF EXISTS "Household members view budget history" ON public.budget_history;
CREATE POLICY "Household members view budget history"
  ON public.budget_history FOR SELECT
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 12. Suggestions Policies
DROP POLICY IF EXISTS "Household members manage suggestions" ON public.suggestions;
CREATE POLICY "Household members manage suggestions"
  ON public.suggestions FOR ALL
  USING (public.is_household_member(household_id) OR public.is_admin());

-- 13. Device Credentials Policies (RESTRICTED TO ADMINS / SERVICE ROLE ONLY)
DROP POLICY IF EXISTS "Admins only access device credentials" ON public.device_credentials;
CREATE POLICY "Admins only access device credentials"
  ON public.device_credentials FOR ALL
  USING (public.is_admin());

-- 14. Audit Logs Policies
DROP POLICY IF EXISTS "Users view relevant audit logs" ON public.audit_logs;
CREATE POLICY "Users view relevant audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    (household_id IS NOT NULL AND public.is_household_member(household_id))
    OR user_id = auth.uid()
    OR public.is_admin()
  );
