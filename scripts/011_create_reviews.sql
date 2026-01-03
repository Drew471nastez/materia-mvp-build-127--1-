-- Create reviews table for product reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_creator_id ON reviews(creator_id);
CREATE INDEX IF NOT EXISTS idx_reviews_buyer_id ON reviews(buyer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view reviews
CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT
  USING (true);

-- Buyers can insert reviews for products they've purchased
CREATE POLICY "Buyers can insert reviews for purchased products"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    AND EXISTS (
      SELECT 1 FROM entitlements e
      WHERE e.buyer_id = auth.uid()
      AND e.product_id = reviews.product_id
    )
  );

-- Buyers can update their own reviews
CREATE POLICY "Buyers can update their own reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = buyer_id)
  WITH CHECK (auth.uid() = buyer_id);

-- Buyers can delete their own reviews
CREATE POLICY "Buyers can delete their own reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = buyer_id);

-- Add reviews_count and reviews_average to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reviews_average NUMERIC(2,1) DEFAULT 0;

-- Add seller_reviews_count and seller_reviews_average to creators table
ALTER TABLE creators ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS reviews_average NUMERIC(2,1) DEFAULT 0;

-- Function to update product review stats
CREATE OR REPLACE FUNCTION update_product_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE products SET
      reviews_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id),
      reviews_average = (SELECT COALESCE(AVG(rating)::NUMERIC(2,1), 0) FROM reviews WHERE product_id = NEW.product_id)
    WHERE id = NEW.product_id;
    
    -- Update creator stats
    UPDATE creators SET
      reviews_count = (SELECT COUNT(*) FROM reviews WHERE creator_id = NEW.creator_id),
      reviews_average = (SELECT COALESCE(AVG(rating)::NUMERIC(2,1), 0) FROM reviews WHERE creator_id = NEW.creator_id)
    WHERE id = NEW.creator_id;
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET
      reviews_count = (SELECT COUNT(*) FROM reviews WHERE product_id = OLD.product_id),
      reviews_average = (SELECT COALESCE(AVG(rating)::NUMERIC(2,1), 0) FROM reviews WHERE product_id = OLD.product_id)
    WHERE id = OLD.product_id;
    
    -- Update creator stats
    UPDATE creators SET
      reviews_count = (SELECT COUNT(*) FROM reviews WHERE creator_id = OLD.creator_id),
      reviews_average = (SELECT COALESCE(AVG(rating)::NUMERIC(2,1), 0) FROM reviews WHERE creator_id = OLD.creator_id)
    WHERE id = OLD.creator_id;
    
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for review stats updates
DROP TRIGGER IF EXISTS trigger_update_product_review_stats ON reviews;
CREATE TRIGGER trigger_update_product_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_review_stats();
