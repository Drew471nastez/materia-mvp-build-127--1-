-- ============================================================================
--  A REFUND IS RECORDED ON A ROW ONCE
--
--  lib/stripe/refund-sync.ts writes one ledger_events row per (Stripe refund,
--  order row) and reads it as the record that the refund has been applied to
--  that row. It checks before writing, which covers a retried event; this
--  index covers two deliveries of the same event running at the same moment:
--  the second insert fails with 23505 and the sync reads that as "already
--  applied". Additive, and safe to run twice.
--
--  If it fails with "could not create unique index", a refund was already
--  recorded twice on the same row by the old webhook. Find it with:
--    SELECT stripe_refund_id, order_id, count(*) FROM public.ledger_events
--    WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_refund_once
  ON public.ledger_events (stripe_refund_id, order_id)
  WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL;
