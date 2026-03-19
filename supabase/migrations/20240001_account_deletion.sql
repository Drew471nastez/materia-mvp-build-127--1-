-- ============================================================================
-- Account deletion support
-- Run this in Supabase SQL editor (or via supabase db push)
-- ============================================================================

-- ── 1. account_delete_codes table ───────────────────────────────────────────
-- Stores time-limited 6-digit codes used to confirm account deletion.

CREATE TABLE IF NOT EXISTS public.account_delete_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  expires_at  timestamptz NOT NULL,
  verified    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_delete_codes_user_id_idx
  ON public.account_delete_codes (user_id);

-- Auto-delete expired codes after 24 hours (keeps the table clean)
-- Requires pg_cron or a scheduled job; alternatively rely on the .gt("expires_at") filter.

-- RLS: only the service-role key may read/write (API route uses admin client)
ALTER TABLE public.account_delete_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role only" ON public.account_delete_codes;
CREATE POLICY "service role only"
  ON public.account_delete_codes
  USING (false);       -- blocks all anon/authenticated access; admin bypasses RLS


-- ── 2. Cascade deletes on all user-owned tables ──────────────────────────────
-- If these FKs already exist with a different constraint name, drop them first.
-- The ON DELETE CASCADE ensures that deleting auth.users automatically removes
-- all related rows — this is the safest fallback if the API route fails midway.

-- profiles
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- creators
ALTER TABLE public.creators
  DROP CONSTRAINT IF EXISTS creators_user_id_fkey;
ALTER TABLE public.creators
  ADD CONSTRAINT creators_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- onepages (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onepages' AND table_schema = 'public') THEN
    ALTER TABLE public.onepages
      DROP CONSTRAINT IF EXISTS onepages_user_id_fkey;
    ALTER TABLE public.onepages
      ADD CONSTRAINT onepages_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- library_items (buyer's purchased products)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'library_items' AND table_schema = 'public') THEN
    ALTER TABLE public.library_items
      DROP CONSTRAINT IF EXISTS library_items_user_id_fkey;
    ALTER TABLE public.library_items
      ADD CONSTRAINT library_items_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- push_tokens
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_tokens' AND table_schema = 'public') THEN
    ALTER TABLE public.push_tokens
      DROP CONSTRAINT IF EXISTS push_tokens_user_id_fkey;
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- orders (buyer side)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orders' AND table_schema = 'public') THEN
    ALTER TABLE public.orders
      DROP CONSTRAINT IF EXISTS orders_buyer_id_fkey;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_buyer_id_fkey
      FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- email_change_codes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_change_codes' AND table_schema = 'public') THEN
    ALTER TABLE public.email_change_codes
      DROP CONSTRAINT IF EXISTS email_change_codes_user_id_fkey;
    ALTER TABLE public.email_change_codes
      ADD CONSTRAINT email_change_codes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;


-- ── 3. Full manual deletion query (run ONLY if needed outside the API) ───────
-- Replace '<USER_UUID>' with the actual auth.users.id before running.
--
-- DO NOT run this as-is; it is documentation / emergency fallback only.

/*
DO $$
DECLARE
  v_user_id   uuid := '<USER_UUID>';
  v_creator_id uuid;
BEGIN
  SELECT id INTO v_creator_id FROM public.creators WHERE user_id = v_user_id;

  -- Analytics
  IF v_creator_id IS NOT NULL THEN
    DELETE FROM public.analytics_daily_rollups
      WHERE product_id IN (SELECT id FROM public.products WHERE creator_id = v_creator_id);
    DELETE FROM public.analytics_events
      WHERE product_id IN (SELECT id FROM public.products WHERE creator_id = v_creator_id);
  END IF;

  -- Orders placed by buyer
  DELETE FROM public.orders       WHERE buyer_id  = v_user_id;
  DELETE FROM public.library_items WHERE user_id  = v_user_id;
  DELETE FROM public.push_tokens  WHERE user_id   = v_user_id;
  DELETE FROM public.onepages     WHERE user_id   = v_user_id;

  -- Creator-owned data
  IF v_creator_id IS NOT NULL THEN
    DELETE FROM public.digital_assets WHERE creator_id = v_creator_id;
    DELETE FROM public.products        WHERE creator_id = v_creator_id;
    DELETE FROM public.payouts         WHERE creator_id = v_creator_id;
    DELETE FROM public.creators        WHERE id         = v_creator_id;
  END IF;

  -- Also catch any user_id-linked digital_assets
  DELETE FROM public.digital_assets WHERE user_id = v_user_id;

  -- Profiles & codes
  DELETE FROM public.profiles           WHERE id      = v_user_id;
  DELETE FROM public.account_delete_codes WHERE user_id = v_user_id;
  DELETE FROM public.email_change_codes WHERE user_id = v_user_id;

  -- Auth user — this is irreversible
  DELETE FROM auth.users WHERE id = v_user_id;

  RAISE NOTICE 'User % deleted successfully', v_user_id;
END $$;
*/
