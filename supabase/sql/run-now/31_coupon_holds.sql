/* Discount code limits two buyers at once cannot pass: a payment that starts with a limited code holds a place under the limit, the order turns it into the use, an abandoned payment gives it back or it expires after 35 minutes (lib/checkout/coupon-holds.ts). Server only. Source: supabase/migrations/20261004_coupon_holds.sql. Until it runs the checkout counts uses as before. */
CREATE TABLE IF NOT EXISTS public.coupon_holds ( coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE, holder text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (coupon_id, holder) );
ALTER TABLE public.coupon_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coupon_holds FROM anon, authenticated;
/* Takes or refreshes a holder's place. The code's row is locked first, so two calls for one code run one after the other, and the second counts the first one's place. Expired places are cleared on the way. True when there is room (always, for a code with no limit), false when there is none. */
CREATE OR REPLACE FUNCTION public.hold_coupon_use(p_coupon_id uuid, p_holder text, p_seconds integer) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ DECLARE lim integer; used integer; others integer; BEGIN SELECT c.usage_limit, coalesce(c.usage_count, 0) INTO lim, used FROM public.coupons c WHERE c.id = p_coupon_id FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF; DELETE FROM public.coupon_holds h WHERE h.coupon_id = p_coupon_id AND h.expires_at < now(); IF lim IS NULL THEN RETURN true; END IF; SELECT count(*) INTO others FROM public.coupon_holds h WHERE h.coupon_id = p_coupon_id AND h.holder <> p_holder; IF used + others >= lim THEN RETURN false; END IF; INSERT INTO public.coupon_holds (coupon_id, holder, expires_at) VALUES (p_coupon_id, p_holder, now() + make_interval(secs => greatest(60, least(coalesce(p_seconds, 2100), 86400)))) ON CONFLICT (coupon_id, holder) DO UPDATE SET expires_at = excluded.expires_at; RETURN true; END $$;
/* One use counted and the holder's place dropped, in one statement each, the code's row locked first as above. Counted whether or not the place was still there: the order exists. */
CREATE OR REPLACE FUNCTION public.use_coupon_hold(p_coupon_id uuid, p_holder text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$ BEGIN UPDATE public.coupons SET usage_count = coalesce(usage_count, 0) + 1 WHERE id = p_coupon_id; DELETE FROM public.coupon_holds WHERE coupon_id = p_coupon_id AND holder = p_holder; END $$;
/* A place given back: the payment it was for will not happen. */
CREATE OR REPLACE FUNCTION public.release_coupon_hold(p_coupon_id uuid, p_holder text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ DELETE FROM public.coupon_holds WHERE coupon_id = p_coupon_id AND holder = p_holder; $$;
/* Only the server holds, uses and gives back places. */
REVOKE ALL ON FUNCTION public.hold_coupon_use(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_coupon_use(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_coupon_use(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.use_coupon_hold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.use_coupon_hold(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_coupon_hold(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_coupon_hold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_coupon_hold(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_coupon_hold(uuid, text) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupon_holds TO service_role;
