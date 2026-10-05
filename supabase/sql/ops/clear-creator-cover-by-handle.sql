-- ===========================================================================
--  Remove the cover / banner from a creator page (storelib.com/<handle>)
-- ===========================================================================
--  Supabase SQL editor. Change handle in params (default anisia-ghita).
-- ===========================================================================

WITH params AS (SELECT 'anisia-ghita'::text AS handle),
target AS (
  SELECT DISTINCT p.id AS user_id, c.id AS creator_id
  FROM params x
  JOIN public.profiles p
    ON lower(coalesce(p.username, '')) = lower(x.handle)
  JOIN public.creators c ON c.user_id = p.id
  UNION
  SELECT DISTINCT p.id, c.id
  FROM params x
  JOIN public.creators c
    ON lower(coalesce(c.slug, '')) = lower(x.handle)
  JOIN public.profiles p ON p.id = c.user_id
)
SELECT
  p.username,
  c.slug,
  c.cover_url AS creators_cover,
  p.cover_url AS profiles_cover,
  s.published_config #>> '{headerSettings,coverImageUrl}' AS shop_header_cover
FROM target t
JOIN public.profiles p ON p.id = t.user_id
JOIN public.creators c ON c.id = t.creator_id
LEFT JOIN public.store_builder_configs s
  ON s.creator_id = c.id AND s.page_type = 'shop';

BEGIN;

WITH params AS (SELECT 'anisia-ghita'::text AS handle),
target AS (
  SELECT DISTINCT p.id AS user_id, c.id AS creator_id
  FROM params x
  JOIN public.profiles p
    ON lower(coalesce(p.username, '')) = lower(x.handle)
  JOIN public.creators c ON c.user_id = p.id
  UNION
  SELECT DISTINCT p.id, c.id
  FROM params x
  JOIN public.creators c
    ON lower(coalesce(c.slug, '')) = lower(x.handle)
  JOIN public.profiles p ON p.id = c.user_id
)
UPDATE public.profiles p
SET cover_url = NULL
FROM target t
WHERE p.id = t.user_id;

WITH params AS (SELECT 'anisia-ghita'::text AS handle),
target AS (
  SELECT DISTINCT c.id AS creator_id
  FROM params x
  JOIN public.profiles p
    ON lower(coalesce(p.username, '')) = lower(x.handle)
  JOIN public.creators c ON c.user_id = p.id
  UNION
  SELECT DISTINCT c.id
  FROM params x
  JOIN public.creators c
    ON lower(coalesce(c.slug, '')) = lower(x.handle)
)
UPDATE public.creators c
SET cover_url = NULL
FROM target t
WHERE c.id = t.creator_id;

WITH params AS (SELECT 'anisia-ghita'::text AS handle),
target AS (
  SELECT DISTINCT c.id AS creator_id
  FROM params x
  JOIN public.profiles p
    ON lower(coalesce(p.username, '')) = lower(x.handle)
  JOIN public.creators c ON c.user_id = p.id
  UNION
  SELECT DISTINCT c.id
  FROM params x
  JOIN public.creators c
    ON lower(coalesce(c.slug, '')) = lower(x.handle)
)
UPDATE public.store_builder_configs s
SET
  draft_config = CASE
    WHEN jsonb_typeof(s.draft_config) = 'object' THEN
      jsonb_set(
        s.draft_config,
        '{headerSettings}',
        coalesce(s.draft_config -> 'headerSettings', '{}'::jsonb)
          - 'coverImageUrl'
          - 'coverFocalPoint'
          - 'coverZoom'
      )
    ELSE s.draft_config
  END,
  published_config = CASE
    WHEN jsonb_typeof(s.published_config) = 'object' THEN
      jsonb_set(
        s.published_config,
        '{headerSettings}',
        coalesce(s.published_config -> 'headerSettings', '{}'::jsonb)
          - 'coverImageUrl'
          - 'coverFocalPoint'
          - 'coverZoom'
      )
    ELSE s.published_config
  END,
  updated_at = now()
FROM target t
WHERE s.creator_id = t.creator_id
  AND s.page_type = 'shop';

COMMIT;
