-- Payout events table: logs every payout created via withdraw or Stripe webhook
CREATE TABLE IF NOT EXISTS payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  stripe_payout_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT,
  destination TEXT,
  arrival_date TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_events_creator ON payout_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_payout_events_stripe_id ON payout_events(stripe_payout_id);

-- Webhook events log for idempotency and debugging
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  stripe_account_id TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe ON webhook_events(stripe_event_id);

-- RLS
ALTER TABLE payout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access these tables (server-side only)
CREATE POLICY "Service role full access on payout_events"
  ON payout_events FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on webhook_events"
  ON webhook_events FOR ALL
  USING (true)
  WITH CHECK (true);
