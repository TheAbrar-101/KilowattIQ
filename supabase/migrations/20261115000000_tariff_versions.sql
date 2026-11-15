-- ====================================================================
-- KilowattIQ Versioned BERC LT-A Tariff Persistence Table
-- Migration: 20261115000000_tariff_versions.sql
-- Target: Supabase PostgreSQL
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.tariff_versions (
    version_id TEXT PRIMARY KEY,
    effective_from DATE NOT NULL,
    source_note TEXT NOT NULL,
    last_verified_date DATE NULL,
    demand_charge_per_kw NUMERIC(10, 2) NOT NULL DEFAULT 42.00,
    meter_rent NUMERIC(10, 2) NOT NULL DEFAULT 40.00,
    vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    charges_verified BOOLEAN NOT NULL DEFAULT FALSE,
    slabs JSONB NOT NULL,
    flat_rate_per_kwh NUMERIC(10, 2),
    tou_rates JSONB,
    seasonal_multipliers JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_tariff_versions_effective_from
    ON public.tariff_versions (effective_from DESC);

ALTER TABLE public.tariff_versions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated (or anon preview readers) can read tariff schedules
DROP POLICY IF EXISTS "Tariff versions are readable by all authenticated users" ON public.tariff_versions;
CREATE POLICY "Tariff versions are readable by all authenticated users"
    ON public.tariff_versions
    FOR SELECT
    USING (true);

-- Only service role or system admins can insert/update tariff versions
DROP POLICY IF EXISTS "Admins can manage tariff versions" ON public.tariff_versions;
CREATE POLICY "Admins can manage tariff versions"
    ON public.tariff_versions
    FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
