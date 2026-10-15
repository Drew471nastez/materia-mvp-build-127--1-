/* A connected domain can serve one community (round 31), run after part 22. Two new nullable columns on `custom_domains`, `target_type` ('community') and `target_id` (the community's id, so a renamed community keeps its domain), empty for every other domain; 'community' joins the allowed purposes; a check that a community domain names its community and is never primary, and that no other domain names anything; and one domain per community, held by a unique index. No existing row changes: all of them have empty targets and a purpose that was already allowed. Until it runs, Settings › Domains does not offer Community and the routes refuse it. Safe to run again. */
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE public.custom_domains ADD COLUMN IF NOT EXISTS target_id UUID;
ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_purpose_check;
ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_purpose_check CHECK (purpose IN ('website', 'creator_page', 'community')) NOT VALID;
ALTER TABLE public.custom_domains DROP CONSTRAINT IF EXISTS custom_domains_target_check;
ALTER TABLE public.custom_domains ADD CONSTRAINT custom_domains_target_check CHECK ((purpose = 'community' AND target_type = 'community' AND target_id IS NOT NULL AND is_primary = false) OR (purpose <> 'community' AND target_type IS NULL AND target_id IS NULL)) NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS custom_domains_one_per_target ON public.custom_domains (target_type, target_id) WHERE target_id IS NOT NULL;
notify pgrst, 'reload schema';
