-- Add views columns to creators and products tables
-- These columns track total view count

ALTER TABLE creators ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_creators_views ON creators(views DESC);
CREATE INDEX IF NOT EXISTS idx_products_views ON products(views DESC);

-- Create RPC functions to increment views (bypasses RLS, runs as service role)
-- These functions handle deduplication logic server-side

CREATE OR REPLACE FUNCTION increment_creator_views(
  p_creator_id UUID,
  p_viewer_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner (service role) permissions
AS $$
DECLARE
  v_last_view_at TIMESTAMPTZ;
  v_dedupe_hours INTEGER := 6;
  v_new_views INTEGER;
  v_should_count BOOLEAN := FALSE;
BEGIN
  -- Check if this viewer has viewed this creator recently
  SELECT MAX(created_at) INTO v_last_view_at
  FROM analytics_events
  WHERE creator_id = p_creator_id
    AND visitor_id = p_viewer_id
    AND event_type = 'view'
    AND product_id IS NULL;

  -- Count if no recent view or outside dedupe window
  IF v_last_view_at IS NULL OR v_last_view_at < (NOW() - (v_dedupe_hours || ' hours')::INTERVAL) THEN
    v_should_count := TRUE;
    
    -- Increment views counter
    UPDATE creators
    SET views = views + 1
    WHERE id = p_creator_id
    RETURNING views INTO v_new_views;

    -- Log the view event
    INSERT INTO analytics_events (
      creator_id,
      visitor_id,
      event_type,
      session_id,
      created_at
    ) VALUES (
      p_creator_id,
      p_viewer_id,
      'view',
      p_viewer_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT,
      NOW()
    );
  ELSE
    -- Get current views without incrementing
    SELECT views INTO v_new_views
    FROM creators
    WHERE id = p_creator_id;
  END IF;

  RETURN jsonb_build_object(
    'counted', v_should_count,
    'newViews', COALESCE(v_new_views, 0),
    'lastViewAt', v_last_view_at,
    'dedupeHours', v_dedupe_hours
  );
END;
$$;

CREATE OR REPLACE FUNCTION increment_product_views(
  p_product_id UUID,
  p_creator_id UUID,
  p_viewer_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with owner (service role) permissions
AS $$
DECLARE
  v_last_view_at TIMESTAMPTZ;
  v_dedupe_hours INTEGER := 6;
  v_new_views INTEGER;
  v_should_count BOOLEAN := FALSE;
BEGIN
  -- Check if this viewer has viewed this product recently
  SELECT MAX(created_at) INTO v_last_view_at
  FROM analytics_events
  WHERE product_id = p_product_id
    AND visitor_id = p_viewer_id
    AND event_type = 'view';

  -- Count if no recent view or outside dedupe window
  IF v_last_view_at IS NULL OR v_last_view_at < (NOW() - (v_dedupe_hours || ' hours')::INTERVAL) THEN
    v_should_count := TRUE;
    
    -- Increment views counter
    UPDATE products
    SET views = views + 1
    WHERE id = p_product_id
    RETURNING views INTO v_new_views;

    -- Log the view event
    INSERT INTO analytics_events (
      creator_id,
      product_id,
      visitor_id,
      event_type,
      session_id,
      created_at
    ) VALUES (
      p_creator_id,
      p_product_id,
      p_viewer_id,
      'view',
      p_viewer_id || '_' || EXTRACT(EPOCH FROM NOW())::TEXT,
      NOW()
    );
  ELSE
    -- Get current views without incrementing
    SELECT views INTO v_new_views
    FROM products
    WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'counted', v_should_count,
    'newViews', COALESCE(v_new_views, 0),
    'lastViewAt', v_last_view_at,
    'dedupeHours', v_dedupe_hours
  );
END;
$$;

-- Grant execute permissions to anon and authenticated users
GRANT EXECUTE ON FUNCTION increment_creator_views TO anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_product_views TO anon, authenticated;
