-- ============================================================
-- Storelib AI — the cover on a site card
-- ============================================================
--
-- A card showed the PUBLISHED site, so an unpublished one showed
-- "Not published yet" — a grey box where the thing you spent an
-- hour on should be. The cover should be the site as you last left
-- it, published or not.
--
-- BUILT ON READ, not on write. A site autosaves every 1.2 seconds
-- and a build takes a moment; rebuilding on every keystroke would
-- burn a compile per character for a picture nobody is looking at.
-- Instead the built cover records WHICH revision it was built from,
-- and the reader compares: equal means serve what is stored, behind
-- means build it now. The cost is paid once, by whoever looks first,
-- and only when something actually changed.
--
-- Null means never built, which is the same instruction as stale.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS preview_revision INTEGER;
