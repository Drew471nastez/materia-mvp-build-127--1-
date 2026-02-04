-- Create table for account deletion verification codes
CREATE TABLE IF NOT EXISTS public.account_delete_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.account_delete_codes ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own codes
CREATE POLICY "Users can view their own delete codes"
  ON public.account_delete_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for service role to manage codes (handled by admin client)
-- Note: The admin client bypasses RLS, so we don't need a policy for inserts/updates/deletes

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_account_delete_codes_user_id ON public.account_delete_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_account_delete_codes_code ON public.account_delete_codes(code);
CREATE INDEX IF NOT EXISTS idx_account_delete_codes_expires_at ON public.account_delete_codes(expires_at);
