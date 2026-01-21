-- Allow guest checkout by making buyer_id nullable in orders table
-- and updating RLS policies

-- Make buyer_id nullable if not already
ALTER TABLE public.orders 
ALTER COLUMN buyer_id DROP NOT NULL;

-- Drop existing insert policy if exists
DROP POLICY IF EXISTS "System can insert orders" ON public.orders;

-- Create new insert policy that allows webhook to insert guest orders
CREATE POLICY "System can insert orders"
ON public.orders FOR INSERT
WITH CHECK (true);

-- Update select policy to allow users to see their orders (by email match later)
-- Keep existing policies as they are - service role bypasses RLS anyway

-- Also ensure products are truly public for anonymous users
DROP POLICY IF EXISTS "Published products are viewable by everyone" ON public.products;
CREATE POLICY "Published products are viewable by everyone"
ON public.products FOR SELECT
USING (status = 'published');

-- Ensure profiles are public
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

-- Ensure creators are public  
DROP POLICY IF EXISTS "Public creators are viewable by everyone" ON public.creators;
CREATE POLICY "Public creators are viewable by everyone"
ON public.creators FOR SELECT
USING (true);

-- Grant anon role explicit select permissions
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.creators TO anon;
GRANT SELECT ON public.profiles TO anon;
