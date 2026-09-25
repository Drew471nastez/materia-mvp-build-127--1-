/* Product variants read policies split so a visitor skips the creator check. Same access, faster product page. */
DROP POLICY IF EXISTS "Anyone can view variants for published products" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can view their own variants" ON public.product_variants;
DROP POLICY IF EXISTS "Creators can manage their own variants" ON public.product_variants;
CREATE POLICY "Anyone can view variants for published products" ON public.product_variants FOR SELECT USING ( EXISTS ( SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.status = 'published' ) );
CREATE POLICY "Creators can view their own variants" ON public.product_variants FOR SELECT TO authenticated USING ( EXISTS ( SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = (SELECT auth.uid()) ) );
CREATE POLICY "Creators can manage their own variants" ON public.product_variants FOR ALL TO authenticated USING ( EXISTS ( SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = (SELECT auth.uid()) ) ) WITH CHECK ( EXISTS ( SELECT 1 FROM public.products p JOIN public.creators c ON p.creator_id = c.id WHERE p.id = product_variants.product_id AND c.user_id = (SELECT auth.uid()) ) );
DROP POLICY IF EXISTS "Public can view variant files for published products" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can view their own variant files" ON public.product_variant_files;
DROP POLICY IF EXISTS "Creators can manage their own variant files" ON public.product_variant_files;
CREATE POLICY "Public can view variant files for published products" ON public.product_variant_files FOR SELECT USING ( EXISTS ( SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id WHERE pv.id = product_variant_files.variant_id AND p.status = 'published' ) );
CREATE POLICY "Creators can view their own variant files" ON public.product_variant_files FOR SELECT TO authenticated USING ( EXISTS ( SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = (SELECT auth.uid()) ) );
CREATE POLICY "Creators can manage their own variant files" ON public.product_variant_files FOR ALL TO authenticated USING ( EXISTS ( SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = (SELECT auth.uid()) ) ) WITH CHECK ( EXISTS ( SELECT 1 FROM public.product_variants pv JOIN public.products p ON p.id = pv.product_id JOIN public.creators c ON p.creator_id = c.id WHERE pv.id = product_variant_files.variant_id AND c.user_id = (SELECT auth.uid()) ) );
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_files_variant ON public.product_variant_files (variant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courses_product ON public.courses (product_id);
notify pgrst, 'reload schema';
