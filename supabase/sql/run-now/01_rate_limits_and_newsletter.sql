/* Rate limit counter for the open forms, and the storelib.com footer newsletter table. Server only. */
CREATE TABLE IF NOT EXISTS rate_limit_hits ( id BIGSERIAL PRIMARY KEY, bucket TEXT NOT NULL, subject TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now() );
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup ON rate_limit_hits (bucket, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_sweep ON rate_limit_hits (created_at);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.storelib_newsletter ( id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL UNIQUE, source text NOT NULL DEFAULT 'footer', consent_text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), unsubscribed_at timestamptz, CONSTRAINT storelib_newsletter_email_len CHECK (char_length(email) BETWEEN 3 AND 254), CONSTRAINT storelib_newsletter_email_lower CHECK (email = lower(email)) );
ALTER TABLE public.storelib_newsletter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_newsletter FROM anon, authenticated;
notify pgrst, 'reload schema';
