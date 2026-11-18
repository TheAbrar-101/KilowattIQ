-- ====================================================================
-- KilowattIQ Per-Household Per-Cycle Dismissed Slab Alerts
-- Migration: 20261118000001_slab_alert_dismissals.sql
-- Target: Supabase PostgreSQL
--
-- Behavior:
-- - Persists dismissed 80%/100% slab alerts per household AND per
--   billing cycle (`cycle_start_date`).
-- - When the next billing cycle begins in Asia/Dhaka (`cycle_start_date`
--   advances), alerts automatically reappear because prior-cycle rows
--   do not apply to the new cycle.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.slab_alert_dismissals (
    id TEXT PRIMARY KEY,
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    cycle_start_date DATE NOT NULL,
    alert_key TEXT NOT NULL,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (household_id, cycle_start_date, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_slab_alert_dismissals_household_cycle
    ON public.slab_alert_dismissals (household_id, cycle_start_date);

ALTER TABLE public.slab_alert_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can view dismissed slab alerts" ON public.slab_alert_dismissals;
CREATE POLICY "Household members can view dismissed slab alerts"
    ON public.slab_alert_dismissals
    FOR SELECT
    USING (
        auth.uid()::text = user_id
        OR EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = slab_alert_dismissals.household_id
              AND hm.user_id = auth.uid()
              AND hm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Household members can dismiss slab alerts" ON public.slab_alert_dismissals;
CREATE POLICY "Household members can dismiss slab alerts"
    ON public.slab_alert_dismissals
    FOR INSERT
    WITH CHECK (
        auth.uid()::text = user_id
        OR EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = slab_alert_dismissals.household_id
              AND hm.user_id = auth.uid()
              AND hm.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Household members can delete own dismissed slab alerts" ON public.slab_alert_dismissals;
CREATE POLICY "Household members can delete own dismissed slab alerts"
    ON public.slab_alert_dismissals
    FOR DELETE
    USING (
        auth.uid()::text = user_id
        OR EXISTS (
            SELECT 1 FROM public.household_members hm
            WHERE hm.household_id = slab_alert_dismissals.household_id
              AND hm.user_id = auth.uid()
              AND hm.status = 'active'
        )
    );
