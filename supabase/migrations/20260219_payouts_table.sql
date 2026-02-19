-- Payouts table: logs Stripe payouts created via the Withdraw button
-- Each row represents one Stripe payout (po_xxx) for a connected seller account.

CREATE TABLE IF NOT EXISTS payouts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  stripe_payout_id text NOT NULL UNIQUE,
  amount_cents    integer NOT NULL,
  currency        text NOT NULL DEFAULT 'usd',
  status          text NOT NULL DEFAULT 'pending',
  -- e.g. "pending" | "in_transit" | "paid" | "failed" | "canceled"
  arrival_date    timestamptz,
  description     text,
  destination     text,           -- bank account last4 / external_account id
  method          text,           -- "standard" | "instant"
  failure_code    text,
  failure_message text,
  -- webhook metadata
  stripe_created  timestamptz,
  webhook_received_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by creator
CREATE INDEX IF NOT EXISTS payouts_creator_id_idx ON payouts(creator_id);
CREATE INDEX IF NOT EXISTS payouts_stripe_payout_id_idx ON payouts(stripe_payout_id);

-- RLS: creators can only see their own payouts
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators can view own payouts"
  ON payouts FOR SELECT
  USING (
    creator_id IN (
      SELECT id FROM creators WHERE user_id = auth.uid()
    )
  );

-- Service role bypass handled by admin client (no INSERT/UPDATE policy needed for anon/user)

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_payouts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_payouts_updated_at ON payouts;
CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION update_payouts_updated_at();
