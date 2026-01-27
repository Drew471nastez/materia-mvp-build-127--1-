-- =====================================================
-- PRODUCT ANALYTICS SQL - Complete Ready-to-Paste SQL
-- =====================================================
-- This migration creates all necessary tables and policies
-- for tracking product analytics including views, refunds,
-- and related data.
-- =====================================================

-- =====================================================
-- 1. PRODUCT VIEWS TABLE
-- Tracks page views for each product
-- =====================================================
CREATE TABLE IF NOT EXISTS product_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    referrer TEXT,
    country_code TEXT,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON product_views(product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_viewed_at ON product_views(viewed_at);
CREATE INDEX IF NOT EXISTS idx_product_views_product_date ON product_views(product_id, viewed_at);

-- =====================================================
-- 2. REFUNDS TABLE
-- Tracks refunds for products
-- =====================================================
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    entitlement_id UUID REFERENCES entitlements(id) ON DELETE SET NULL,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_refunds_product_id ON refunds(product_id);
CREATE INDEX IF NOT EXISTS idx_refunds_buyer_id ON refunds(buyer_id);
CREATE INDEX IF NOT EXISTS idx_refunds_creator_id ON refunds(creator_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- =====================================================
-- 3. PRODUCT ANALYTICS SUMMARY TABLE (Optional - for faster queries)
-- Aggregated daily stats per product
-- =====================================================
CREATE TABLE IF NOT EXISTS product_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views_count INTEGER NOT NULL DEFAULT 0,
    unique_views_count INTEGER NOT NULL DEFAULT 0,
    orders_count INTEGER NOT NULL DEFAULT 0,
    revenue_cents BIGINT NOT NULL DEFAULT 0,
    refunds_count INTEGER NOT NULL DEFAULT 0,
    refund_amount_cents BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(product_id, date)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_product_analytics_daily_product_date ON product_analytics_daily(product_id, date);

-- =====================================================
-- 4. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE product_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_analytics_daily ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4.1 PRODUCT VIEWS POLICIES
-- =====================================================

-- Anyone can insert a view (for tracking)
CREATE POLICY "Anyone can insert product views"
ON product_views FOR INSERT
TO authenticated, anon
WITH CHECK (true);

-- Creators can view analytics for their own products
CREATE POLICY "Creators can view their product analytics"
ON product_views FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM products p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.id = product_views.product_id
        AND c.user_id = auth.uid()
    )
);

-- Service role has full access
CREATE POLICY "Service role full access to product_views"
ON product_views FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- 4.2 REFUNDS POLICIES
-- =====================================================

-- Buyers can view their own refunds
CREATE POLICY "Buyers can view their own refunds"
ON refunds FOR SELECT
TO authenticated
USING (buyer_id = auth.uid());

-- Creators can view refunds for their products
CREATE POLICY "Creators can view refunds for their products"
ON refunds FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM creators c
        WHERE c.id = refunds.creator_id
        AND c.user_id = auth.uid()
    )
);

-- Buyers can request refunds
CREATE POLICY "Buyers can request refunds"
ON refunds FOR INSERT
TO authenticated
WITH CHECK (buyer_id = auth.uid());

-- Creators can update refund status for their products
CREATE POLICY "Creators can update refunds for their products"
ON refunds FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM creators c
        WHERE c.id = refunds.creator_id
        AND c.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM creators c
        WHERE c.id = refunds.creator_id
        AND c.user_id = auth.uid()
    )
);

-- Service role has full access
CREATE POLICY "Service role full access to refunds"
ON refunds FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- 4.3 PRODUCT ANALYTICS DAILY POLICIES
-- =====================================================

-- Creators can view analytics for their own products
CREATE POLICY "Creators can view their daily analytics"
ON product_analytics_daily FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM products p
        JOIN creators c ON p.creator_id = c.id
        WHERE p.id = product_analytics_daily.product_id
        AND c.user_id = auth.uid()
    )
);

-- Service role has full access (for aggregation jobs)
CREATE POLICY "Service role full access to product_analytics_daily"
ON product_analytics_daily FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- 5. FUNCTIONS FOR TRACKING VIEWS
-- =====================================================

-- Function to track a product view
CREATE OR REPLACE FUNCTION track_product_view(
    p_product_id UUID,
    p_session_id TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_country_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_view_id UUID;
BEGIN
    INSERT INTO product_views (
        product_id,
        viewer_id,
        session_id,
        ip_hash,
        user_agent,
        referrer,
        country_code,
        viewed_at
    ) VALUES (
        p_product_id,
        auth.uid(),
        p_session_id,
        p_ip_hash,
        p_user_agent,
        p_referrer,
        p_country_code,
        NOW()
    )
    RETURNING id INTO v_view_id;

    RETURN v_view_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION track_product_view TO authenticated;
GRANT EXECUTE ON FUNCTION track_product_view TO anon;

-- =====================================================
-- 6. FUNCTION TO GET PRODUCT ANALYTICS
-- =====================================================

CREATE OR REPLACE FUNCTION get_product_analytics(p_product_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_creator_user_id UUID;
    v_total_views BIGINT;
    v_total_orders BIGINT;
    v_total_revenue BIGINT;
    v_total_refunds BIGINT;
    v_unique_customers BIGINT;
    v_first_sale TIMESTAMPTZ;
    v_last_sale TIMESTAMPTZ;
    v_product_created_at TIMESTAMPTZ;
BEGIN
    -- Check if user owns this product
    SELECT c.user_id, p.created_at INTO v_creator_user_id, v_product_created_at
    FROM products p
    JOIN creators c ON p.creator_id = c.id
    WHERE p.id = p_product_id;

    IF v_creator_user_id IS NULL OR v_creator_user_id != auth.uid() THEN
        RETURN json_build_object('error', 'Unauthorized');
    END IF;

    -- Get total views
    SELECT COUNT(*) INTO v_total_views
    FROM product_views
    WHERE product_id = p_product_id;

    -- Get total orders and revenue
    SELECT COUNT(*), COALESCE(SUM(o.amount_cents), 0)
    INTO v_total_orders, v_total_revenue
    FROM entitlements e
    LEFT JOIN orders o ON e.order_id = o.id
    WHERE e.product_id = p_product_id;

    -- Get total refunds
    SELECT COUNT(*) INTO v_total_refunds
    FROM refunds
    WHERE product_id = p_product_id
    AND status = 'completed';

    -- Get unique customers
    SELECT COUNT(DISTINCT buyer_id) INTO v_unique_customers
    FROM entitlements
    WHERE product_id = p_product_id;

    -- Get first and last sale
    SELECT MIN(created_at), MAX(created_at)
    INTO v_first_sale, v_last_sale
    FROM entitlements
    WHERE product_id = p_product_id;

    v_result := json_build_object(
        'views', v_total_views,
        'orders', v_total_orders,
        'revenue_cents', v_total_revenue,
        'refunds', v_total_refunds,
        'unique_customers', v_unique_customers,
        'first_sale', v_first_sale,
        'last_sale', v_last_sale,
        'product_created_at', v_product_created_at
    );

    RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_product_analytics TO authenticated;

-- =====================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers
DROP TRIGGER IF EXISTS update_refunds_updated_at ON refunds;
CREATE TRIGGER update_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_analytics_daily_updated_at ON product_analytics_daily;
CREATE TRIGGER update_product_analytics_daily_updated_at
    BEFORE UPDATE ON product_analytics_daily
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. OPTIONAL: AGGREGATE DAILY ANALYTICS FUNCTION
-- Run this periodically via cron job or edge function
-- =====================================================

CREATE OR REPLACE FUNCTION aggregate_daily_analytics(p_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO product_analytics_daily (
        product_id,
        date,
        views_count,
        unique_views_count,
        orders_count,
        revenue_cents,
        refunds_count,
        refund_amount_cents
    )
    SELECT
        p.id as product_id,
        p_date as date,
        COALESCE(v.views_count, 0) as views_count,
        COALESCE(v.unique_views_count, 0) as unique_views_count,
        COALESCE(o.orders_count, 0) as orders_count,
        COALESCE(o.revenue_cents, 0) as revenue_cents,
        COALESCE(r.refunds_count, 0) as refunds_count,
        COALESCE(r.refund_amount_cents, 0) as refund_amount_cents
    FROM products p
    LEFT JOIN (
        SELECT
            product_id,
            COUNT(*) as views_count,
            COUNT(DISTINCT COALESCE(viewer_id::text, ip_hash, session_id)) as unique_views_count
        FROM product_views
        WHERE viewed_at::date = p_date
        GROUP BY product_id
    ) v ON p.id = v.product_id
    LEFT JOIN (
        SELECT
            e.product_id,
            COUNT(*) as orders_count,
            SUM(COALESCE(ord.amount_cents, 0)) as revenue_cents
        FROM entitlements e
        LEFT JOIN orders ord ON e.order_id = ord.id
        WHERE e.created_at::date = p_date
        GROUP BY e.product_id
    ) o ON p.id = o.product_id
    LEFT JOIN (
        SELECT
            product_id,
            COUNT(*) as refunds_count,
            SUM(amount_cents) as refund_amount_cents
        FROM refunds
        WHERE created_at::date = p_date
        AND status = 'completed'
        GROUP BY product_id
    ) r ON p.id = r.product_id
    WHERE v.product_id IS NOT NULL
       OR o.product_id IS NOT NULL
       OR r.product_id IS NOT NULL
    ON CONFLICT (product_id, date)
    DO UPDATE SET
        views_count = EXCLUDED.views_count,
        unique_views_count = EXCLUDED.unique_views_count,
        orders_count = EXCLUDED.orders_count,
        revenue_cents = EXCLUDED.revenue_cents,
        refunds_count = EXCLUDED.refunds_count,
        refund_amount_cents = EXCLUDED.refund_amount_cents,
        updated_at = NOW();
END;
$$;

-- =====================================================
-- COMPLETE! Run this SQL in your Supabase SQL editor
-- =====================================================
