/* ===========================================================================
   FEATURED MEMBERS (round 34)
   ===========================================================================
   The owner: "let community creators/admins feature selected members. Keep
   this optional and visually subtle. The feature should recognize
   contributors without turning the community into an unnecessarily
   competitive environment."

   So it is two columns on the member's own row rather than a table: when
   they were featured, and who featured them. Nothing is ranked and nothing
   is counted; the member directory and their profile say the word and that
   is all.

   The partial index is what the short list is read by: at most
   FEATURED_MAX rows per community (lib/communities/featured-members.ts), so
   the read is bounded whatever the community's size.

   Before this runs, Feature answers 503 needs_update and says so, the
   directory and the profiles show no mark, and nothing else changes
   (lib/communities/server/featured-members.ts).
   =========================================================================== */
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS featured_at timestamptz;
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS featured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_members_featured_idx ON public.community_members (community_id, featured_at DESC) WHERE featured_at IS NOT NULL;

/* ---------------------------------------------------------------------------
   WHO MAY MESSAGE A MEMBER (round 34)
   ---------------------------------------------------------------------------
   The owner, on a member's profile: "restrict incoming messages". The
   member's own choice, per community: everyone here, or only the people who
   run it. Nothing stored means everyone, which is what every row means
   today. There is no "nobody": a community has to be able to reach its own
   members, so the narrow choice keeps the owner, the admins and the
   moderators (lib/communities/message-privacy.ts).

   The server applies it when a conversation is opened and again on every
   message (lib/communities/server/direct.ts), so narrowing it closes the
   conversations already open.
   --------------------------------------------------------------------------- */
ALTER TABLE public.community_members ADD COLUMN IF NOT EXISTS dm_from text;
DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_members_dm_from_check' AND conrelid = 'public.community_members'::regclass) THEN ALTER TABLE public.community_members ADD CONSTRAINT community_members_dm_from_check CHECK (dm_from IS NULL OR dm_from IN ('everyone', 'staff')) NOT VALID; END IF; END $do$;
