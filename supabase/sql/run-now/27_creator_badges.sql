/* Badges Storelib grants a creator (the Veteran mark beside a name on the creator page and product pages). Nobody can give themselves one through the API: a trigger keeps the old value for signed-in and anonymous requests. Until this runs, the app grants the same badge by username, so running it changes nothing on the page. */
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS badges text[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.profiles_keep_badges() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_user IN ('authenticated', 'anon') THEN IF tg_op = 'INSERT' THEN new.badges := '{}'; ELSIF new.badges IS DISTINCT FROM old.badges THEN new.badges := old.badges; END IF; END IF; RETURN new; END $$;
DROP TRIGGER IF EXISTS profiles_keep_badges ON public.profiles;
CREATE TRIGGER profiles_keep_badges BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_keep_badges();
/* Veteran: Luca Dragoste (storelib.com/lucadragoste). A second run adds nothing. */
UPDATE public.profiles SET badges = array_append(badges, 'veteran') WHERE lower(username) = lower('lucadragoste') AND NOT ('veteran' = ANY(badges));
/* Who has a badge now. */
SELECT username, badges FROM public.profiles WHERE cardinality(badges) > 0;
