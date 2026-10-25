-- The tables store_change_currency reads, shaped as production has them (only
-- the columns the function touches), for tests/offers-ag.test.ts. Parts 176,
-- 258 and 306 are run on top, as Supabase runs them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.creators (id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.store_settings (creator_id uuid PRIMARY KEY REFERENCES public.creators(id), checkout jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz DEFAULT now());
CREATE TABLE public.products (id uuid PRIMARY KEY, creator_id uuid, type text, price_cents integer, compare_at_cents integer, pwyw_min_price_cents integer, pwyw_suggested_price_cents integer);
CREATE TABLE public.product_variants (id uuid PRIMARY KEY, product_id uuid, price_cents integer, compare_at_price_cents integer, additional_price_cents integer);
CREATE TABLE public.store_offers (id uuid PRIMARY KEY, creator_id uuid, kind text, title text, product_ids uuid[] NOT NULL DEFAULT '{}', discount_type text NOT NULL DEFAULT 'percent', discount_value integer NOT NULL DEFAULT 0, min_subtotal_cents integer, tiers jsonb NOT NULL DEFAULT '[]'::jsonb);
INSERT INTO public.creators VALUES ('a6000000-0000-4000-8000-000000000001', NULL), ('a6000000-0000-4000-8000-000000000002', NULL);
INSERT INTO public.store_settings (creator_id) VALUES ('a6000000-0000-4000-8000-000000000001'), ('a6000000-0000-4000-8000-000000000002');
INSERT INTO public.products VALUES ('a6000000-0000-4000-8000-0000000000a1', 'a6000000-0000-4000-8000-000000000001', 'physical', 3600, 4500, NULL, NULL);
INSERT INTO public.product_variants VALUES ('a6000000-0000-4000-8000-0000000000b1', 'a6000000-0000-4000-8000-0000000000a1', 3600, 4500, NULL);
-- A quantity break: Buy 2 get 1 free, Buy 4 for 15% off, Buy 5 for $5.00 off. A bundle with $7.00 off, an upsell with a $30.00 minimum. And another store's break, which never moves.
INSERT INTO public.store_offers (id, creator_id, kind, title, product_ids, discount_type, discount_value, min_subtotal_cents, tiers) VALUES
  ('a6000000-0000-4000-8000-0000000000e1', 'a6000000-0000-4000-8000-000000000001', 'quantity_break', 'Buy more', '{a6000000-0000-4000-8000-0000000000a1}', 'none', 0, NULL, '[{"quantity":2,"freeQuantity":1,"discountType":"none","discountValue":0,"label":"Buy 2 get 1 free","badge":""},{"quantity":4,"freeQuantity":0,"discountType":"percent","discountValue":15,"label":"4 for 15% off","badge":""},{"quantity":5,"freeQuantity":0,"discountType":"amount","discountValue":500,"label":"5 for $5 off","badge":"Best value"}]'),
  ('a6000000-0000-4000-8000-0000000000e2', 'a6000000-0000-4000-8000-000000000001', 'bundle', 'Set', '{}', 'fixed', 700, NULL, '[]'),
  ('a6000000-0000-4000-8000-0000000000e3', 'a6000000-0000-4000-8000-000000000001', 'checkout', 'Add one', '{}', 'percent', 20, 3000, '[]'),
  ('a6000000-0000-4000-8000-0000000000e4', 'a6000000-0000-4000-8000-000000000002', 'quantity_break', 'Theirs', '{}', 'none', 0, NULL, '[{"quantity":2,"freeQuantity":0,"discountType":"amount","discountValue":500,"label":"2 for $5 off","badge":""}]');
