-- This script documents the TrackView component creation
-- The component is created in components/analytics/track-view.tsx
-- It automatically tracks page views on client-side load with deduplication per session per day

-- Migration complete! Analytics now tracks:
-- - Distinct sessions (not total events)
-- - One view per visitor per day per creator per session
-- - Traffic sources from referrer domain
-- - Real-time updates using Supabase subscriptions

-- Key changes:
-- 1. Event type is now "view" (not store_view/product_view)
-- 2. Views = COUNT(DISTINCT session_id) 
-- 3. Analytics tracked client-side only (prevents duplicates from redirects)
-- 4. Checkout flows no longer insert analytics_events (only view tracking does)
-- 5. Dashboard shows distinct sessions, not raw event counts
