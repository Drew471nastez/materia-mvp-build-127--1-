/* OnePage tips on the seller's balance, round tips-ledger, part 471 (run after 64 and 442). A tip on a OnePage is a Stripe destination charge to the creator's connected account, so Stripe pays it out with everything else, but it was kept in public.onepage_tips and never posted to public.seller_ledger and public.ledger_events: the in-app balance and its history left it out, and a refund or a dispute of one took money off a balance that never had it. The app now posts each paid tip through public.ledger_post as a sale under the key 'tip:' and its Checkout Session (lib/onepage/tips-ledger), from the webhook or the visitor's return, whichever is first, and a refund of one under 'refund:' and the refund and the tip's key. This part posts every tip from before: only a tip whose status is 'paid', with an amount and a known platform fee, with no ledger row under its key and no refund recorded against it; each one the same way the app does (amount less the application fee Stripe kept back, in the wallet's currency at the ECB rate of its day from public.fx_rates when the wallet's currency can be read from the ledger, else in the tip's own currency, as the app does without a rate), held three days from the tip, which the hold release then makes available. ledger_release_due learns that a tip's refund is matched by its key (a tip has no order), so a tip refunded while held is not released in full. Two indexes: tips by PaymentIntent (a refund or dispute finds its tip) and ledger rows by tip key. Does nothing before parts 64 and 411. Safe to run again: a tip already posted is skipped by the anti-join and by ledger_post's own key. */
DO $do$ BEGIN IF to_regclass('public.onepage_tips') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS onepage_tips_intent_idx ON public.onepage_tips (payment_intent_id) WHERE payment_intent_id IS NOT NULL; END IF; IF to_regclass('public.ledger_events') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS ledger_events_tip_key_idx ON public.ledger_events ((metadata ->> 'tip_key')) WHERE metadata ? 'tip_key'; END IF; END $do$;
CREATE OR REPLACE FUNCTION public.ledger_release_due(p_now timestamptz DEFAULT now()) RETURNS TABLE (creator_id uuid, released bigint, to_available bigint, events integer) LANGUAGE plpgsql SET search_path = public AS $f$ #variable_conflict use_column DECLARE c uuid; ids uuid[]; amt bigint; take bigint; l public.seller_ledger%ROWTYPE; BEGIN FOR c IN SELECT DISTINCT e.creator_id FROM public.ledger_events e WHERE e.event_type = 'sale' AND e.released_at IS NULL AND e.hold_until <= p_now LOOP INSERT INTO public.seller_ledger (creator_id) VALUES (c) ON CONFLICT (creator_id) DO NOTHING; SELECT * INTO l FROM public.seller_ledger s WHERE s.creator_id = c FOR UPDATE; SELECT array_agg(x.id ORDER BY x.id) INTO ids FROM (SELECT e.id FROM public.ledger_events e WHERE e.creator_id = c AND e.event_type = 'sale' AND e.released_at IS NULL AND e.hold_until <= p_now FOR UPDATE SKIP LOCKED) x; IF ids IS NULL THEN CONTINUE; END IF; SELECT coalesce(sum(greatest(0, coalesce(s.net_seller_cents, 0) - coalesce((SELECT sum(greatest(0, -coalesce(r.pending_delta, 0))) FROM public.ledger_events r WHERE r.event_type = 'refund' AND (r.order_id = s.order_id OR (s.order_id IS NULL AND s.idempotency_key LIKE 'tip:%' AND r.metadata ->> 'tip_key' = s.idempotency_key))), 0))), 0) INTO amt FROM public.ledger_events s WHERE s.id = ANY (ids); UPDATE public.ledger_events e SET released_at = p_now WHERE e.id = ANY (ids); take := least(amt, l.negative_balance); UPDATE public.seller_ledger s SET pending_amount = greatest(0, s.pending_amount - amt), available_amount = s.available_amount + (amt - take), negative_balance = s.negative_balance - take WHERE s.creator_id = c; INSERT INTO public.ledger_events (creator_id, event_type, amount_cents, net_seller_cents, currency, pending_delta, available_delta, description, idempotency_key) VALUES (c, 'hold_release', amt::integer, (amt - take)::integer, 'usd', (-least(amt, l.pending_amount))::integer, (amt - take)::integer, 'Hold released: $' || to_char(amt / 100.0, 'FM999999990.00') || ' cleared', 'release:' || c || ':' || md5(array_to_string(ids, ','))); creator_id := c; released := amt; to_available := amt - take; events := array_length(ids, 1); RETURN NEXT; END LOOP; END $f$;
REVOKE ALL ON FUNCTION public.ledger_release_due(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ledger_release_due(timestamptz) TO service_role;
DO $do$
DECLARE
  t record;
  wallet text;
  fx jsonb;
  dec_from integer;
  dec_to integer;
  r_from numeric;
  r_to numeric;
  fee bigint;
  w_total bigint;
  w_fee bigint;
  w_cur text;
  converted boolean;
  k text;
  posted integer := 0;
  skipped integer := 0;
BEGIN
  IF to_regclass('public.onepage_tips') IS NULL OR to_regclass('public.ledger_events') IS NULL OR to_regprocedure('public.ledger_post(uuid,text,text,bigint,jsonb)') IS NULL THEN
    RAISE NOTICE 'part 471 skipped: public.onepage_tips (part 411) or public.ledger_post (part 64) is not here yet';
    RETURN;
  END IF;
  /* The wallet's currency, as the app writes it: a cash out's, or a sale converted into it. Not readable: every tip keeps its own currency. */
  wallet := coalesce(
    (SELECT lower(e.currency) FROM public.ledger_events e WHERE e.event_type = 'cashout_initiated' AND e.currency IS NOT NULL ORDER BY e.created_at DESC LIMIT 1),
    (SELECT lower(e.currency) FROM public.ledger_events e WHERE e.event_type = 'sale' AND e.description LIKE '%(from %' AND e.currency IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)
  );
  FOR t IN
    SELECT p.* FROM public.onepage_tips p
    WHERE p.status = 'paid' AND p.amount_cents > 0 AND p.platform_fee_cents IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.ledger_events e WHERE e.idempotency_key = 'tip:' || p.checkout_session_id)
      AND NOT EXISTS (SELECT 1 FROM public.ledger_events r WHERE r.event_type = 'refund' AND r.metadata ->> 'tip_key' = 'tip:' || p.checkout_session_id)
    ORDER BY p.created_at, p.id
  LOOP
    k := 'tip:' || t.checkout_session_id;
    fee := least(greatest(t.platform_fee_cents, 0), t.amount_cents);
    w_total := t.amount_cents;
    w_fee := fee;
    w_cur := lower(t.currency);
    converted := false;
    dec_from := CASE WHEN upper(t.currency) IN ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF') THEN 0 WHEN upper(t.currency) IN ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND') THEN 3 ELSE 2 END;
    dec_to := dec_from;
    IF wallet IS NOT NULL AND wallet <> lower(t.currency) AND to_regclass('public.fx_rates') IS NOT NULL THEN
      fx := (SELECT f.rates FROM public.fx_rates f WHERE f.as_of <= t.created_at::date AND f.as_of >= t.created_at::date - 5 ORDER BY f.as_of DESC LIMIT 1);
      r_from := CASE WHEN upper(t.currency) = 'EUR' THEN 1 ELSE nullif(fx ->> upper(t.currency), '')::numeric END;
      r_to := CASE WHEN upper(wallet) = 'EUR' THEN 1 ELSE nullif(fx ->> upper(wallet), '')::numeric END;
      IF fx IS NOT NULL AND r_from > 0 AND r_to > 0 THEN
        dec_to := CASE WHEN upper(wallet) IN ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF') THEN 0 WHEN upper(wallet) IN ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND') THEN 3 ELSE 2 END;
        w_total := round(t.amount_cents / power(10::numeric, dec_from) * (r_to / r_from) * power(10::numeric, dec_to));
        w_fee := round(fee / power(10::numeric, dec_from) * (r_to / r_from) * power(10::numeric, dec_to));
        w_cur := wallet;
        converted := true;
      END IF;
    END IF;
    IF coalesce((public.ledger_post(t.creator_id, k, 'sale', greatest(w_total - w_fee, 0), jsonb_build_object(
      'event_type', 'sale',
      'amount_cents', w_total,
      'net_seller_cents', greatest(w_total - w_fee, 0),
      'fee_cents', w_fee,
      'currency', w_cur,
      'hold_until', t.created_at + interval '3 days',
      'description', 'Tip from ' || coalesce(nullif(left(btrim(t.tipper_name), 80), ''), 'Anonymous') || ': ' || upper(w_cur) || ' ' || round(w_total / power(10::numeric, dec_to), dec_to)::text || CASE WHEN converted THEN ' (from ' || upper(t.currency) || ' ' || round(t.amount_cents / power(10::numeric, dec_from), dec_from)::text || ')' ELSE '' END || ' (net ' || upper(w_cur) || ' ' || round(greatest(w_total - w_fee, 0) / power(10::numeric, dec_to), dec_to)::text || ')',
      'metadata', jsonb_build_object('kind', 'tip', 'tip_key', k, 'tip_id', t.id, 'checkout_session_id', t.checkout_session_id, 'payment_intent_id', t.payment_intent_id, 'onepage_id', t.onepage_id, 'block_id', t.block_id, 'tipper_name', t.tipper_name, 'charged_cents', t.amount_cents, 'charged_fee_cents', fee, 'charged_currency', lower(t.currency), 'backfill', 471),
      'add_lifetime_earnings', w_total,
      'add_lifetime_fees', w_fee
    )) ->> 'applied')::boolean, false) THEN
      posted := posted + 1;
    ELSE
      skipped := skipped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'part 471: % tips posted to the seller ledger, % already there', posted, skipped;
END $do$;
notify pgrst, 'reload schema';
