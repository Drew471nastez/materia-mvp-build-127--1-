-- ===========================================================================
--  Storelib — a link that shows the unpublished version, to whoever has it
-- ===========================================================================
--  Run once in the Supabase SQL editor. Idempotent. Additive.
--
--  TWO THINGS, AND THE SECOND IS WHY THE FIRST IS SAFE.
--
--  A published site was serving DRAFTS wherever it had nothing published to
--  serve: a page added after the last publish had only `draft_sections`, and
--  the storefront fell back to it. So a page could be live before anybody
--  published it, which is the opposite of what Publish is for. The routes
--  read the published columns and only those now.
--
--  That closes the one way a creator could show somebody work in progress,
--  so this opens a deliberate one. A preview token is a long random string
--  on the install. With it, the storefront renders the drafts and tells
--  search engines not to index the page; without it, the published site, as
--  before. It can be rotated or removed at any time, which is what makes it
--  a link you can un-share.
--
--  Until this has run, the preview link is simply unavailable — the routes
--  fall back to serving the published site, which is the safe direction.
-- ===========================================================================

alter table public.store_theme_installs
  add column if not exists preview_token text;

comment on column public.store_theme_installs.preview_token is
  'A long random string. Anyone holding it can see this theme''s unpublished drafts at ?preview=<token>. Null means no preview link exists. Rotating it revokes every link already shared.';

-- Looked up by token on every preview request, and by nothing else.
create unique index if not exists idx_sti_preview_token
  on public.store_theme_installs(preview_token)
  where preview_token is not null;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'store_theme_installs'
       and column_name = 'preview_token') as column_present;
