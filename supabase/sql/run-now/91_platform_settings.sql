-- Platform-wide toggles (admin /api/admin/marketplace-flags). No direct client access.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_settings FROM anon, authenticated;

INSERT INTO public.platform_settings (key, value)
VALUES ('explore_marketplace', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.explore_marketplace_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT value::boolean FROM public.platform_settings WHERE key = 'explore_marketplace'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.explore_marketplace_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explore_marketplace_enabled() TO anon, authenticated;
