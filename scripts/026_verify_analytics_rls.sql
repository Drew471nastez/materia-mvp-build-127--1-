-- Verify and fix analytics_events RLS for anonymous inserts
-- Run this to ensure views tracking works without authentication

-- 1. Check if RLS is enabled on analytics_events
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policy and create new one that allows anonymous inserts
DROP POLICY IF EXISTS "Allow insert analytics" ON public.analytics_events;

CREATE POLICY "Allow insert analytics"
  ON public.analytics_events 
  FOR INSERT 
  WITH CHECK (true);

-- 3. Grant explicit INSERT permission to anon role
GRANT INSERT ON public.analytics_events TO anon;
GRANT USAGE ON SCHEMA public TO anon;

-- 4. Verify the policy is in place
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  qual, 
  with_check
FROM pg_policies 
WHERE tablename = 'analytics_events' 
ORDER BY policyname;

-- 5. Verify grants for anon role
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name='analytics_events';
