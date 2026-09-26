/* Customer accounts on creators' websites, as a Shopify store has them: a visitor types their email on the website, gets a six digit code, types it back and is signed in, and a new email makes the account there and then. Three tables: the customers (one per website and email), the sign in codes (kept only as a keyed hash, ten minutes, five tries, used once) and each customer's saved products. An account belongs to one creator's website and is not a Storelib login: nothing here touches auth.users, profiles or creators. Server only: row level security on, closed to the public key. Until it runs, Sign in on a website says it is not available yet. Needs nothing else. Source: supabase/migrations/20261005_site_customers.sql. */
CREATE TABLE IF NOT EXISTS public.site_customers ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, name text, created_at timestamptz NOT NULL DEFAULT now(), last_sign_in_at timestamptz, CONSTRAINT site_customers_email_lower CHECK (email = lower(email)), CONSTRAINT site_customers_sizes CHECK (char_length(email) BETWEEN 3 AND 254 AND char_length(coalesce(name, '')) <= 120) );
CREATE UNIQUE INDEX IF NOT EXISTS site_customers_creator_email ON public.site_customers (creator_id, email);
ALTER TABLE public.site_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customers FROM anon, authenticated;
GRANT ALL ON public.site_customers TO service_role;
CREATE TABLE IF NOT EXISTS public.site_customer_codes ( id uuid PRIMARY KEY, creator_id uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE, email text NOT NULL, host text NOT NULL, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT site_customer_codes_email_lower CHECK (email = lower(email)), CONSTRAINT site_customer_codes_attempts CHECK (attempts BETWEEN 0 AND 5) );
CREATE INDEX IF NOT EXISTS site_customer_codes_creator_email ON public.site_customer_codes (creator_id, email, created_at DESC);
CREATE INDEX IF NOT EXISTS site_customer_codes_created ON public.site_customer_codes (created_at);
ALTER TABLE public.site_customer_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customer_codes FROM anon, authenticated;
GRANT ALL ON public.site_customer_codes TO service_role;
CREATE TABLE IF NOT EXISTS public.site_customer_wishlist ( customer_id uuid NOT NULL REFERENCES public.site_customers(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (customer_id, product_id) );
CREATE INDEX IF NOT EXISTS site_customer_wishlist_product ON public.site_customer_wishlist (product_id);
ALTER TABLE public.site_customer_wishlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_customer_wishlist FROM anon, authenticated;
GRANT ALL ON public.site_customer_wishlist TO service_role;
notify pgrst, 'reload schema';
