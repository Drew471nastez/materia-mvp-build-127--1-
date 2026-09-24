/* Coupons: a minimum order the checkout can check, a use count two orders cannot race, and no public list of codes. Safe to run twice. One statement per line. */

/* The minimum order, in cents. lib/checkout/coupons.ts already reads it at checkout; the coupon form writes it. */
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_purchase_cents integer;

/* A minimum is never negative. NOT VALID, so rows already there are not rechecked. */
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_min_purchase_cents_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_min_purchase_cents_check CHECK (min_purchase_cents IS NULL OR min_purchase_cents > 0) NOT VALID;

/* A use limit is a positive number or none. */
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_usage_limit_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_usage_limit_check CHECK (usage_limit IS NULL OR usage_limit > 0) NOT VALID;

/* One use of a code, counted in one statement, so two orders placed together both count. Called by recordCouponUse with the service role, which it falls back from today with a read then a write. */
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = coupon_id; $$;

/* Only the server may count a use. */
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO service_role;

/* Nobody reads another creator's codes. The checkout and the Apply button read coupons on the server with the service role, so this policy only ever let anyone holding the public key list every active code of every creator. Creators keep "Creators manage own coupons". */
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
