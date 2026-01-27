-- ============================================
-- PRODUCT VIDEOS TABLE AND STORAGE
-- ============================================
-- This migration creates support for product video uploads
-- Max file size: 5GB (5368709120 bytes)

-- Create product_videos table to store video metadata
CREATE TABLE IF NOT EXISTS public.product_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  file_size BIGINT, -- Size in bytes, supports up to 5GB
  mime_type TEXT,
  duration_seconds INTEGER, -- Video duration in seconds
  width INTEGER, -- Video width in pixels
  height INTEGER, -- Video height in pixels
  thumbnail_url TEXT, -- Auto-generated or custom thumbnail
  is_primary BOOLEAN DEFAULT false, -- Primary video shown first
  sort_order INTEGER DEFAULT 0, -- For ordering multiple videos
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.product_videos ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_videos_product ON public.product_videos(product_id);
CREATE INDEX IF NOT EXISTS idx_product_videos_status ON public.product_videos(status);
CREATE INDEX IF NOT EXISTS idx_product_videos_primary ON public.product_videos(product_id, is_primary) WHERE is_primary = true;

-- Policies for product_videos

-- Anyone can view videos for published products
CREATE POLICY "Videos are viewable for published products"
  ON public.product_videos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_videos.product_id
      AND (p.status = 'published' OR EXISTS (
        SELECT 1 FROM public.creators c WHERE c.id = p.creator_id AND c.user_id = auth.uid()
      ))
    )
  );

-- Creators can insert videos for their own products
CREATE POLICY "Creators can insert videos for their products"
  ON public.product_videos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_id AND c.user_id = auth.uid()
    )
  );

-- Creators can update videos for their own products
CREATE POLICY "Creators can update their product videos"
  ON public.product_videos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_videos.product_id AND c.user_id = auth.uid()
    )
  );

-- Creators can delete videos for their own products
CREATE POLICY "Creators can delete their product videos"
  ON public.product_videos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.creators c ON c.id = p.creator_id
      WHERE p.id = product_videos.product_id AND c.user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_videos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_product_videos_updated_at ON public.product_videos;
CREATE TRIGGER trigger_update_product_videos_updated_at
  BEFORE UPDATE ON public.product_videos
  FOR EACH ROW
  EXECUTE FUNCTION update_product_videos_updated_at();

-- Function to ensure only one primary video per product
CREATE OR REPLACE FUNCTION ensure_single_primary_video()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.product_videos
    SET is_primary = false
    WHERE product_id = NEW.product_id AND id != NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to ensure only one primary video
DROP TRIGGER IF EXISTS trigger_ensure_single_primary_video ON public.product_videos;
CREATE TRIGGER trigger_ensure_single_primary_video
  BEFORE INSERT OR UPDATE ON public.product_videos
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_primary_video();

-- ============================================
-- STORAGE BUCKET FOR PRODUCT VIDEOS
-- ============================================

-- Create or update product-videos bucket with 5GB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  true,
  5368709120, -- 5GB limit (5 * 1024 * 1024 * 1024 = 5368709120 bytes)
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v', 'video/x-matroska']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v', 'video/x-matroska']::text[];

-- Also update product-images bucket to support videos with 5GB limit
UPDATE storage.buckets
SET
  file_size_limit = 5368709120, -- 5GB limit
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/mov', 'video/mpeg', 'video/x-m4v', 'video/x-matroska'
  ]::text[]
WHERE id = 'product-images';

-- ============================================
-- STORAGE POLICIES FOR PRODUCT VIDEOS
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload product videos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view product videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their product videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their product videos" ON storage.objects;

-- Allow authenticated users to upload videos to their folder
CREATE POLICY "Users can upload product videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to product videos
CREATE POLICY "Public can view product videos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'product-videos');

-- Allow users to delete their own videos
CREATE POLICY "Users can delete their product videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own videos
CREATE POLICY "Users can update their product videos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- ADD video_urls ARRAY COLUMN TO PRODUCTS
-- ============================================
-- This allows storing multiple video URLs directly on the product

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';

-- Comment for documentation
COMMENT ON COLUMN public.products.video_urls IS 'Array of video URLs for the product (max 5GB per video)';
COMMENT ON TABLE public.product_videos IS 'Stores detailed metadata for product videos';
