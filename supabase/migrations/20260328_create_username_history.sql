-- Track old usernames so we can redirect when creators change their username
CREATE TABLE IF NOT EXISTS public.username_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_username text NOT NULL,
  new_username text NOT NULL,
  changed_at timestamptz DEFAULT now()
);

-- Index for fast lookups by old username
CREATE INDEX IF NOT EXISTS idx_username_history_old_username ON public.username_history (old_username);

-- Allow service role to read/write
ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage username_history"
  ON public.username_history
  FOR ALL
  USING (true)
  WITH CHECK (true);
