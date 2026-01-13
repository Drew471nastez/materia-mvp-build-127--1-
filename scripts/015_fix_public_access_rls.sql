-- FIX PUBLIC ACCESS RLS POLICIES
-- This script ensures anonymous users can read public data

-- =============================================
-- 1. FIX PRODUCTS RLS - Simplify public read policy
-- =============================================

-- Drop existing SELECT policy if it exists
DROP POLICY IF EXISTS "Published products are viewable by everyone" ON public.products;

-- Create a simpler policy that definitely allows anonymous reads for published products
CREATE POLICY "Published products are viewable by everyone"
  ON public.products FOR SELECT
  USING (status = 'published');

-- Add separate policy for creators to view their own drafts
DROP POLICY IF EXISTS "Creators can view their own products" ON public.products;
CREATE POLICY "Creators can view their own products"
  ON public.products FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM public.creators 
      WHERE id = products.creator_id 
      AND user_id = auth.uid()
    )
  );

-- =============================================
-- 2. FIX CREATORS RLS - Ensure public visibility
-- =============================================

-- Drop and recreate to ensure clean state
DROP POLICY IF EXISTS "Public creators are viewable by everyone" ON public.creators;
CREATE POLICY "Public creators are viewable by everyone"
  ON public.creators FOR SELECT
  USING (true);

-- =============================================
-- 3. FIX PROFILES RLS - Ensure public visibility
-- =============================================

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- =============================================
-- 4. FIX ANALYTICS_EVENTS - Allow anonymous inserts
-- =============================================

DROP POLICY IF EXISTS "Allow insert analytics" ON public.analytics_events;
CREATE POLICY "Allow insert analytics"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- =============================================
-- 5. ADD INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status_slug ON public.products(status, slug);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- =============================================
-- 6. VERIFY: Grant usage to anon role
-- =============================================
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.creators TO anon;
GRANT SELECT ON public.profiles TO anon;
GRANT INSERT ON public.analytics_events TO anon;
