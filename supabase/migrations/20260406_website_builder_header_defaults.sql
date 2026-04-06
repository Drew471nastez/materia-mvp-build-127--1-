-- ============================================================
-- Website Builder — header section defaults backfill
-- ------------------------------------------------------------
-- Adds the new header controls to every existing store_theme_pages
-- header section:
--   • default navigation blocks (Home / Shop / About / Contact)
--     when the header has no blocks yet
--   • new defaults: logo_height = 64, nav_link_color = #000000,
--     color_scheme = white, header_layout = logo_left_nav_right,
--     header_width = full, header_fixed = true, header_transparent
--     = false, vertical_padding_vw = 1.2, link_spacing_vw = 1.4,
--     show_search = true, show_cart = true
-- ============================================================

DO $$
DECLARE
  rec RECORD;
  new_sections JSONB;
  section JSONB;
  new_blocks JSONB;
  new_settings JSONB;
  default_blocks JSONB := '[
    {"id":"nav-home",    "type":"nav_link", "settings":{"label":"Home",    "url":"/",         "link_type":"custom"}},
    {"id":"nav-shop",    "type":"nav_link", "settings":{"label":"Shop",    "url":"/shop",     "link_type":"custom"}},
    {"id":"nav-about",   "type":"nav_link", "settings":{"label":"About",   "url":"/about",    "link_type":"custom"}},
    {"id":"nav-contact", "type":"nav_link", "settings":{"label":"Contact", "url":"/contact",  "link_type":"custom"}}
  ]'::jsonb;
  default_header_settings JSONB := '{
    "logo_height": 64,
    "nav_link_color": "#000000",
    "color_scheme": "white",
    "header_layout": "logo_left_nav_right",
    "header_width": "full",
    "header_fixed": true,
    "header_transparent": false,
    "vertical_padding_vw": 1.2,
    "link_spacing_vw": 1.4,
    "show_search": true,
    "show_cart": true
  }'::jsonb;
BEGIN
  FOR rec IN SELECT id, sections FROM store_theme_pages LOOP
    new_sections := '[]'::jsonb;
    FOR section IN SELECT * FROM jsonb_array_elements(rec.sections) LOOP
      IF section->>'type' = 'header' THEN
        -- Backfill empty blocks with defaults
        IF section->'blocks' IS NULL OR jsonb_array_length(section->'blocks') = 0 THEN
          new_blocks := default_blocks;
        ELSE
          new_blocks := section->'blocks';
        END IF;

        -- Merge new defaults into settings, preserving existing values
        new_settings := default_header_settings || COALESCE(section->'settings', '{}'::jsonb);

        section := jsonb_set(section, '{blocks}', new_blocks);
        section := jsonb_set(section, '{settings}', new_settings);
      END IF;
      new_sections := new_sections || section;
    END LOOP;
    UPDATE store_theme_pages SET sections = new_sections WHERE id = rec.id;
  END LOOP;
END $$;
