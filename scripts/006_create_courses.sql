-- Create courses table
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create course_modules table
CREATE TABLE IF NOT EXISTS public.course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create course_lessons table
CREATE TABLE IF NOT EXISTS public.course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  content_text TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create lesson_attachments table
CREATE TABLE IF NOT EXISTS public.lesson_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create course_progress table
CREATE TABLE IF NOT EXISTS public.course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.course_lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_buyer_lesson UNIQUE (buyer_id, lesson_id)
);

-- Enable RLS on all tables
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

-- Courses policies
CREATE POLICY "Courses viewable by creators and entitled buyers"
  ON public.courses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = courses.product_id AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.entitlements e WHERE e.product_id = p.id AND e.buyer_id = auth.uid()
    ))
  ) OR EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = courses.product_id AND p.status = 'published'
  ));

CREATE POLICY "Creators can manage their courses"
  ON public.courses FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE p.id = courses.product_id AND c.user_id = auth.uid()
  ));

-- Course modules policies
CREATE POLICY "Modules viewable by creators and entitled buyers"
  ON public.course_modules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.courses co
    JOIN public.products p ON co.product_id = p.id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE co.id = course_modules.course_id AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.entitlements e WHERE e.product_id = p.id AND e.buyer_id = auth.uid()
    ) OR p.status = 'published')
  ));

CREATE POLICY "Creators can manage their modules"
  ON public.course_modules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.courses co
    JOIN public.products p ON co.product_id = p.id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE co.id = course_modules.course_id AND c.user_id = auth.uid()
  ));

-- Course lessons policies
CREATE POLICY "Lessons viewable by creators and entitled buyers"
  ON public.course_lessons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses co ON m.course_id = co.id
    JOIN public.products p ON co.product_id = p.id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE m.id = course_lessons.module_id AND (c.user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.entitlements e WHERE e.product_id = p.id AND e.buyer_id = auth.uid()
    ))
  ));

CREATE POLICY "Creators can manage their lessons"
  ON public.course_lessons FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.course_modules m
    JOIN public.courses co ON m.course_id = co.id
    JOIN public.products p ON co.product_id = p.id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE m.id = course_lessons.module_id AND c.user_id = auth.uid()
  ));

-- Lesson attachments policies
CREATE POLICY "Attachments viewable by creators and entitled buyers"
  ON public.lesson_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON l.module_id = m.id
    JOIN public.courses co ON m.course_id = co.id
    JOIN public.products p ON co.product_id = p.id
    WHERE l.id = lesson_attachments.lesson_id AND (EXISTS (
      SELECT 1 FROM public.creators c WHERE c.id = p.creator_id AND c.user_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM public.entitlements e WHERE e.product_id = p.id AND e.buyer_id = auth.uid()
    ))
  ));

CREATE POLICY "Creators can manage their attachments"
  ON public.lesson_attachments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.course_lessons l
    JOIN public.course_modules m ON l.module_id = m.id
    JOIN public.courses co ON m.course_id = co.id
    JOIN public.products p ON co.product_id = p.id
    JOIN public.creators c ON p.creator_id = c.id
    WHERE l.id = lesson_attachments.lesson_id AND c.user_id = auth.uid()
  ));

-- Course progress policies
CREATE POLICY "Users can view their own progress"
  ON public.course_progress FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Users can update their own progress"
  ON public.course_progress FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Users can modify their own progress"
  ON public.course_progress FOR UPDATE
  USING (auth.uid() = buyer_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON public.course_modules(course_id);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON public.course_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attachments_lesson ON public.lesson_attachments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_buyer ON public.course_progress(buyer_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_lesson ON public.course_progress(lesson_id);
