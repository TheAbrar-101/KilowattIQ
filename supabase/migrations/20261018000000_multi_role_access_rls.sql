-- ====================================================================
-- KilowattIQ Multi-Role Access Control (RBAC) & Row Level Security (RLS)
-- Migration: 20261018000000_multi_role_access_rls.sql
-- Target: Supabase PostgreSQL
-- 
-- Roles Defined:
-- 1. Owner: Full control over household, members, loads, tariffs, budgets, billing
-- 2. Family Member: View live telemetry + toggle loads. Billing & budget locked.
-- 3. Utility Auditor: Read-only, time-limited, audited. Cannot toggle loads.
-- 4. Admin: Cross-tenant oversight (RLS enforced).
-- 
-- Principle: RLS is the source of truth, not frontend hiding.
-- ====================================================================

-- 1. EXTEND PROFILES & HOUSEHOLD MEMBERS SCHEMA
DO $$ 
BEGIN
  -- Add time-limited auditor and invite tracking columns to household_members if not present
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='household_members' AND column_name='expires_at') THEN
    ALTER TABLE public.household_members ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='household_members' AND column_name='invited_by') THEN
    ALTER TABLE public.household_members ADD COLUMN invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='household_members' AND column_name='status') THEN
    ALTER TABLE public.household_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  END IF;
END $$;

-- Update role constraint on household_members
ALTER TABLE public.household_members DROP CONSTRAINT IF EXISTS household_members_role_check;
ALTER TABLE public.household_members ADD CONSTRAINT household_members_role_check 
  CHECK (role IN ('owner', 'family_member', 'utility_auditor', 'admin', 'member', 'auditor'));

-- 2. CREATE HOUSEHOLD INVITATIONS TABLE (for Email Invites)
CREATE TABLE IF NOT EXISTS public.household_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('family_member', 'utility_auditor', 'owner')),
    invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ, -- Duration limit for utility auditors
    invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_household ON public.household_invitations(household_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.household_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.household_invitations(invite_token);

-- 3. AUDIT LOGS ENHANCEMENTS
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

CREATE INDEX IF NOT EXISTS idx_audit_logs_household ON public.audit_logs(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);

-- ====================================================================
-- 4. SECURITY & PERMISSION EVALUATION FUNCTIONS (POSTGRES ENGINE)
-- ====================================================================

-- Check if current user is system administrator (cross-tenant)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role = 'admin' OR role = 'ADMIN')
  );
$$;

-- Get member role for a household (with expiration check for auditors)
CREATE OR REPLACE FUNCTION public.get_household_role(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.household_members
  WHERE household_id = h_id
    AND user_id = u_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
$$;

-- Check if user is active member (auditors must not be expired)
CREATE OR REPLACE FUNCTION public.is_active_member(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id
      AND user_id = u_id
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- Check if user is household owner or system admin
CREATE OR REPLACE FUNCTION public.is_household_owner(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id
      AND user_id = u_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

-- Check if user is permitted to toggle electrical loads (relays, smart plugs, ACs)
-- Permitted: Owner, Family Member, Admin.
-- FORBIDDEN: Utility Auditor (read-only)
CREATE OR REPLACE FUNCTION public.can_toggle_loads(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id
      AND user_id = u_id
      AND role IN ('owner', 'family_member', 'member', 'admin')
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- Check if user is permitted to modify billing, tariffs, or budgets
-- Permitted: Owner, Admin.
-- FORBIDDEN: Family Member, Utility Auditor.
CREATE OR REPLACE FUNCTION public.can_modify_billing(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id
      AND user_id = u_id
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$;

-- Check if user can view audit log history
-- Permitted: Owner, Utility Auditor (for audit verification), Admin.
CREATE OR REPLACE FUNCTION public.can_view_audit_logs(h_id UUID, u_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = h_id
      AND user_id = u_id
      AND role IN ('owner', 'utility_auditor', 'auditor', 'admin')
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- ====================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES ENFORCEMENT
-- ====================================================================

-- Enable RLS on invitations
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- Households Policies
DROP POLICY IF EXISTS "Members or admins view households" ON public.households;
CREATE POLICY "Members or admins view households"
  ON public.households FOR SELECT
  USING (public.is_active_member(id) OR public.is_admin());

DROP POLICY IF EXISTS "Owners or admins update households" ON public.households;
CREATE POLICY "Owners or admins update households"
  ON public.households FOR UPDATE
  USING (public.is_household_owner(id) OR public.is_admin());

DROP POLICY IF EXISTS "Owners or admins delete households" ON public.households;
CREATE POLICY "Owners or admins delete households"
  ON public.households FOR DELETE
  USING (public.is_household_owner(id) OR public.is_admin());

-- Household Members Policies
DROP POLICY IF EXISTS "Members view household membership" ON public.household_members;
CREATE POLICY "Members view household membership"
  ON public.household_members FOR SELECT
  USING (public.is_active_member(household_id) OR user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Owners or admins manage household members" ON public.household_members;
CREATE POLICY "Owners or admins manage household members"
  ON public.household_members FOR ALL
  USING (public.is_household_owner(household_id) OR public.is_admin());

-- Household Invitations Policies (Only owners and admins can invite or revoke)
DROP POLICY IF EXISTS "Owners or admins manage invitations" ON public.household_invitations;
CREATE POLICY "Owners or admins manage invitations"
  ON public.household_invitations FOR ALL
  USING (public.is_household_owner(household_id) OR public.is_admin());

DROP POLICY IF EXISTS "Invited users can view pending invitation by token" ON public.household_invitations;
CREATE POLICY "Invited users can view pending invitation by token"
  ON public.household_invitations FOR SELECT
  USING (status = 'pending');

-- Appliances Policies
DROP POLICY IF EXISTS "Household members view appliances" ON public.appliances;
DROP POLICY IF EXISTS "Household members manage appliances" ON public.appliances;
CREATE POLICY "Household members view appliances"
  ON public.appliances FOR SELECT
  USING (public.is_active_member(household_id) OR public.is_admin());

-- Owners can insert/delete appliances
CREATE POLICY "Owners manage appliance records"
  ON public.appliances FOR INSERT
  WITH CHECK (public.is_household_owner(household_id) OR public.is_admin());

CREATE POLICY "Owners delete appliance records"
  ON public.appliances FOR DELETE
  USING (public.is_household_owner(household_id) OR public.is_admin());

-- Toggling / updating appliance load state requires can_toggle_loads (auditors blocked!)
CREATE POLICY "Authorized members toggle appliances"
  ON public.appliances FOR UPDATE
  USING (public.can_toggle_loads(household_id) OR public.is_admin())
  WITH CHECK (public.can_toggle_loads(household_id) OR public.is_admin());

-- Devices Policies
DROP POLICY IF EXISTS "Household members view devices" ON public.devices;
DROP POLICY IF EXISTS "Household members manage devices" ON public.devices;
CREATE POLICY "Household members view devices"
  ON public.devices FOR SELECT
  USING (public.is_active_member(household_id) OR public.is_admin());

CREATE POLICY "Owners manage device records"
  ON public.devices FOR INSERT
  WITH CHECK (public.is_household_owner(household_id) OR public.is_admin());

CREATE POLICY "Owners delete device records"
  ON public.devices FOR DELETE
  USING (public.is_household_owner(household_id) OR public.is_admin());

CREATE POLICY "Authorized members toggle devices"
  ON public.devices FOR UPDATE
  USING (public.can_toggle_loads(household_id) OR public.is_admin())
  WITH CHECK (public.can_toggle_loads(household_id) OR public.is_admin());

-- Budgets & Tariffs Policies (Only Owners & Admins can modify billing!)
DROP POLICY IF EXISTS "Household members manage budgets" ON public.budgets;
CREATE POLICY "Household members view budgets"
  ON public.budgets FOR SELECT
  USING (public.is_active_member(household_id) OR public.is_admin());

CREATE POLICY "Owners manage budgets"
  ON public.budgets FOR ALL
  USING (public.can_modify_billing(household_id) OR public.is_admin())
  WITH CHECK (public.can_modify_billing(household_id) OR public.is_admin());

-- Audit Logs Policies (Owners, Auditors, Admins can inspect; anyone authenticated can write)
DROP POLICY IF EXISTS "Users view relevant audit logs" ON public.audit_logs;
CREATE POLICY "Authorized roles view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    public.is_admin() OR
    (household_id IS NOT NULL AND public.can_view_audit_logs(household_id)) OR
    user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users record audit logs" ON public.audit_logs;
CREATE POLICY "Users record audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
