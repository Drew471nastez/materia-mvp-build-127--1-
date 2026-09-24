-- ===========================================================================
--  A COUNTER FOR THE ROUTES THAT ANSWER SOMEBODY WITH NO ACCOUNT
-- ===========================================================================
-- A handful of endpoints are open on purpose: subscribing to a creator,
-- leaving an email on a page, checking a discount code, asking for a password
-- reset, asking for a receipt to be sent again. Nothing limited how often any
-- of them could be called, so one script could flood a creator's subscriber
-- list, guess discount codes until one worked, or use the password reset form
-- to mail somebody a few thousand times.
--
-- WHY A TABLE AND NOT A VARIABLE. Serverless functions scale sideways: ten
-- concurrent invocations each start with an empty counter in memory and each
-- let the request through. The count has to live somewhere all of them can
-- see, and the database is already there. No Redis, no new service, no new
-- thing to pay for or to go down.
--
-- Rows are tiny and short lived. Nothing here is read after the longest
-- window has passed, and lib/api/rate-limit.ts sweeps the old ones.

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  -- Which limit this is counted against, e.g. "subscribe".
  bucket TEXT NOT NULL,
  -- Who is being counted: an address, an email. Never anything private in
  -- its own right, and never read back out, only counted.
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query this table serves: how many for this bucket and subject
-- since a moment. Descending on time so the window is a prefix of the index.
CREATE INDEX IF NOT EXISTS rate_limit_hits_lookup
  ON rate_limit_hits (bucket, subject, created_at DESC);

-- And the sweep, which is by time alone.
CREATE INDEX IF NOT EXISTS rate_limit_hits_sweep
  ON rate_limit_hits (created_at);

-- ---------------------------------------------------------------------------
-- NOBODY REACHES THIS BUT THE SERVER.
--
-- Row level security on with NO policies at all is not an oversight: it is
-- the strictest possible setting. Every ordinary key is refused, and the
-- service role bypasses policies by design, which is the only thing that
-- touches this table. A visitor cannot read how often anyone has been
-- counted, and cannot write rows to exhaust somebody else's allowance.
-- ---------------------------------------------------------------------------
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
