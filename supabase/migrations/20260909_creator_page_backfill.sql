-- ============================================================
-- Creator pages made before the recent changes
-- ============================================================
--
-- Most of what changed on the creator page this week was rendering,
-- and rendering needs no migration: the shared catalog header, the
-- tab strip, the optimized cover and avatar, the Simple Icons marks,
-- the "Featured" headline and the rail's horizontal padding are all
-- decided at render time from settings that already exist.
--
-- THREE THINGS ARE NOT. Each is a stored value that predates a
-- feature, so the page has no way to infer what the creator wanted.
--
-- Written to be safe to run twice, and to touch only what is
-- genuinely stale — a creator who has already made a choice keeps it.
-- ============================================================

-- ── 1. The About section, for configs that have none ─────────
--
-- The About block renders at the foot of every tab. A config saved
-- before that section existed simply has no `about` entry in its
-- sections array, so those pages end at the product grid — no story,
-- no joined date, no payment methods, and no way to add one from the
-- page because the editor attaches to a section that isn't there.
--
-- Appended rather than inserted at an index: About is rendered last
-- regardless of its `order`, and rewriting other sections' order is
-- how a creator's arrangement gets quietly changed.
DO $$
DECLARE
  r RECORD;
  about_default JSONB := jsonb_build_object(
    'id', 'about-backfill',
    'type', 'about',
    'order', 999,
    'settings', jsonb_build_object(
      'visible', true,
      'sellerName', '',
      'headline', '',
      'aboutContent', '',
      'mediaItems', '[]'::jsonb,
      'showSalesStats', true,
      'showProductsStats', true,
      'showPaymentMethods', true,
      'paymentMethods', '["paypal","visa","mastercard","amex","applepay","googlepay"]'::jsonb,
      'maxContentHeight', 150,
      'spacing', jsonb_build_object('paddingTop', 48, 'paddingBottom', 48, 'paddingLeft', 0, 'paddingRight', 0),
      'mobileSpacing', jsonb_build_object('paddingTop', 24, 'paddingBottom', 24, 'paddingLeft', 0, 'paddingRight', 0),
      'colors', jsonb_build_object('backgroundColor', 'transparent', 'textColor', '', 'accentColor', '')
    )
  );
BEGIN
  FOR r IN
    SELECT id, draft_config, published_config
    FROM store_builder_configs
    WHERE page_type = 'shop'
  LOOP
    -- draft
    IF r.draft_config ? 'sections'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(r.draft_config->'sections') s
         WHERE s->>'type' = 'about'
       )
    THEN
      UPDATE store_builder_configs
      SET draft_config = jsonb_set(
            r.draft_config, '{sections}',
            (r.draft_config->'sections') || jsonb_build_array(about_default))
      WHERE id = r.id;
    END IF;

    -- published
    IF r.published_config ? 'sections'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(r.published_config->'sections') s
         WHERE s->>'type' = 'about'
       )
    THEN
      UPDATE store_builder_configs
      SET published_config = jsonb_set(
            r.published_config, '{sections}',
            (r.published_config->'sections') || jsonb_build_array(about_default))
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Video media items get their real label ────────────────
--
-- COALESCE around the outer jsonb_agg is not decoration. `jsonb_agg` over an
-- empty set returns NULL, and `jsonb_set(config, '{sections}', NULL)` returns
-- NULL for the WHOLE COLUMN — a config wiped rather than updated. The WHERE
-- clause makes that unreachable today, since a config containing
-- "type":"youtube" necessarily has a section; but the guard costs nothing and
-- the failure it prevents is a creator's page disappearing.
--
-- `type: "youtube"` used to mean "a video", and now that Vimeo works
-- the honest label is "video". The renderer reads both — nothing
-- branches on which — so this is cosmetic, and it is here so the two
-- stop accumulating side by side forever.
--
-- The URL is untouched. Normalising a stored link is a separate
-- decision and this migration is not the place to guess at one.
UPDATE store_builder_configs
SET draft_config = jsonb_set(
      draft_config, '{sections}',
      (SELECT COALESCE(jsonb_agg(
         CASE WHEN s->>'type' = 'about'
           THEN jsonb_set(s, '{settings,mediaItems}', (
             SELECT COALESCE(jsonb_agg(
               CASE WHEN m->>'type' = 'youtube' THEN jsonb_set(m, '{type}', '"video"') ELSE m END
             ), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(s->'settings'->'mediaItems', '[]'::jsonb)) m
           ))
           ELSE s END), '[]'::jsonb)
       FROM jsonb_array_elements(draft_config->'sections') s))
WHERE page_type = 'shop'
  AND draft_config ? 'sections'
  AND draft_config::text LIKE '%"type":"youtube"%';

UPDATE store_builder_configs
SET published_config = jsonb_set(
      published_config, '{sections}',
      (SELECT COALESCE(jsonb_agg(
         CASE WHEN s->>'type' = 'about'
           THEN jsonb_set(s, '{settings,mediaItems}', (
             SELECT COALESCE(jsonb_agg(
               CASE WHEN m->>'type' = 'youtube' THEN jsonb_set(m, '{type}', '"video"') ELSE m END
             ), '[]'::jsonb)
             FROM jsonb_array_elements(COALESCE(s->'settings'->'mediaItems', '[]'::jsonb)) m
           ))
           ELSE s END), '[]'::jsonb)
       FROM jsonb_array_elements(published_config->'sections') s))
WHERE page_type = 'shop'
  AND published_config ? 'sections'
  AND published_config::text LIKE '%"type":"youtube"%';

-- ── 3. The social platforms added later ──────────────────────
--
-- Facebook, LinkedIn and Twitch are offered in the editor now. A
-- config saved before them has no key for them at all, and the
-- editor reads `socialLinks[key]?.url` — which is fine, but the
-- store builder's own panel writes the whole object back on save, so
-- the first save from an old config would drop them again.
--
-- Empty entries, so nothing appears on any page: an empty url is
-- what hides a social icon, and that rule is unchanged.
UPDATE store_builder_configs
SET draft_config = jsonb_set(
      draft_config, '{headerSettings,socialLinks}',
      COALESCE(draft_config->'headerSettings'->'socialLinks', '{}'::jsonb)
      || jsonb_build_object(
           'facebook', COALESCE(draft_config->'headerSettings'->'socialLinks'->'facebook', jsonb_build_object('enabled', false, 'url', '')),
           'linkedin', COALESCE(draft_config->'headerSettings'->'socialLinks'->'linkedin', jsonb_build_object('enabled', false, 'url', '')),
           'twitch',   COALESCE(draft_config->'headerSettings'->'socialLinks'->'twitch',   jsonb_build_object('enabled', false, 'url', ''))
         ))
WHERE page_type = 'shop' AND draft_config ? 'headerSettings';

UPDATE store_builder_configs
SET published_config = jsonb_set(
      published_config, '{headerSettings,socialLinks}',
      COALESCE(published_config->'headerSettings'->'socialLinks', '{}'::jsonb)
      || jsonb_build_object(
           'facebook', COALESCE(published_config->'headerSettings'->'socialLinks'->'facebook', jsonb_build_object('enabled', false, 'url', '')),
           'linkedin', COALESCE(published_config->'headerSettings'->'socialLinks'->'linkedin', jsonb_build_object('enabled', false, 'url', '')),
           'twitch',   COALESCE(published_config->'headerSettings'->'socialLinks'->'twitch',   jsonb_build_object('enabled', false, 'url', ''))
         ))
WHERE page_type = 'shop' AND published_config ? 'headerSettings';

-- ── Not done on purpose ──────────────────────────────────────
--
-- `headline: "Featured Products"` is NOT rewritten to "Featured".
-- The rail already prefers the creator's own headline and treats
-- only the old shipped default as unchosen, at render time — which
-- means a creator who deliberately typed "Featured Products" keeps
-- it. Rewriting the column would take that choice away from them
-- permanently, and there is no way to tell the two apart afterwards.
--
-- The featured section's `paddingLeft: 16` is NOT zeroed either. The
-- renderer ignores horizontal padding on that section now, so the
-- stored value is inert — and if a future layout wants it back, the
-- creator's number is still there.
