-- ===========================================================================
--  Storelib — theme marketplace + website snapshots
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive.
--
--  1. Seeds the themes table from the registry so the marketplace themes
--     have a catalogue row to install against.
--  2. Adds the two snapshot columns the website-builder page reads for its
--     covers. Code is defensive about both: the add route inserts a missing
--     catalogue row itself, and the snapshot route reports stored:false
--     until the columns exist.
-- ===========================================================================

-- Catalogue rows for every theme in lib/website-builder/theme-registry.ts.
-- Existing rows are left alone (the three original themes keep their text);
-- new themes are inserted. The add route also inserts a missing row on demand,
-- so this is belt and braces, not a prerequisite.
insert into public.themes
  (id, name, slug, description, author, version, is_built_in, is_free, price_cents, tags, category)
values
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Storelib Default', 'storelib-default', 'The theme every Storelib store starts on. Balanced spacing, a confident hero, a product grid that stays readable at any count, and colours that get out of the way of your own brand.', 'Storelib', '1.1.0', true, true, 0, ARRAY['minimal', 'clean', 'modern', 'versatile']::text[], 'general'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Creator Minimal', 'creator-minimal', 'Near-monochrome with sharp corners and generous whitespace. Built for creators whose products speak for themselves: a plain hero, an honest product grid, and nothing that competes with your covers.', 'Storelib', '1.1.0', true, true, 0, ARRAY['minimal', 'editorial', 'monochrome']::text[], 'creators'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'Digital Wave', 'digital-wave', 'A dark storefront with saturated gradients and pill-shaped calls to action. For creators who want their store to feel like a launch, not a catalogue.', 'Storelib', '1.1.0', true, true, 0, ARRAY['dark', 'gradient', 'bold', 'launch']::text[], 'digital'),
  ('d8febbc1-fb76-422e-b56b-dd9152475dab', 'Ebook Author', 'ebook-author', 'A bookshop feel: warm paper tones, a serif headline, a book showcase with mockup and table of contents, an author bio, and reader reviews. Made for selling one book well — and a shelf of them just as well.', 'Storelib', '1.0.0', true, true, 0, ARRAY['serif', 'warm', 'author', 'books']::text[], 'ebooks'),
  ('7178fefc-9142-49a1-aa9f-b6002192461b', 'Course Creator', 'course-creator', 'Teal and clear. A hero that states the outcome, a three-step ''how it works'', numbers that build trust, the course catalogue, and student stories. Everything a course landing page needs, already in order.', 'Storelib', '1.0.0', true, true, 0, ARRAY['education', 'clean', 'trust', 'cohort']::text[], 'courses'),
  ('dacc698c-228f-4225-821a-06c0c923fdef', 'Designer Portfolio', 'designer-portfolio', 'Charcoal and rose on a near-white page, with pill buttons and a wide product grid. A short manifesto, a features row, and a closing call to action. For UI kits, icon sets, fonts and Figma files.', 'Storelib', '1.0.0', true, true, 0, ARRAY['portfolio', 'templates', 'modern', 'grid']::text[], 'design'),
  ('25d46628-1a94-4b07-843f-b5ebae16fe2a', 'Studio Noir', 'studio-noir', 'A gallery-dark theme for photographers selling presets, prints and workshops. Full-bleed hero, a wide portrait-card product grid, a proof bar with your numbers, and a newsletter for the next drop.', 'Storelib', '1.0.0', true, true, 0, ARRAY['dark', 'gallery', 'presets', 'prints']::text[], 'photography'),
  ('ae2bb49a-b6de-4847-b8f5-97b0a7e44f72', 'Bright Coach', 'bright-coach', 'Soft green on cream with a split hero and rounded corners. Programs as products, a how-it-works, client results, and an FAQ that answers the objections before the call. For coaches, consultants and communities.', 'Storelib', '1.0.0', true, true, 0, ARRAY['friendly', 'conversion', 'programs', 'community']::text[], 'coaching'),
  ('b615c493-5e0f-4898-a928-649f1692c0ff', 'Beat Drop', 'beat-drop', 'Electric violet on deep navy with a bold display font. A hero built for a release, a product grid for packs and beats, a numbers row, and a newsletter so nobody misses the next drop.', 'Storelib', '1.0.0', true, true, 0, ARRAY['dark', 'bold', 'music', 'release']::text[], 'music'),
  ('8af18c61-122c-433f-ab00-0fb97b8f3173', 'Soft Launch', 'soft-launch', 'Blue on white with a clear split hero: what it does, one button. Features as a grid, a pricing-ready product list, trust badges, and an FAQ. Built for software people who would rather ship than design.', 'Storelib', '1.0.0', true, true, 0, ARRAY['saas', 'clean', 'blue', 'product']::text[], 'software')
on conflict (id) do nothing;

-- The cover picture the editor takes after each save. Null until the editor
-- has saved once since this shipped; the page draws the cover from the
-- theme colours until then. The snapshot route tolerates the columns being
-- absent, so nothing breaks if this runs late.
alter table public.store_theme_installs
  add column if not exists snapshot_url text,
  add column if not exists snapshot_updated_at timestamptz;

comment on column public.store_theme_installs.snapshot_url is
  'Public URL of the last home-page snapshot the editor took after a save. Cover on the website-builder page.';
comment on column public.store_theme_installs.snapshot_updated_at is
  'When snapshot_url was last written.';

notify pgrst, 'reload schema';

select
  (select count(*) from public.themes where is_built_in) as built_in_themes,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'store_theme_installs'
       and column_name in ('snapshot_url', 'snapshot_updated_at')) as snapshot_columns_present;
