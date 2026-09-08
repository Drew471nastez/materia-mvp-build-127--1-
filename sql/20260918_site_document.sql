-- The canonical website state: pages, sections, props and theme.
--
-- Nullable, and null is a real answer. Every site that exists today is a code
-- project with no document, and it goes on being edited as files — this is
-- additive, not a migration of anything.
--
-- JSONB rather than tables because the whole document is read and written as
-- one unit by both editors, and a relational split would buy joins nobody
-- performs while making the compare-and-swap below span several rows.
alter table public.sites
  add column if not exists document jsonb;

-- The compare-and-swap key. Every operation bumps document->>'revision', and a
-- write only matches while the stored revision is still the one the writer
-- saw — which is what stops a creator's drag and an agent run silently
-- overwriting each other.
--
-- Indexed because that expression is in the WHERE clause of every write.
create index if not exists sites_document_revision_idx
  on public.sites (((document ->> 'revision')::int))
  where document is not null;

comment on column public.sites.document is
  'Canonical page/section/theme state. The source; site_files rows are rendered from it.';
