-- Create creators table for creator storefronts
CREATE TABLE IF NOT EXISTS public.creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  bio TEXT,
  headline TEXT,
  niche_tags TEXT[] DEFAULT '{}',
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_creator UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

-- Policies for creators
CREATE POLICY "Public creators are viewable by everyone"
  ON public.creators FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own creator profile"
  ON public.creators FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator profile"
  ON public.creators FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own creator profile"
  ON public.creators FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_creators_slug ON public.creators(slug);
CREATE INDEX IF NOT EXISTS idx_creators_featured ON public.creators(featured);
