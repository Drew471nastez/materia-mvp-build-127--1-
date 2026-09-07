-- ============================================================
-- Storelib AI — the media a creator uploads
-- ============================================================
--
-- `site_assets` has existed since the projects migration and no
-- code has ever written to it. So there was no way to put a
-- picture on a site, and a model asked for one did the only thing
-- available to it: inlined the image as a base64 data URI, which
-- blew the per-file size limit and made the ENTIRE edit fail at
-- the last step. The creator asked for an image and lost the work.
--
-- This is the missing half: somewhere for the bytes to live.
--
-- A SEPARATE BUCKET FROM site-deployments, and not for tidiness.
-- A deployment is per-publish and disposable — old ones are
-- replaced and will eventually be pruned. An upload is the
-- creator's own photograph and must outlive every deployment that
-- happens to reference it. Sharing one bucket means the day
-- somebody writes the cleanup job, a creator's images go with it.
--
-- 25MB, which covers a hero image, a logo set, or a short looping
-- background video. Above that belongs on a video host.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('site-assets', 'site-assets', true, 26214400)
ON CONFLICT (id) DO NOTHING;

-- PUBLIC READ, because these are the images on a public website —
-- the whole point is that a visitor can see them. There is nothing
-- private here that is not already on the page.
--
-- WRITES ARE SERVER-SIDE ONLY. The upload route uses the service
-- role after proving the caller owns the site. A creator who could
-- write to this bucket directly could put anything under another
-- creator's prefix, and the file would be served from a Storelib
-- address with a Storelib reputation behind it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'site_assets_public_read'
  ) THEN
    CREATE POLICY site_assets_public_read ON storage.objects
      FOR SELECT USING (bucket_id = 'site-assets');
  END IF;
END;
$$;

-- The public URL, so the row can answer "where is it" without the
-- caller having to know how storage paths are built.
ALTER TABLE site_assets
  ADD COLUMN IF NOT EXISTS url TEXT;

-- "What has this site got?" is asked every time the editor opens
-- the media list and every time an agent run builds its context.
CREATE INDEX IF NOT EXISTS idx_site_assets_site
  ON site_assets (site_id, created_at DESC);
