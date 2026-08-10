-- KilowattIQ Complete Supabase PostgreSQL Schema Migration
-- Migration: 20260810000000_complete_kilowattiq_schema.sql

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'household_user' CHECK (role IN ('household_user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HOUSEHOLDS TABLE
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  utility_provider TEXT NOT NULL CHECK (utility_provider IN ('DESCO', 'DPDC', 'BPDB', 'REB', 'WZPDCL', 'NESCO')),
  account_number TEXT,
  sanctioned_load_kw NUMERIC(10,2) NOT NULL DEFAULT 4.5,
  monthly_budget_bdt NUMERIC(10,2) NOT NULL DEFAULT 4500.00,
  address_division TEXT DEFAULT 'Dhaka',
  address_city TEXT DEFAULT 'Dhaka',
  address_area TEXT DEFAULT 'Gulshan',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. HOUSEHOLD MEMBERS TABLE
CREATE TABLE IF NOT EXISTS public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('owner', 'member', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_household_user UNIQUE (household_id, user_id)
);

-- 4. ROOMS TABLE
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor_level INT DEFAULT 1,
  icon TEXT DEFAULT 'home',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. APPLIANCES TABLE
CREATE TABLE IF NOT EXISTS public.appliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  device_id UUID, -- Foreign key added after devices table creation
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'AIR_CONDITIONER', 'REFRIGERATOR', 'TELEVISION', 'FAN', 
    'WATER_HEATER', 'WASHING_MACHINE', 'MICROWAVE', 'LIGHTING', 
    'ROUTER', 'MAIN_FEED', 'OTHER'
  )),
  rated_wattage NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  standby_wattage NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  purchase_price NUMERIC(10,2) DEFAULT 0.00,
  purchase_date DATE,
  average_hours_per_day NUMERIC(4,2) DEFAULT 0.00,
  is_inverter_type BOOLEAN DEFAULT FALSE,
  energy_rating_stars INT DEFAULT 3 CHECK (energy_rating_stars BETWEEN 1 AND 5),
  is_vampire_risk BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. DEVICES TABLE
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type IN (
    'smart_meter', 'smart_plug', 'circuit_sensor', 'virtual/mock_device',
    'SMART_METER', 'SMART_PLUG', 'CIRCUIT_SENSOR', 'ESP32_PZEM'
  )),
  integration_tier TEXT NOT NULL DEFAULT 'tier_1' CHECK (integration_tier IN ('tier_0', 'tier_1', 'tier_2')),
  adapter_type TEXT NOT NULL CHECK (adapter_type IN (
    'mock', 'tuya', 'mqtt', 'desco',
    'MockAdapter', 'TuyaAdapter', 'MQTTAdapter', 'DESCOAdapter', 'CompositeAdapter'
  )),
  protocol TEXT DEFAULT 'HTTP',
  mac_or_serial TEXT,
  mqtt_topic TEXT,
  is_online BOOLEAN DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign key constraint for appliances.device_id
ALTER TABLE public.appliances 
  ADD CONSTRAINT fk_appliances_device 
  FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE SET NULL;

-- 7. READINGS TABLE (Time-series data)
CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  power_watts NUMERIC(10,2) NOT NULL,
  voltage_v NUMERIC(6,2) DEFAULT 220.0,
  current_a NUMERIC(6,2) DEFAULT 0.0,
  power_factor NUMERIC(4,2) DEFAULT 0.95,
  frequency_hz NUMERIC(5,2) DEFAULT 50.0,
  energy_kwh NUMERIC(12,4) DEFAULT 0.0000,
  cumulative_energy_kwh NUMERIC(12,4) DEFAULT 0.0000,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'standby', 'offline')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. TARIFFS TABLE
CREATE TABLE IF NOT EXISTS public.tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE, -- NULL for global/admin templates
  name TEXT NOT NULL,
  tariff_type TEXT NOT NULL CHECK (tariff_type IN ('flat-rate', 'time-of-use', 'tiered', 'seasonal')),
  utility_provider TEXT DEFAULT 'DESCO',
  is_active BOOLEAN DEFAULT TRUE,
  effective_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. TARIFF RATE RULES TABLE
CREATE TABLE IF NOT EXISTS public.tariff_rate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id UUID NOT NULL REFERENCES public.tariffs(id) ON DELETE CASCADE,
  slab_min_kwh NUMERIC(10,2),
  slab_max_kwh NUMERIC(10,2), -- NULL means upper limit (infinity)
  rate_per_kwh_bdt NUMERIC(10,2) NOT NULL,
  time_start TIME,
  time_end TIME,
  season_start_month INT CHECK (season_start_month BETWEEN 1 AND 12),
  season_end_month INT CHECK (season_end_month BETWEEN 1 AND 12),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. BUDGETS TABLE
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  monthly_target_bdt NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'BDT',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. BUDGET HISTORY TABLE
CREATE TABLE IF NOT EXISTS public.budget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- Format: YYYY-MM
  target_bdt NUMERIC(10,2) NOT NULL,
  actual_spend_bdt NUMERIC(10,2) NOT NULL,
  projected_spend_bdt NUMERIC(10,2) NOT NULL,
  actual_kwh NUMERIC(10,2) DEFAULT 0.00,
  is_over_budget BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. SUGGESTIONS TABLE
CREATE TABLE IF NOT EXISTS public.suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  appliance_id UUID REFERENCES public.appliances(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('standby', 'diagnostic', 'roi', 'budget')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  priority TEXT DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  potential_savings_bdt NUMERIC(10,2) DEFAULT 0.00,
  action_step TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'resolved')),
  supporting_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. DEVICE CREDENTIALS TABLE (Strictly protected sensitive credentials)
CREATE TABLE IF NOT EXISTS public.device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  api_key TEXT,
  api_secret TEXT,
  mqtt_username TEXT,
  mqtt_password TEXT,
  auth_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================================================
-- INDEXES FOR PERFORMANCE
-- ==================================================
CREATE INDEX IF NOT EXISTS idx_household_members_user ON public.household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON public.household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_rooms_household ON public.rooms(household_id);
CREATE INDEX IF NOT EXISTS idx_appliances_household ON public.appliances(household_id);
CREATE INDEX IF NOT EXISTS idx_appliances_room ON public.appliances(room_id);
CREATE INDEX IF NOT EXISTS idx_devices_household ON public.devices(household_id);
CREATE INDEX IF NOT EXISTS idx_readings_device_time ON public.readings(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_readings_household_time ON public.readings(household_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_household ON public.suggestions(household_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_household ON public.audit_logs(household_id);

-- ==================================================
-- HELPER FUNCTIONS FOR AUTHORIZATION
-- ==================================================

-- Helper function to check if current user is member of a household
CREATE OR REPLACE FUNCTION public.is_household_member(h_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if current user is system administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==================================================

-- Enable RLS on all user tables
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

-- Profiles Policies
CREATE POLICY "Users can view own profile or admin view all" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Households Policies
CREATE POLICY "Members can view their households" ON public.households
  FOR SELECT USING (public.is_household_member(id) OR public.is_admin());

CREATE POLICY "Members can update their households" ON public.households
  FOR UPDATE USING (public.is_household_member(id) OR public.is_admin());

-- Household Members Policies
CREATE POLICY "Members can view household members" ON public.household_members
  FOR SELECT USING (public.is_household_member(household_id) OR user_id = auth.uid() OR public.is_admin());

-- Rooms Policies
CREATE POLICY "Household members can access rooms" ON public.rooms
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Appliances Policies
CREATE POLICY "Household members can access appliances" ON public.appliances
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Devices Policies
CREATE POLICY "Household members can access devices" ON public.devices
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Readings Policies
CREATE POLICY "Household members can view readings" ON public.readings
  FOR SELECT USING (public.is_household_member(household_id) OR public.is_admin());

-- Tariffs Policies
CREATE POLICY "Household members can view tariffs" ON public.tariffs
  FOR SELECT USING (household_id IS NULL OR public.is_household_member(household_id) OR public.is_admin());

-- Tariff Rate Rules Policies
CREATE POLICY "Users can view tariff rules" ON public.tariff_rate_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tariffs t
      WHERE t.id = tariff_id AND (t.household_id IS NULL OR public.is_household_member(t.household_id) OR public.is_admin())
    )
  );

-- Budgets Policies
CREATE POLICY "Household members can access budgets" ON public.budgets
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Budget History Policies
CREATE POLICY "Household members can access budget history" ON public.budget_history
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Suggestions Policies
CREATE POLICY "Household members can access suggestions" ON public.suggestions
  FOR ALL USING (public.is_household_member(household_id) OR public.is_admin());

-- Device Credentials Policies (RESTRICTED: No direct user select except service_role/admin)
CREATE POLICY "Strict device credentials access" ON public.device_credentials
  FOR ALL USING (public.is_admin());

-- Audit Logs Policies
CREATE POLICY "Users can view relevant audit logs" ON public.audit_logs
  FOR SELECT USING (
    user_id = auth.uid() 
    OR (household_id IS NOT NULL AND public.is_household_member(household_id))
    OR public.is_admin()
  );
