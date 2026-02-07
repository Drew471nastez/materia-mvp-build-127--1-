-- Migration: Create email change, password reset, and auth recovery support tables
-- These tables support email change verification, password reset, and Google-account recovery requests

-- Table for email change verification codes
CREATE TABLE IF NOT EXISTS email_change_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_change_codes_user_id ON email_change_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_codes_code ON email_change_codes(code);
CREATE INDEX IF NOT EXISTS idx_email_change_codes_expires_at ON email_change_codes(expires_at);

-- Table for password reset requests
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_token ON password_reset_requests(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_expires_at ON password_reset_requests(expires_at);

-- Table for manual auth recovery requests (e.g., user lost access to Google account)
CREATE TABLE IF NOT EXISTS auth_recovery_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  issue_type TEXT NOT NULL DEFAULT 'google_access_lost',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster support queue lookups
CREATE INDEX IF NOT EXISTS idx_auth_recovery_requests_email ON auth_recovery_requests(email);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_requests_status ON auth_recovery_requests(status);

-- RLS Policies for email_change_codes
ALTER TABLE email_change_codes ENABLE ROW LEVEL SECURITY;

-- Users can only see their own codes (though typically accessed via admin client)
CREATE POLICY "Users can view own email change codes" ON email_change_codes
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (via admin client)
CREATE POLICY "Service role can manage email change codes" ON email_change_codes
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for password_reset_requests
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

-- Users can only see their own requests
CREATE POLICY "Users can view own password reset requests" ON password_reset_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (via admin client)
CREATE POLICY "Service role can manage password reset requests" ON password_reset_requests
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for auth_recovery_requests
ALTER TABLE auth_recovery_requests ENABLE ROW LEVEL SECURITY;

-- Public users can create requests, but cannot read the queue
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'auth_recovery_requests'
      AND policyname = 'Anyone can create auth recovery requests'
  ) THEN
    CREATE POLICY "Anyone can create auth recovery requests" ON auth_recovery_requests
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Only service role can manage/read requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'auth_recovery_requests'
      AND policyname = 'Service role can manage auth recovery requests'
  ) THEN
    CREATE POLICY "Service role can manage auth recovery requests" ON auth_recovery_requests
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Function to clean up expired codes (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_codes()
RETURNS void AS $$
BEGIN
  -- Delete expired email change codes
  DELETE FROM email_change_codes WHERE expires_at < NOW();

  -- Delete expired password reset requests
  DELETE FROM password_reset_requests WHERE expires_at < NOW();

  -- Delete used password reset requests older than 24 hours
  DELETE FROM password_reset_requests
  WHERE used = TRUE AND created_at < NOW() - INTERVAL '24 hours';

  -- Delete old closed recovery requests older than 90 days
  DELETE FROM auth_recovery_requests
  WHERE status = 'closed' AND created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_auth_codes() TO service_role;
