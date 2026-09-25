/* A Stripe refund is recorded on an order once. If this fails with "could not create unique index", see README. */
CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_refund_once ON public.ledger_events (stripe_refund_id, order_id) WHERE event_type = 'refund' AND stripe_refund_id IS NOT NULL;
