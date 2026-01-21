-- Store Builder configurations table
-- Stores both draft and published versions for shop and product pages per creator

CREATE TABLE IF NOT EXISTS store_builder_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  page_type TEXT NOT NULL CHECK (page_type IN ('shop', 'product')),
  
  -- Draft configuration (saved but not yet published)
  draft_config JSONB NOT NULL DEFAULT '{}',
  draft_updated_at TIMESTAMPTZ,
  
  -- Published configuration (live on public pages)
  published_config JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Each creator can only have one config per page type
  UNIQUE (creator_id, page_type)
);

-- Enable RLS
ALTER TABLE store_builder_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Creators can view their own store builder configs"
  ON store_builder_configs
  FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can insert their own store builder configs"
  ON store_builder_configs
  FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own store builder configs"
  ON store_builder_configs
  FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can delete their own store builder configs"
  ON store_builder_configs
  FOR DELETE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Allow public read of published configs for rendering public pages
CREATE POLICY "Anyone can view published configs"
  ON store_builder_configs
  FOR SELECT
  USING (published_config IS NOT NULL AND published_config != '{}'::jsonb);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_store_builder_configs_creator_page 
  ON store_builder_configs(creator_id, page_type);
