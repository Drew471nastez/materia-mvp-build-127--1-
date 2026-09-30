-- Versioned Storelib fee rules (admin-managed) and payments audit log.
-- Historical orders keep plan_used, pricing_tier, fee_rule_version on the order row.

CREATE TABLE IF NOT EXISTS public.storelib_fee_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'draft', 'retired')),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'admin session',
  config jsonb NOT NULL,
  change_summary text,
  UNIQUE (version_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS storelib_fee_rule_versions_one_active
  ON public.storelib_fee_rule_versions ((status))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS storelib_fee_rule_versions_created_idx
  ON public.storelib_fee_rule_versions (created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_payments_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'admin session',
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_payments_audit_log_created_idx
  ON public.admin_payments_audit_log (created_at DESC);

ALTER TABLE public.storelib_fee_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_payments_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_fee_rule_versions FROM anon, authenticated;
REVOKE ALL ON public.admin_payments_audit_log FROM anon, authenticated;
