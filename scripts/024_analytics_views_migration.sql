-- Update event_type to include only 'view' and 'purchase' (removes store_view and product_view)
-- Alter the CHECK constraint on event_type column
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_type_check,
  ADD CONSTRAINT analytics_events_event_type_check
  CHECK (event_type IN ('view', 'purchase'));

-- Create indexes for efficient distinct session counting and filtering
CREATE INDEX IF NOT EXISTS idx_analytics_creator_session_date ON public.analytics_events(creator_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_creator_type_date ON public.analytics_events(creator_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_referrer_domain ON public.analytics_events(referrer_domain);
