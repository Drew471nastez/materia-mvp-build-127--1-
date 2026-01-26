-- ============================================================
-- SQL Migration: Product Archive and Duplicate Functionality
-- ============================================================
-- This migration adds the following features:
-- 1. Adds 'archived' column to products table for archive functionality
-- 2. Updates status CHECK constraint to include 'archived'
-- 3. Ensures RLS policies support archive/unarchive operations
-- 4. Ensures duplicate functionality works properly
-- ============================================================

-- ============================================================
-- PART 1: ADD ARCHIVED COLUMN TO PRODUCTS TABLE
-- ============================================================

-- Add archived column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'products'
        AND column_name = 'archived'
    ) THEN
        ALTER TABLE public.products ADD COLUMN archived BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add index for archived column for better query performance
CREATE INDEX IF NOT EXISTS idx_products_archived ON public.products(archived);

-- ============================================================
-- PART 2: UPDATE STATUS CHECK CONSTRAINT (OPTIONAL)
-- ============================================================
-- If you want 'archived' as a status value instead of a boolean

-- First, drop the existing constraint if it exists
DO $$
BEGIN
    -- Check if the constraint exists and drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'products_status_check'
        AND table_name = 'products'
    ) THEN
        ALTER TABLE public.products DROP CONSTRAINT products_status_check;
    END IF;
END $$;

-- Add updated constraint that includes 'archived' status
ALTER TABLE public.products
ADD CONSTRAINT products_status_check
CHECK (status IN ('draft', 'published', 'archived'));

-- ============================================================
-- PART 3: VERIFY AND UPDATE RLS POLICIES
-- ============================================================

-- Drop existing policies if they exist (to recreate them properly)
DROP POLICY IF EXISTS "Published products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Creators can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Creators can update their own products" ON public.products;
DROP POLICY IF EXISTS "Creators can delete their own products" ON public.products;

-- Recreate SELECT policy - allow viewing published products OR own products
CREATE POLICY "Published products are viewable by everyone"
ON public.products FOR SELECT
USING (
    status = 'published'
    OR EXISTS (
        SELECT 1 FROM public.creators
        WHERE id = products.creator_id AND user_id = auth.uid()
    )
);

-- Recreate INSERT policy - creators can insert their own products
CREATE POLICY "Creators can insert their own products"
ON public.products FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.creators
        WHERE id = creator_id AND user_id = auth.uid()
    )
);

-- Recreate UPDATE policy - creators can update their own products (including archive)
CREATE POLICY "Creators can update their own products"
ON public.products FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.creators
        WHERE id = products.creator_id AND user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.creators
        WHERE id = products.creator_id AND user_id = auth.uid()
    )
);

-- Recreate DELETE policy - creators can delete their own products
CREATE POLICY "Creators can delete their own products"
ON public.products FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.creators
        WHERE id = products.creator_id AND user_id = auth.uid()
    )
);

-- ============================================================
-- PART 4: CREATE HELPER FUNCTIONS FOR ARCHIVE AND DUPLICATE
-- ============================================================

-- Function to archive a product
CREATE OR REPLACE FUNCTION archive_product(product_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
    v_user_id UUID;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();

    -- Check if the product belongs to the current user's creator account
    SELECT creator_id INTO v_creator_id
    FROM products
    WHERE id = product_id;

    IF NOT EXISTS (
        SELECT 1 FROM creators
        WHERE id = v_creator_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only archive your own products';
    END IF;

    -- Archive the product
    UPDATE products
    SET archived = TRUE
    WHERE id = product_id;

    RETURN TRUE;
END;
$$;

-- Function to restore (unarchive) a product
CREATE OR REPLACE FUNCTION restore_product(product_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
    v_user_id UUID;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();

    -- Check if the product belongs to the current user's creator account
    SELECT creator_id INTO v_creator_id
    FROM products
    WHERE id = product_id;

    IF NOT EXISTS (
        SELECT 1 FROM creators
        WHERE id = v_creator_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only restore your own products';
    END IF;

    -- Restore the product
    UPDATE products
    SET archived = FALSE
    WHERE id = product_id;

    RETURN TRUE;
END;
$$;

-- Function to duplicate a product
CREATE OR REPLACE FUNCTION duplicate_product(product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source_product RECORD;
    v_user_id UUID;
    v_new_product_id UUID;
    v_new_slug TEXT;
BEGIN
    -- Get the current user ID
    v_user_id := auth.uid();

    -- Get the source product
    SELECT * INTO v_source_product
    FROM products
    WHERE id = product_id;

    -- Check if the product exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found';
    END IF;

    -- Check if the product belongs to the current user's creator account
    IF NOT EXISTS (
        SELECT 1 FROM creators
        WHERE id = v_source_product.creator_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Unauthorized: You can only duplicate your own products';
    END IF;

    -- Generate a unique slug
    v_new_slug := v_source_product.slug || '-copy-' || floor(extract(epoch from now()) * 1000)::text;

    -- Create the duplicate product
    INSERT INTO products (
        creator_id,
        type,
        title,
        slug,
        description,
        price_cents,
        thumbnail_url,
        status,
        includes_community,
        archived
    )
    VALUES (
        v_source_product.creator_id,
        v_source_product.type,
        v_source_product.title || ' (Copy)',
        v_new_slug,
        v_source_product.description,
        v_source_product.price_cents,
        v_source_product.thumbnail_url,
        'draft',  -- Always set to draft for duplicates
        v_source_product.includes_community,
        FALSE  -- New product is not archived
    )
    RETURNING id INTO v_new_product_id;

    RETURN v_new_product_id;
END;
$$;

-- Grant execute permissions on the functions
GRANT EXECUTE ON FUNCTION archive_product(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_product(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION duplicate_product(UUID) TO authenticated;

-- ============================================================
-- PART 5: VERIFICATION QUERIES
-- ============================================================

-- You can run these queries to verify the setup:

-- Check if archived column exists:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'products' AND column_name = 'archived';

-- Check RLS policies:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'products';

-- Check functions exist:
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('archive_product', 'restore_product', 'duplicate_product');
