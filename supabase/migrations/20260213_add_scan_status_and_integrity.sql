-- Migration: Add antivirus scan status and file integrity columns to digital_assets
--
-- This migration adds:
-- 1. scan_status column: tracks antivirus scanning state
-- 2. scan_result column: stores scan engine results (JSONB)
-- 3. Ensures checksum column exists for SHA-256 integrity verification
-- 4. Index for pending scans (background worker)
-- 5. Index for download safety checks

-- Add scan_status column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'digital_assets'
    AND column_name = 'scan_status'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.digital_assets
      ADD COLUMN scan_status TEXT DEFAULT 'pending_scan';

    COMMENT ON COLUMN public.digital_assets.scan_status IS
      'Antivirus scan status: pending_scan, scanning, clean, infected, scan_error, skipped';
  END IF;
END $$;

-- Add scan_result JSONB column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'digital_assets'
    AND column_name = 'scan_result'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.digital_assets
      ADD COLUMN scan_result JSONB;

    COMMENT ON COLUMN public.digital_assets.scan_result IS
      'Antivirus scan result details: engine, threatName, scanDurationMs, scannedAt';
  END IF;
END $$;

-- Ensure checksum column exists (for SHA-256 integrity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'digital_assets'
    AND column_name = 'checksum'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.digital_assets
      ADD COLUMN checksum TEXT;

    COMMENT ON COLUMN public.digital_assets.checksum IS
      'SHA-256 checksum of the file for integrity verification';
  END IF;
END $$;

-- Index for background scan worker: find pending scans efficiently
CREATE INDEX IF NOT EXISTS idx_digital_assets_pending_scan
  ON public.digital_assets (scan_status, created_at)
  WHERE scan_status = 'pending_scan' AND upload_status = 'completed';

-- Index for download safety checks
CREATE INDEX IF NOT EXISTS idx_digital_assets_scan_status
  ON public.digital_assets (id, scan_status)
  WHERE scan_status IN ('pending_scan', 'scanning', 'infected');

-- Set existing completed assets to 'clean' (they were uploaded before AV scanning)
-- New uploads will default to 'pending_scan'
UPDATE public.digital_assets
  SET scan_status = 'clean'
  WHERE upload_status = 'completed'
  AND scan_status IS NULL;

-- Set pending/failed assets to NULL scan status (they haven't been uploaded yet)
UPDATE public.digital_assets
  SET scan_status = NULL
  WHERE upload_status != 'completed';
