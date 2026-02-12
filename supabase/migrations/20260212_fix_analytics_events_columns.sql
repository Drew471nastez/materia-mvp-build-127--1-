-- Add missing columns to analytics_events table
-- These columns are referenced by the track-view API but never added in previous migrations

-- Drop the old CHECK constraint and add a more permissive one
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_event_type_check
  CHECK (event_type IN ('view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart', 'checkout_start'));

-- Add missing columns (IF NOT EXISTS prevents errors if already added)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'utm_term') THEN
    ALTER TABLE public.analytics_events ADD COLUMN utm_term TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'utm_content') THEN
    ALTER TABLE public.analytics_events ADD COLUMN utm_content TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'screen_width') THEN
    ALTER TABLE public.analytics_events ADD COLUMN screen_width INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'screen_height') THEN
    ALTER TABLE public.analytics_events ADD COLUMN screen_height INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'language') THEN
    ALTER TABLE public.analytics_events ADD COLUMN language TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'source_category') THEN
    ALTER TABLE public.analytics_events ADD COLUMN source_category TEXT;
  END IF;
END
$$;

-- Ensure RLS policies allow service_role to insert
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role full access analytics" ON public.analytics_events;
EXCEPTION WHEN undefined_object THEN
  NULL;
END
$$;

CREATE POLICY "Service role full access analytics"
  ON public.analytics_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Ensure the anonymous/public insert policy exists
DO $$
BEGIN
  DROP POLICY IF EXISTS "Allow insert analytics" ON public.analytics_events;
EXCEPTION WHEN undefined_object THEN
  NULL;
END
$$;

CREATE POLICY "Allow insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);
