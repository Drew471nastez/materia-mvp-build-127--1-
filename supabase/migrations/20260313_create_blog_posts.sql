-- Blog posts table for the Storelib blog admin system
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT DEFAULT '',
  content JSONB DEFAULT '[]'::jsonb,
  cover_image_url TEXT,
  category TEXT DEFAULT 'General',
  read_time TEXT DEFAULT '5 min read',
  author TEXT DEFAULT 'Storelib Team',
  seo_title TEXT,
  seo_description TEXT,
  seo_keywords TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  views BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public can read published posts only
CREATE POLICY "blog_posts_public_read" ON blog_posts
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_blog_post_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_blog_post_updated_at();

-- Blog view tracking table
CREATE TABLE IF NOT EXISTS blog_post_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  country TEXT,
  city TEXT,
  device TEXT,
  browser TEXT,
  referrer TEXT,
  ip_hash TEXT
);

ALTER TABLE blog_post_views ENABLE ROW LEVEL SECURITY;

-- Public can insert view events (for tracking)
CREATE POLICY "blog_views_public_insert" ON blog_post_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_post_views_post_id ON blog_post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_post_views_country ON blog_post_views(country);
CREATE INDEX IF NOT EXISTS idx_blog_post_views_viewed_at ON blog_post_views(viewed_at DESC);
