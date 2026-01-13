-- Migration: Add missing order_id column to verification_codes table
-- This migration addresses the error: "column 'order_id' does not exist"
-- The verification_codes table supports two use cases:
--   1. Device verification (uses order_id) - /api/security/verify-email
--   2. Account verification (uses user_id) - /api/auth/verify-email

-- Add order_id column if it doesn't exist
DO $$
BEGIN
  -- Check if order_id column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'verification_codes'
    AND column_name = 'order_id'
  ) THEN
    -- Add the order_id column with foreign key reference
    ALTER TABLE verification_codes
    ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE CASCADE;

    RAISE NOTICE 'Added order_id column to verification_codes table';
  ELSE
    RAISE NOTICE 'order_id column already exists in verification_codes table';
  END IF;

  -- Also ensure user_id column exists (for completeness)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'verification_codes'
    AND column_name = 'user_id'
  ) THEN
    ALTER TABLE verification_codes
    ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

    RAISE NOTICE 'Added user_id column to verification_codes table';
  ELSE
    RAISE NOTICE 'user_id column already exists in verification_codes table';
  END IF;

  -- Make sure both columns are nullable (at least one should be set)
  BEGIN
    ALTER TABLE verification_codes ALTER COLUMN order_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if already nullable
  END;

  BEGIN
    ALTER TABLE verification_codes ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if already nullable
  END;
END $$;

-- Create index on order_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_verification_codes_order_id
ON verification_codes(order_id)
WHERE order_id IS NOT NULL;

-- Create index on user_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id
ON verification_codes(user_id)
WHERE user_id IS NOT NULL;

-- Add constraint to ensure at least one of user_id or order_id is set (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'verification_codes_has_reference'
    AND table_name = 'verification_codes'
  ) THEN
    ALTER TABLE verification_codes
    ADD CONSTRAINT verification_codes_has_reference
    CHECK (user_id IS NOT NULL OR order_id IS NOT NULL);

    RAISE NOTICE 'Added verification_codes_has_reference constraint';
  ELSE
    RAISE NOTICE 'verification_codes_has_reference constraint already exists';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add constraint (may have existing data violating it): %', SQLERRM;
END $$;

-- Ensure RLS policies are set correctly
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- Drop and recreate the permissive policy to ensure it works
DROP POLICY IF EXISTS "Allow all verification code operations" ON verification_codes;

CREATE POLICY "Allow all verification code operations" ON verification_codes
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON COLUMN verification_codes.order_id IS 'Reference to order for device verification (nullable if user_id is set)';
COMMENT ON COLUMN verification_codes.user_id IS 'Reference to user for account verification (nullable if order_id is set)';
