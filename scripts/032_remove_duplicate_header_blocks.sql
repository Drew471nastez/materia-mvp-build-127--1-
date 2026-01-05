-- Remove duplicate header blocks from OnePage users
-- Keep only the first header block (lowest sort_order) for each user
-- This script is idempotent - safe to run multiple times

-- Function to remove duplicate header blocks from draft_blocks JSONB array
CREATE OR REPLACE FUNCTION remove_duplicate_header_blocks()
RETURNS void AS $$
DECLARE
  r RECORD;
  updated_blocks JSONB;
  first_header_found BOOLEAN;
  block JSONB;
  new_blocks JSONB;
BEGIN
  -- Loop through all onepages
  FOR r IN SELECT id, draft_blocks FROM onepages WHERE draft_blocks IS NOT NULL
  LOOP
    first_header_found := FALSE;
    new_blocks := '[]'::JSONB;

    -- Sort blocks by sort_order and iterate
    FOR block IN SELECT jsonb_array_elements(r.draft_blocks) AS block ORDER BY (jsonb_array_elements(r.draft_blocks)->>'sort_order')::int
    LOOP
      -- Check if this is a header block
      IF block->>'type' = 'header' THEN
        -- Only keep the first header block
        IF NOT first_header_found THEN
          new_blocks := new_blocks || jsonb_build_array(block);
          first_header_found := TRUE;
        END IF;
        -- Skip subsequent header blocks (don't add them)
      ELSE
        -- Keep all non-header blocks
        new_blocks := new_blocks || jsonb_build_array(block);
      END IF;
    END LOOP;

    -- Update the onepage if blocks changed
    IF r.draft_blocks <> new_blocks AND new_blocks <> '[]'::JSONB THEN
      UPDATE onepages SET draft_blocks = new_blocks WHERE id = r.id;
      RAISE NOTICE 'Updated onepage %: removed duplicate headers', r.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT remove_duplicate_header_blocks();

-- Also update published_blocks if they exist
CREATE OR REPLACE FUNCTION remove_duplicate_header_blocks_published()
RETURNS void AS $$
DECLARE
  r RECORD;
  updated_blocks JSONB;
  first_header_found BOOLEAN;
  block JSONB;
  new_blocks JSONB;
BEGIN
  -- Loop through all onepages with published_blocks
  FOR r IN SELECT id, published_blocks FROM onepages WHERE published_blocks IS NOT NULL AND jsonb_array_length(published_blocks) > 0
  LOOP
    first_header_found := FALSE;
    new_blocks := '[]'::JSONB;

    -- Sort blocks by sort_order and iterate
    FOR block IN SELECT jsonb_array_elements(r.published_blocks) AS block ORDER BY (jsonb_array_elements(r.published_blocks)->>'sort_order')::int
    LOOP
      -- Check if this is a header block
      IF block->>'type' = 'header' THEN
        -- Only keep the first header block
        IF NOT first_header_found THEN
          new_blocks := new_blocks || jsonb_build_array(block);
          first_header_found := TRUE;
        END IF;
        -- Skip subsequent header blocks
      ELSE
        -- Keep all non-header blocks
        new_blocks := new_blocks || jsonb_build_array(block);
      END IF;
    END LOOP;

    -- Update if blocks changed
    IF r.published_blocks <> new_blocks AND new_blocks <> '[]'::JSONB THEN
      UPDATE onepages SET published_blocks = new_blocks WHERE id = r.id;
      RAISE NOTICE 'Updated published blocks for onepage %', r.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute for published blocks
SELECT remove_duplicate_header_blocks_published();

-- Clean up the functions (optional - keep them for future use)
-- DROP FUNCTION IF EXISTS remove_duplicate_header_blocks();
-- DROP FUNCTION IF EXISTS remove_duplicate_header_blocks_published();
