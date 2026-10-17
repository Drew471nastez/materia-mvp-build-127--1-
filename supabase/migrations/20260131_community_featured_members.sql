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
