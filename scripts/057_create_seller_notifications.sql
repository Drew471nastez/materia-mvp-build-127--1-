-- =============================================================================
-- Seller Notifications System
-- =============================================================================
-- Creates a notifications table for seller notifications (reviews, sales, etc.)
-- Includes in-app notifications and tracks email notification status

-- Create notifications table
CREATE TABLE IF NOT EXISTS seller_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who receives this notification
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification type and content
  type TEXT NOT NULL CHECK (type IN ('new_review', 'new_sale', 'new_subscriber', 'payout', 'announcement')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,

  -- Deep link for navigation (e.g., product page testimonials section)
  action_url TEXT,

  -- Related entities for context
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Notification metadata
  metadata JSONB DEFAULT '{}',

  -- Read/dismissed status
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,

  -- Email notification tracking
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_seller_notifications_creator_id ON seller_notifications(creator_id);
CREATE INDEX IF NOT EXISTS idx_seller_notifications_user_id ON seller_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_notifications_type ON seller_notifications(type);
CREATE INDEX IF NOT EXISTS idx_seller_notifications_created_at ON seller_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_notifications_read_at ON seller_notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_seller_notifications_product_id ON seller_notifications(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_seller_notifications_review_id ON seller_notifications(review_id) WHERE review_id IS NOT NULL;

-- Enable RLS
ALTER TABLE seller_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
  ON seller_notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read/dismissed)
CREATE POLICY "Users can update their own notifications"
  ON seller_notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
  ON seller_notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can insert notifications (via admin client)
-- Note: INSERT policy not needed for service role, but adding for completeness
CREATE POLICY "Service role can insert notifications"
  ON seller_notifications FOR INSERT
  WITH CHECK (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_seller_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_seller_notifications_updated_at ON seller_notifications;
CREATE TRIGGER trigger_seller_notifications_updated_at
  BEFORE UPDATE ON seller_notifications
  FOR EACH ROW
  EXECUTE FUNCTION update_seller_notifications_updated_at();

-- Grant permissions to authenticated users
GRANT SELECT, UPDATE, DELETE ON seller_notifications TO authenticated;
GRANT INSERT ON seller_notifications TO service_role;
