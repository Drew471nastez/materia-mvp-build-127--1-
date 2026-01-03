-- Create function to increment daily rollup counters
CREATE OR REPLACE FUNCTION increment_daily_rollup(
  p_creator_id UUID,
  p_product_id UUID,
  p_date DATE,
  p_field TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Insert or update the daily rollup
  INSERT INTO analytics_daily_rollups (
    id,
    creator_id,
    product_id,
    date,
    page_views,
    product_views,
    visitors,
    orders,
    revenue_cents,
    buy_clicks,
    checkouts_started,
    downloads,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_creator_id,
    p_product_id,
    p_date,
    CASE WHEN p_field = 'page_views' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'product_views' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'visitors' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'orders' THEN 1 ELSE 0 END,
    0,
    CASE WHEN p_field = 'buy_clicks' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'checkouts_started' THEN 1 ELSE 0 END,
    CASE WHEN p_field = 'downloads' THEN 1 ELSE 0 END,
    NOW(),
    NOW()
  )
  ON CONFLICT (creator_id, product_id, date) 
  DO UPDATE SET
    page_views = analytics_daily_rollups.page_views + CASE WHEN p_field = 'page_views' THEN 1 ELSE 0 END,
    product_views = analytics_daily_rollups.product_views + CASE WHEN p_field = 'product_views' THEN 1 ELSE 0 END,
    visitors = analytics_daily_rollups.visitors + CASE WHEN p_field = 'visitors' THEN 1 ELSE 0 END,
    orders = analytics_daily_rollups.orders + CASE WHEN p_field = 'orders' THEN 1 ELSE 0 END,
    buy_clicks = analytics_daily_rollups.buy_clicks + CASE WHEN p_field = 'buy_clicks' THEN 1 ELSE 0 END,
    checkouts_started = analytics_daily_rollups.checkouts_started + CASE WHEN p_field = 'checkouts_started' THEN 1 ELSE 0 END,
    downloads = analytics_daily_rollups.downloads + CASE WHEN p_field = 'downloads' THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to increment revenue in daily rollup
CREATE OR REPLACE FUNCTION increment_daily_revenue(
  p_creator_id UUID,
  p_product_id UUID,
  p_date DATE,
  p_amount_cents INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_daily_rollups (
    id,
    creator_id,
    product_id,
    date,
    orders,
    revenue_cents,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_creator_id,
    p_product_id,
    p_date,
    1,
    p_amount_cents,
    NOW(),
    NOW()
  )
  ON CONFLICT (creator_id, product_id, date) 
  DO UPDATE SET
    orders = analytics_daily_rollups.orders + 1,
    revenue_cents = analytics_daily_rollups.revenue_cents + p_amount_cents,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for rollups if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_daily_rollups_unique'
  ) THEN
    ALTER TABLE analytics_daily_rollups 
    ADD CONSTRAINT analytics_daily_rollups_unique 
    UNIQUE (creator_id, product_id, date);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Update geo analytics function
CREATE OR REPLACE FUNCTION update_analytics_geo(
  p_creator_id UUID,
  p_country_code TEXT,
  p_country_name TEXT,
  p_date DATE,
  p_views INTEGER DEFAULT 1,
  p_orders INTEGER DEFAULT 0,
  p_revenue INTEGER DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_geo (
    id,
    creator_id,
    country_code,
    country,
    date,
    page_views,
    visitors,
    orders,
    revenue_cents,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_creator_id,
    p_country_code,
    p_country_name,
    p_date,
    p_views,
    p_views,
    p_orders,
    p_revenue,
    NOW(),
    NOW()
  )
  ON CONFLICT (creator_id, country_code, date) 
  DO UPDATE SET
    page_views = analytics_geo.page_views + p_views,
    visitors = analytics_geo.visitors + p_views,
    orders = analytics_geo.orders + p_orders,
    revenue_cents = analytics_geo.revenue_cents + p_revenue,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for geo if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_geo_unique'
  ) THEN
    ALTER TABLE analytics_geo 
    ADD CONSTRAINT analytics_geo_unique 
    UNIQUE (creator_id, country_code, date);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Update referrer analytics function
CREATE OR REPLACE FUNCTION update_analytics_referrer(
  p_creator_id UUID,
  p_referrer_domain TEXT,
  p_referrer_url TEXT,
  p_date DATE,
  p_views INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_referrers (
    id,
    creator_id,
    referrer_domain,
    referrer_url,
    date,
    page_views,
    visitors,
    orders,
    revenue_cents,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_creator_id,
    p_referrer_domain,
    p_referrer_url,
    p_date,
    p_views,
    p_views,
    0,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (creator_id, referrer_domain, date) 
  DO UPDATE SET
    page_views = analytics_referrers.page_views + p_views,
    visitors = analytics_referrers.visitors + p_views,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add unique constraint for referrers if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_referrers_unique'
  ) THEN
    ALTER TABLE analytics_referrers 
    ADD CONSTRAINT analytics_referrers_unique 
    UNIQUE (creator_id, referrer_domain, date);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
