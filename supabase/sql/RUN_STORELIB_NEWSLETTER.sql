-- ============================================================================
--  STORELIB'S OWN NEWSLETTER: the "Join Our Community" box in the footer of
--  storelib.com. Additive and safe to run twice.
--
--  One row per address. Written only by the server (service role) through
--  /api/newsletter; nobody can read or write it from the browser, so RLS is
--  on with no policies.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.storelib_newsletter (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email        text NOT NULL UNIQUE,
  source       text NOT NULL DEFAULT 'footer',
  consent_text text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  CONSTRAINT storelib_newsletter_email_len CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT storelib_newsletter_email_lower CHECK (email = lower(email))
);

ALTER TABLE public.storelib_newsletter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storelib_newsletter FROM anon, authenticated;
