-- ====================================================================
-- KilowattIQ No-IoT Real Meter Readings, Utility SMS & Rate Limit Schema
-- Migration: 20261118000000_meter_readings_and_sms.sql
-- Target: Supabase PostgreSQL
-- ====================================================================

-- 1. Configurable Household Billing Day (1..31, defaults to 1st of month)
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS billing_day INTEGER NOT NULL DEFAULT 1
  CHECK (billing_day >= 1 AND billing_day <= 31);

-- 2. Household Manual / Confirmed Scanned Meter Readings
CREATE TABLE IF NOT EXISTS public.meter_readings (
    id TEXT PRIMARY KEY,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    reading_kwh NUMERIC(12, 2) NOT NULL CHECK (reading_kwh >= 0),
    reading_date DATE NOT NULL,
    meter_segment INTEGER NOT NULL DEFAULT 1 CHECK (meter_segment >= 1),
    is_meter_replacement BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'METER_SCAN')),
    notes TEXT,
    confidence NUMERIC(4, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meter_readings_user_household_date
    ON public.meter_readings (user_id, household_id, reading_date ASC, meter_segment ASC, created_at ASC);

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own meter readings" ON public.meter_readings;
CREATE POLICY "Users can read own meter readings"
    ON public.meter_readings
    FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert own meter readings" ON public.meter_readings;
CREATE POLICY "Users can insert own meter readings"
    ON public.meter_readings
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update own meter readings" ON public.meter_readings;
CREATE POLICY "Users can update own meter readings"
    ON public.meter_readings
    FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete own meter readings" ON public.meter_readings;
CREATE POLICY "Users can delete own meter readings"
    ON public.meter_readings
    FOR DELETE
    USING (auth.uid()::text = user_id);

-- 3. Utility SMS Records (Full STS Tokens are NEVER stored; only last 4 digits + masked form)
CREATE TABLE IF NOT EXISTS public.sms_records (
    id TEXT PRIMARY KEY,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    sms_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (sms_type IN ('RECHARGE', 'BILL', 'BALANCE', 'UNKNOWN')),
    utility TEXT,
    amount_bdt NUMERIC(12, 2),
    sms_date DATE,
    balance_bdt NUMERIC(12, 2),
    units_kwh NUMERIC(12, 2),
    token_last4 TEXT CHECK (token_last4 IS NULL OR char_length(token_last4) <= 4),
    token_masked TEXT,
    raw_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_records_user_household_created
    ON public.sms_records (user_id, household_id, created_at DESC);

ALTER TABLE public.sms_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sms records" ON public.sms_records;
CREATE POLICY "Users can read own sms records"
    ON public.sms_records
    FOR SELECT
    USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can insert own sms records" ON public.sms_records;
CREATE POLICY "Users can insert own sms records"
    ON public.sms_records
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can update own sms records" ON public.sms_records;
CREATE POLICY "Users can update own sms records"
    ON public.sms_records
    FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS "Users can delete own sms records" ON public.sms_records;
CREATE POLICY "Users can delete own sms records"
    ON public.sms_records
    FOR DELETE
    USING (auth.uid()::text = user_id);

-- 4. Persistent Scan Rate-Limit Log (10/hour & 100/day per user)
CREATE TABLE IF NOT EXISTS public.meter_scan_rate_limits (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meter_scan_rate_limits_user_time
    ON public.meter_scan_rate_limits (user_id, scanned_at DESC);

ALTER TABLE public.meter_scan_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own scan rate limits" ON public.meter_scan_rate_limits;
CREATE POLICY "Users can manage own scan rate limits"
    ON public.meter_scan_rate_limits
    FOR ALL
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);
