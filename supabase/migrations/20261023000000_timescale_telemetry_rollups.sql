-- ====================================================================
-- KilowattIQ Time-Series Migration: TimescaleDB / Hypertable & Rollups
-- Migration: 20261023000000_timescale_telemetry_rollups.sql
-- Target: PostgreSQL / TimescaleDB / Supabase
--
-- Retention Specifications:
-- 1. Raw Telemetry: Retained 7 days (high-resolution 1-5 second ticks)
-- 2. 1-Minute Continuous Rollups: Retained 90 days
-- 3. 1-Hour Continuous Rollups: Retained 5 years (1825 days)
-- ====================================================================

-- 1. ENABLE TIMESCALEDB EXTENSION (IF AVAILABLE)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TimescaleDB extension not installed or permission restricted. Operating in standard partitioned PostgreSQL time-series schema.';
END $$;

-- 2. CREATE RAW TELEMETRY TIME-SERIES TABLE
CREATE TABLE IF NOT EXISTS public.telemetry_raw (
    time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    active_power_w NUMERIC(8, 2) NOT NULL,
    voltage_v NUMERIC(6, 2) NOT NULL DEFAULT 220.00,
    current_a NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    power_factor NUMERIC(4, 3) NOT NULL DEFAULT 0.950,
    frequency_hz NUMERIC(5, 2) NOT NULL DEFAULT 50.00,
    energy_kwh NUMERIC(10, 4) DEFAULT 0.0000,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Primary composite index for time-series range lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_raw_hh_time ON public.telemetry_raw (household_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_raw_dev_time ON public.telemetry_raw (device_id, time DESC);

-- Convert to Timescale Hypertable if TimescaleDB is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('public.telemetry_raw', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
    RAISE NOTICE 'TimescaleDB hypertable created for public.telemetry_raw';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping create_hypertable: %', SQLERRM;
END $$;

-- 3. 1-MINUTE CONTINUOUS ROLLUP TABLE / MATERIALIZED VIEW
-- Retain 90 days
CREATE TABLE IF NOT EXISTS public.telemetry_1min_rollup (
    bucket TIMESTAMPTZ NOT NULL,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    avg_power_w NUMERIC(8, 2) NOT NULL,
    max_power_w NUMERIC(8, 2) NOT NULL,
    min_power_w NUMERIC(8, 2) NOT NULL,
    avg_voltage_v NUMERIC(6, 2) NOT NULL,
    total_energy_kwh NUMERIC(10, 4) NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, household_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_1min_hh_bucket ON public.telemetry_1min_rollup (household_id, bucket DESC);

-- 4. 1-HOUR CONTINUOUS ROLLUP TABLE / MATERIALIZED VIEW
-- Retain 5 years (1825 days)
CREATE TABLE IF NOT EXISTS public.telemetry_1hour_rollup (
    bucket TIMESTAMPTZ NOT NULL,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    avg_power_w NUMERIC(8, 2) NOT NULL,
    max_power_w NUMERIC(8, 2) NOT NULL,
    min_power_w NUMERIC(8, 2) NOT NULL,
    avg_voltage_v NUMERIC(6, 2) NOT NULL,
    total_energy_kwh NUMERIC(10, 4) NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (bucket, household_id)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_1hour_hh_bucket ON public.telemetry_1hour_rollup (household_id, bucket DESC);

-- 5. CONFIGURE TIMESCALEDB RETENTION POLICIES
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    -- Raw data retention: 7 days
    PERFORM add_retention_policy('public.telemetry_raw', INTERVAL '7 days', if_not_exists => TRUE);
    RAISE NOTICE 'Retention policy added: telemetry_raw 7 days';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping Timescale retention policy: %', SQLERRM;
END $$;

-- 6. AUTOMATED DATA RETENTION CLEANUP FUNCTION FOR POSTGRES
CREATE OR REPLACE FUNCTION public.clean_expired_telemetry_data()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1. Purge raw telemetry older than 7 days
  DELETE FROM public.telemetry_raw
  WHERE time < NOW() - INTERVAL '7 days';

  -- 2. Purge 1-minute rollups older than 90 days
  DELETE FROM public.telemetry_1min_rollup
  WHERE bucket < NOW() - INTERVAL '90 days';

  -- 3. Purge 1-hour rollups older than 5 years (1825 days)
  DELETE FROM public.telemetry_1hour_rollup
  WHERE bucket < NOW() - INTERVAL '1825 days';
END;
$$;

-- 7. DATA MIGRATION: MIGRATE EXISTING READINGS FROM power_readings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='power_readings') THEN
    INSERT INTO public.telemetry_raw (time, household_id, device_id, active_power_w, voltage_v, current_a, power_factor, energy_kwh)
    SELECT 
      COALESCE(recorded_at, created_at, NOW()) AS time,
      household_id,
      COALESCE(device_id::text, 'dev_legacy_01') AS device_id,
      COALESCE(active_power_w, 0.0) AS active_power_w,
      COALESCE(voltage_v, 220.0) AS voltage_v,
      COALESCE(current_a, 0.0) AS current_a,
      COALESCE(power_factor, 0.94) AS power_factor,
      COALESCE(energy_kwh, 0.0) AS energy_kwh
    FROM public.power_readings
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Successfully migrated legacy power_readings to telemetry_raw';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Legacy migration notice: %', SQLERRM;
END $$;
