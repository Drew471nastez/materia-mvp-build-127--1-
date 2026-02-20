-- ============================================================================
-- Seller Ledger: Platform source of truth for payout balances (Stan-style)
-- ============================================================================

CREATE TABLE IF NOT EXISTS seller_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id          UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  -- Live balance buckets (all USD cents)
  pending_amount      INTEGER NOT NULL DEFAULT 0,
  available_amount    INTEGER NOT NULL DEFAULT 0,
  in_transit_amount   INTEGER NOT NULL DEFAULT 0,

  -- Lifetime counters (all USD cents)
  lifetime_earnings   INTEGER NOT NULL DEFAULT 0,
  lifetime_fees       INTEGER NOT NULL DEFAULT 0,
  lifetime_refunds    INTEGER NOT NULL DEFAULT 0,
  lifetime_paid_out   INTEGER NOT NULL DEFAULT 0,

  -- Negative balance (refund after payout scenario)
  negative_balance    INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_creator_ledger UNIQUE (creator_id),
  CONSTRAINT chk_pending_non_negative CHECK (pending_amount >= 0),
  CONSTRAINT chk_available_non_negative CHECK (available_amount >= 0),
  CONSTRAINT chk_in_transit_non_negative CHECK (in_transit_amount >= 0),
  CONSTRAINT chk_negative_non_negative CHECK (negative_balance >= 0)
);

CREATE INDEX IF NOT EXISTS idx_seller_ledger_creator ON seller_ledger(creator_id);

-- Auto-update updated_at
CREATE TRIGGER set_seller_ledger_updated_at
  BEFORE UPDATE ON seller_ledger
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE seller_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators view own ledger"
  ON seller_ledger FOR SELECT
  USING (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE POLICY "service role full access on seller_ledger"
  ON seller_ledger FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================================
-- Ledger Events: Append-only audit trail for all balance changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS ledger_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id        UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  event_type        TEXT NOT NULL CHECK (event_type IN (
    'sale',
    'refund',
    'hold_release',
    'cashout_initiated',
    'cashout_completed',
    'cashout_failed',
    'dispute_created',
    'dispute_closed',
    'adjustment'
  )),

  -- Amounts (always positive, direction from event_type + deltas)
  amount_cents      INTEGER NOT NULL,
  net_seller_cents  INTEGER,
  fee_cents         INTEGER DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'usd',

  -- Bucket deltas (signed: + adds, - subtracts)
  pending_delta     INTEGER DEFAULT 0,
  available_delta   INTEGER DEFAULT 0,
  in_transit_delta  INTEGER DEFAULT 0,

  -- References
  order_id          UUID REFERENCES orders(id),
  stripe_payout_id  TEXT,
  stripe_refund_id  TEXT,
  stripe_dispute_id TEXT,

  -- Hold tracking (for sale events)
  hold_until        TIMESTAMPTZ,
  released_at       TIMESTAMPTZ,

  description       TEXT,
  metadata          JSONB DEFAULT '{}',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_events_creator ON ledger_events(creator_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_type ON ledger_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_events_order ON ledger_events(order_id);
CREATE INDEX IF NOT EXISTS idx_ledger_events_hold ON ledger_events(hold_until)
  WHERE event_type = 'sale' AND released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ledger_events_created ON ledger_events(created_at DESC);

ALTER TABLE ledger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators view own ledger events"
  ON ledger_events FOR SELECT
  USING (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE POLICY "service role full access on ledger_events"
  ON ledger_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ============================================================================
-- Payout Hold Config: Admin-configurable hold settings
-- ============================================================================

CREATE TABLE IF NOT EXISTS payout_hold_config (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_days         INTEGER NOT NULL DEFAULT 7,
  min_cashout_cents INTEGER NOT NULL DEFAULT 1000,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payout_hold_config (hold_days, min_cashout_cents) VALUES (7, 1000);

ALTER TABLE payout_hold_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read hold config"
  ON payout_hold_config FOR SELECT USING (true);
