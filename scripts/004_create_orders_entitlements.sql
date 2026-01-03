-- Create orders table FIRST (no dependencies on other new tables)
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create entitlements table (needed by other tables' RLS policies)
CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  community_access BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_buyer_product UNIQUE (buyer_id, product_id)
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

-- Orders policies
CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Creators can view orders for their products"
  ON public.orders FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = orders.product_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "System can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Entitlements policies
CREATE POLICY "Users can view their own entitlements"
  ON public.entitlements FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Creators can view entitlements for their products"
  ON public.entitlements FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = entitlements.creator_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "System can insert entitlements"
  ON public.entitlements FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_entitlements_buyer ON public.entitlements(buyer_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_product ON public.entitlements(product_id);
