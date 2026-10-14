/* A store's own selling currency (Settings › Store details › Country & Currency). `store_settings.currency`: the currency the store prices its catalog in and its website charges, as a three letter code; empty means the platform's currency, which is what every store sold in before, so nothing changes for a store until it chooses. Changing it goes through one function, `store_change_currency`, in one transaction: either the prices keep their numbers ("keep": 100 EUR becomes 100 USD) or every price the store owns is converted at the rate the merchant was shown ("convert"): products (price, compare-at, pay what you want minimum and suggestion), options (price, compare-at, the older added price), option costs, shipping rates (price, free over, the order value ranges and steps of a rate by order value), local delivery (price, minimum, free over), fixed coupons and their minimums, and the cash on delivery fee. Orders, refunds, invoices, payouts and the wallet keep the currency they were made in and are never touched. `store_currency_changes` records each change once per request key, so a second press or a retry returns the first result instead of converting twice. `store_currency_snapshots` keeps every converted value as it was, so `store_currency_restore` can put the prices back exactly (only the store's latest change, so a later one is never overwritten). All three are server only. Safe to run again. */

ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS currency text;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_currency_code') THEN ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_currency_code CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'); END IF; END $do$;

CREATE TABLE IF NOT EXISTS public.store_currency_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  from_currency text NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency text NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  /* What store_settings.currency held before: empty when the store had never chosen and sold in the platform's currency. */
  previous_currency text CHECK (previous_currency IS NULL OR previous_currency ~ '^[A-Z]{3}$'),
  mode text NOT NULL CHECK (mode IN ('keep', 'convert')),
  rate numeric(24, 12) CHECK (rate IS NULL OR rate > 0),
  rate_as_of date,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 120),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  CONSTRAINT store_currency_changes_rate_when_converting CHECK (mode = 'keep' OR rate IS NOT NULL),
  CONSTRAINT store_currency_changes_once UNIQUE (creator_id, request_key)
);
ALTER TABLE public.store_currency_changes ADD COLUMN IF NOT EXISTS previous_currency text;
CREATE INDEX IF NOT EXISTS store_currency_changes_creator_idx ON public.store_currency_changes (creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.store_currency_snapshots (
  change_id uuid NOT NULL REFERENCES public.store_currency_changes(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  before jsonb NOT NULL CHECK (jsonb_typeof(before) = 'object'),
  PRIMARY KEY (change_id, table_name, row_id)
);

ALTER TABLE public.store_currency_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_currency_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_currency_changes FROM anon, authenticated;
REVOKE ALL ON public.store_currency_snapshots FROM anon, authenticated;

/* The money columns a store owns, table by table: how a row is found for one store, the key a snapshot keeps, and the columns in hundredths. Only the columns this database has are touched. */
CREATE OR REPLACE FUNCTION public.store_currency_targets() RETURNS TABLE (table_name text, key_column text, store_filter text, money_columns text[]) LANGUAGE sql IMMUTABLE AS $fn$
  VALUES
    ('products', 'id', 'creator_id = $1', ARRAY['price_cents', 'compare_at_cents', 'pwyw_min_price_cents', 'pwyw_suggested_price_cents']),
    ('product_variants', 'id', 'product_id IN (SELECT p.id FROM public.products p WHERE p.creator_id = $1)', ARRAY['price_cents', 'compare_at_price_cents', 'additional_price_cents']),
    ('product_variant_costs', 'variant_id', 'creator_id = $1', ARRAY['cost_cents']),
    ('shipping_rates', 'id', 'creator_id = $1', ARRAY['price_cents', 'free_over_cents']),
    ('inventory_locations', 'id', 'creator_id = $1', ARRAY['local_delivery_price_cents', 'local_delivery_min_cents', 'local_delivery_free_over_cents']),
    ('coupons', 'id', 'creator_id = $1', ARRAY['min_purchase_cents'])
$fn$;

CREATE OR REPLACE FUNCTION public.store_change_currency(p_creator uuid, p_from text, p_to text, p_mode text, p_rate numeric, p_rate_as_of date, p_key text, p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_prev public.store_currency_changes%ROWTYPE;
  v_stored text;
  v_change uuid := gen_random_uuid();
  v_counts jsonb := '{}'::jsonb;
  v_target record;
  v_cols text[];
  v_set text;
  v_snap text;
  v_n integer;
BEGIN
  IF p_creator IS NULL THEN RAISE EXCEPTION 'store_currency: no store' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from !~ '^[A-Z]{3}$' OR p_to !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'store_currency: a currency is not a code' USING ERRCODE = '22023'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'store_currency: the store already sells in %', p_to USING ERRCODE = '22023'; END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('keep', 'convert') THEN RAISE EXCEPTION 'store_currency: mode is keep or convert' USING ERRCODE = '22023'; END IF;
  IF p_mode = 'convert' AND (p_rate IS NULL OR p_rate <= 0 OR p_rate > 1000000) THEN RAISE EXCEPTION 'store_currency: converting needs a rate' USING ERRCODE = '22023'; END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 120 THEN RAISE EXCEPTION 'store_currency: a request key is needed' USING ERRCODE = '22023'; END IF;

  /* One change at a time per store: the settings row is the lock. */
  INSERT INTO public.store_settings (creator_id) VALUES (p_creator) ON CONFLICT (creator_id) DO NOTHING;
  SELECT currency INTO v_stored FROM public.store_settings WHERE creator_id = p_creator FOR UPDATE;

  /* The same request again (a second press, a retry): the first result, never a second conversion. */
  SELECT * INTO v_prev FROM public.store_currency_changes WHERE creator_id = p_creator AND request_key = p_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'repeat', true, 'id', v_prev.id, 'from', v_prev.from_currency, 'to', v_prev.to_currency, 'mode', v_prev.mode, 'rate', v_prev.rate, 'counts', v_prev.counts);
  END IF;

  /* The currency the merchant saw when they chose must still be the store's: two tabs never convert twice. */
  IF coalesce(v_stored, p_from) <> p_from THEN RAISE EXCEPTION 'store_currency: the store now sells in %', v_stored USING ERRCODE = '40001'; END IF;

  INSERT INTO public.store_currency_changes (id, creator_id, from_currency, to_currency, previous_currency, mode, rate, rate_as_of, request_key, created_by)
  VALUES (v_change, p_creator, p_from, p_to, v_stored, p_mode, CASE WHEN p_mode = 'convert' THEN p_rate END, CASE WHEN p_mode = 'convert' THEN p_rate_as_of END, p_key, p_user);

  IF p_mode = 'convert' THEN
    FOR v_target IN SELECT * FROM public.store_currency_targets() LOOP
      IF to_regclass('public.' || v_target.table_name) IS NULL THEN CONTINUE; END IF;
      SELECT array_agg(c ORDER BY c) INTO v_cols FROM unnest(v_target.money_columns) AS c
        WHERE EXISTS (SELECT 1 FROM information_schema.columns ic WHERE ic.table_schema = 'public' AND ic.table_name = v_target.table_name AND ic.column_name = c);
      IF v_target.table_name = 'shipping_rates' THEN
        /* A rate by order value keeps its range and steps in hundredths too; by weight or quantity they are grams and items, and stay. */
        v_cols := coalesce(v_cols, ARRAY[]::text[]) || ARRAY['min_value', 'max_value', 'tiers', 'kind'];
      ELSIF v_target.table_name = 'coupons' THEN
        v_cols := coalesce(v_cols, ARRAY[]::text[]) || ARRAY['discount_value', 'discount_type'];
      END IF;
      IF v_cols IS NULL OR array_length(v_cols, 1) IS NULL THEN CONTINUE; END IF;

      v_snap := format('INSERT INTO public.store_currency_snapshots (change_id, table_name, row_id, before) SELECT $2, %L, t.%I, jsonb_build_object(%s) FROM public.%I t WHERE %s',
        v_target.table_name, v_target.key_column,
        (SELECT string_agg(format('%L, t.%I', c, c), ', ') FROM unnest(v_cols) AS c),
        v_target.table_name, v_target.store_filter);
      EXECUTE v_snap USING p_creator, v_change;
      GET DIAGNOSTICS v_n = ROW_COUNT;

      IF v_target.table_name = 'shipping_rates' THEN
        v_set := concat_ws(', ',
          CASE WHEN 'price_cents' = ANY (v_cols) THEN 'price_cents = round(price_cents * $2)::integer' END,
          CASE WHEN 'free_over_cents' = ANY (v_cols) THEN 'free_over_cents = CASE WHEN free_over_cents IS NULL THEN NULL ELSE round(free_over_cents * $2)::integer END' END,
          'min_value = CASE WHEN kind = ''price'' AND min_value IS NOT NULL THEN round(min_value * $2)::integer ELSE min_value END',
          'max_value = CASE WHEN kind = ''price'' AND max_value IS NOT NULL THEN round(max_value * $2)::integer ELSE max_value END',
          'tiers = CASE WHEN jsonb_typeof(tiers) = ''array'' AND jsonb_array_length(tiers) > 0 THEN (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = ''object'' THEN x || jsonb_strip_nulls(jsonb_build_object(''priceCents'', CASE WHEN x ? ''priceCents'' THEN round((x->>''priceCents'')::numeric * $2)::integer END, ''from'', CASE WHEN kind = ''price'' AND x ? ''from'' THEN round((x->>''from'')::numeric * $2)::integer END)) ELSE x END ORDER BY o), ''[]''::jsonb) FROM jsonb_array_elements(tiers) WITH ORDINALITY AS e(x, o)) ELSE tiers END');
      ELSIF v_target.table_name = 'coupons' THEN
        v_set := concat_ws(', ',
          CASE WHEN 'min_purchase_cents' = ANY (v_cols) THEN 'min_purchase_cents = CASE WHEN min_purchase_cents IS NULL THEN NULL ELSE round(min_purchase_cents * $2)::integer END' END,
          'discount_value = CASE WHEN discount_type = ''fixed'' THEN greatest(0.01, round(discount_value * $2, 2)) ELSE discount_value END');
      ELSE
        SELECT string_agg(format('%1$I = CASE WHEN %1$I IS NULL THEN NULL ELSE round(%1$I * $2)::integer END', c), ', ') INTO v_set FROM unnest(v_cols) AS c;
      END IF;
      EXECUTE format('UPDATE public.%I SET %s WHERE %s', v_target.table_name, v_set, v_target.store_filter) USING p_creator, p_rate;
      v_counts := v_counts || jsonb_build_object(v_target.table_name, v_n);
    END LOOP;

    /* The cash on delivery fee, kept with checkout's settings: kept as it was, then converted. */
    INSERT INTO public.store_currency_snapshots (change_id, table_name, row_id, before)
      SELECT v_change, 'store_settings', s.creator_id, jsonb_build_object('codFeeCents', s.checkout->'codFeeCents')
      FROM public.store_settings s WHERE s.creator_id = p_creator AND jsonb_typeof(s.checkout->'codFeeCents') = 'number';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      UPDATE public.store_settings
        SET checkout = jsonb_set(checkout, '{codFeeCents}', to_jsonb(round((checkout->>'codFeeCents')::numeric * p_rate)::integer))
        WHERE creator_id = p_creator;
      v_counts := v_counts || jsonb_build_object('cod_fee', 1);
    END IF;
  END IF;

  UPDATE public.store_settings SET currency = p_to, updated_at = now() WHERE creator_id = p_creator;
  UPDATE public.store_currency_changes SET counts = v_counts WHERE id = v_change;
  RETURN jsonb_build_object('ok', true, 'repeat', false, 'id', v_change, 'from', p_from, 'to', p_to, 'mode', p_mode, 'rate', CASE WHEN p_mode = 'convert' THEN p_rate END, 'counts', v_counts);
END
$fn$;

/* Puts a store's prices and currency back as they were before its latest change, from that change's snapshots. Refuses anything but the latest change, and a change already restored. */
CREATE OR REPLACE FUNCTION public.store_currency_restore(p_creator uuid, p_change uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  v_change public.store_currency_changes%ROWTYPE;
  v_latest uuid;
  v_target record;
  v_cols text[];
  v_set text;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  PERFORM 1 FROM public.store_settings WHERE creator_id = p_creator FOR UPDATE;
  SELECT * INTO v_change FROM public.store_currency_changes WHERE id = p_change AND creator_id = p_creator;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_currency: no such change' USING ERRCODE = '22023'; END IF;
  IF v_change.restored_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'repeat', true, 'currency', v_change.from_currency); END IF;
  SELECT id INTO v_latest FROM public.store_currency_changes WHERE creator_id = p_creator AND restored_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_latest IS DISTINCT FROM p_change THEN RAISE EXCEPTION 'store_currency: only the latest change can be undone' USING ERRCODE = '40001'; END IF;

  FOR v_target IN SELECT * FROM public.store_currency_targets() LOOP
    IF to_regclass('public.' || v_target.table_name) IS NULL THEN CONTINUE; END IF;
    SELECT array_agg(DISTINCT k) INTO v_cols FROM public.store_currency_snapshots s, jsonb_object_keys(s.before) AS k
      WHERE s.change_id = p_change AND s.table_name = v_target.table_name AND k NOT IN ('kind', 'discount_type');
    IF v_cols IS NULL THEN CONTINUE; END IF;
    SELECT string_agg(
      CASE c
        WHEN 'tiers' THEN 'tiers = s.before->''tiers'''
        WHEN 'discount_value' THEN 'discount_value = (s.before->>''discount_value'')::numeric'
        ELSE format('%1$I = (s.before->>%1$L)::integer', c)
      END, ', ') INTO v_set FROM unnest(v_cols) AS c;
    EXECUTE format('UPDATE public.%I t SET %s FROM public.store_currency_snapshots s WHERE s.change_id = $1 AND s.table_name = %L AND t.%I = s.row_id', v_target.table_name, v_set, v_target.table_name, v_target.key_column) USING p_change;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object(v_target.table_name, v_n);
  END LOOP;

  UPDATE public.store_settings t SET checkout = jsonb_set(t.checkout, '{codFeeCents}', s.before->'codFeeCents')
    FROM public.store_currency_snapshots s WHERE s.change_id = p_change AND s.table_name = 'store_settings' AND t.creator_id = s.row_id;

  /* Back to exactly what was stored: empty again for a store that had never chosen. */
  UPDATE public.store_settings SET currency = v_change.previous_currency, updated_at = now() WHERE creator_id = p_creator;
  UPDATE public.store_currency_changes SET restored_at = now() WHERE id = p_change;
  RETURN jsonb_build_object('ok', true, 'repeat', false, 'currency', v_change.from_currency, 'counts', v_counts);
END
$fn$;

REVOKE ALL ON FUNCTION public.store_currency_targets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_change_currency(uuid, text, text, text, numeric, date, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_currency_restore(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_currency_targets() TO service_role;
GRANT EXECUTE ON FUNCTION public.store_change_currency(uuid, text, text, text, numeric, date, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_currency_restore(uuid, uuid) TO service_role;

notify pgrst, 'reload schema';
