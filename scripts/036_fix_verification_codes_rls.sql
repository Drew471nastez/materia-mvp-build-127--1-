-- Migration: Fix verification_codes RLS policies
-- The original policies didn't properly allow service role to manage verification codes
-- NOTE: This table is used by both:
--   1. /api/security/verify-email (uses order_id for device verification)
--   2. /api/auth/verify-email (uses user_id for account verification)

-- First, drop existing policies that might be causing issues
DROP POLICY IF EXISTS "System can insert verification codes" ON verification_codes;
DROP POLICY IF EXISTS "System can update verification codes" ON verification_codes;
DROP POLICY IF EXISTS "System can select verification codes" ON verification_codes;
DROP POLICY IF EXISTS "Allow all verification code operations" ON verification_codes;

-- Also drop any existing security_events policies
DROP POLICY IF EXISTS "System can insert security events" ON security_events;
DROP POLICY IF EXISTS "Users can view their own security events" ON security_events;
DROP POLICY IF EXISTS "Allow all security event operations" ON security_events;

-- Create verification_codes table if it doesn't exist
-- Uses user_id for auth verification (nullable for order-based verification)
-- Uses order_id for security/device verification (nullable for auth-based verification)
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT verification_codes_has_reference CHECK (user_id IS NOT NULL OR order_id IS NOT NULL)
);

-- Add missing columns to existing table if they don't exist
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_codes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE verification_codes ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add order_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_codes' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE verification_codes ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE CASCADE;
  END IF;

  -- Make user_id nullable if it was NOT NULL (for backward compatibility)
  BEGIN
    ALTER TABLE verification_codes ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if already nullable or doesn't exist
  END;

  -- Make order_id nullable if it was NOT NULL (for backward compatibility)
  BEGIN
    ALTER TABLE verification_codes ALTER COLUMN order_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if already nullable or doesn't exist
  END;
END $$;

-- Create security_events table if it doesn't exist
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  fingerprint TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure RLS is enabled
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: For service role to work with RLS, we need to either:
-- 1. Use policies that check for service_role
-- 2. Or grant the role to bypass RLS

-- Create permissive policies that allow authenticated service operations
-- These policies use TRUE to allow any operation, which works with service_role client

-- Verification codes - allow all operations (service role will be used via admin client)
CREATE POLICY "Allow all verification code operations" ON verification_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Security events - allow all operations
CREATE POLICY "Allow all security event operations" ON security_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Ensure indexes exist for performance (only create if column exists)
DO $$
BEGIN
  -- Index on user_id if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_codes' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
  END IF;

  -- Index on order_id if column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'verification_codes' AND column_name = 'order_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_verification_codes_order_id ON verification_codes(order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_security_events_order_id ON security_events(order_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);

-- Add comment
COMMENT ON TABLE verification_codes IS 'Email verification codes for both device authentication (order_id) and account verification (user_id). Managed by service role.';
COMMENT ON TABLE security_events IS 'Security audit log for download and verification events.';
