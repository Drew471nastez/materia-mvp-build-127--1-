-- Create community_posts table
CREATE TABLE IF NOT EXISTS public.community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create community_comments table
CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Community posts policies - only entitled users can view/post
CREATE POLICY "Entitled users can view community posts"
  ON public.community_posts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.creator_id = community_posts.creator_id 
    AND e.buyer_id = auth.uid()
    AND e.community_access = true
  ) OR EXISTS (
    SELECT 1 FROM public.creators c
    WHERE c.id = community_posts.creator_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "Entitled users can create community posts"
  ON public.community_posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND (
      EXISTS (
        SELECT 1 FROM public.entitlements e
        WHERE e.creator_id = community_posts.creator_id 
        AND e.buyer_id = auth.uid()
        AND e.community_access = true
      ) OR EXISTS (
        SELECT 1 FROM public.creators c
        WHERE c.id = community_posts.creator_id AND c.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Authors and creators can update posts"
  ON public.community_posts FOR UPDATE
  USING (
    auth.uid() = author_id OR EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = community_posts.creator_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Authors and creators can delete posts"
  ON public.community_posts FOR DELETE
  USING (
    auth.uid() = author_id OR EXISTS (
      SELECT 1 FROM public.creators c
      WHERE c.id = community_posts.creator_id AND c.user_id = auth.uid()
    )
  );

-- Community comments policies
CREATE POLICY "Entitled users can view community comments"
  ON public.community_comments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.community_posts p
    WHERE p.id = community_comments.post_id AND (
      EXISTS (
        SELECT 1 FROM public.entitlements e
        WHERE e.creator_id = p.creator_id 
        AND e.buyer_id = auth.uid()
        AND e.community_access = true
      ) OR EXISTS (
        SELECT 1 FROM public.creators c
        WHERE c.id = p.creator_id AND c.user_id = auth.uid()
      )
    )
  ));

CREATE POLICY "Entitled users can create comments"
  ON public.community_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_comments.post_id AND (
        EXISTS (
          SELECT 1 FROM public.entitlements e
          WHERE e.creator_id = p.creator_id 
          AND e.buyer_id = auth.uid()
          AND e.community_access = true
        ) OR EXISTS (
          SELECT 1 FROM public.creators c
          WHERE c.id = p.creator_id AND c.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Authors can update their comments"
  ON public.community_comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors and creators can delete comments"
  ON public.community_comments FOR DELETE
  USING (
    auth.uid() = author_id OR EXISTS (
      SELECT 1 FROM public.community_posts p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE p.id = community_comments.post_id AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_creator ON public.community_posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_author ON public.community_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_post ON public.community_comments(post_id);
