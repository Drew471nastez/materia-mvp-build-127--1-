-- Stripe payment-method domains for a creator's own hostname.
-- Written by the server after a domain is DNS-verified and active.
-- storelib.com is not a row here. Run once in the SQL editor.

CREATE TABLE IF NOT EXISTS public.stripe_payment_method_domains (
  hostname text PRIMARY KEY,
  custom_domain_id uuid REFERENCES public.custom_domains(id) ON DELETE SET NULL,
  stripe_pmd_id text,
  apple_pay_status text,
  google_pay_status text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_payment_method_domains_domain
  ON public.stripe_payment_method_domains (custom_domain_id);

ALTER TABLE public.stripe_payment_method_domains ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_payment_method_domains FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
