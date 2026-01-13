-- Create storage bucket for digital assets
-- Run this in Supabase SQL Editor or use the Dashboard to create the bucket

-- Note: Storage bucket creation is typically done via Supabase Dashboard
-- Go to Storage > Create new bucket > Name: "digital-assets" > Make it public or private as needed

-- If you want to use SQL (requires admin access):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('digital-assets', 'digital-assets', false)
-- ON CONFLICT (id) DO NOTHING;

-- RLS Policies for storage bucket (run after creating bucket in Dashboard)
-- These policies control who can upload/download files

-- Allow authenticated users to upload to their own product folders
-- CREATE POLICY "Authenticated users can upload files"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (bucket_id = 'digital-assets');

-- Allow entitled users to read files they have access to
-- This is handled by the download API route instead for better security
