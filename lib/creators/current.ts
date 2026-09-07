import "server-only"

/**
 * The signed-in user's OWN creator id — nothing else.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS IS ITS OWN FILE, NOT PART OF lib/sites/projects.ts
 * ---------------------------------------------------------------------------
 * lib/sites/projects.ts carries a deliberate rule (checked by a test): it
 * never imports the admin client, because RLS is the only thing standing
 * between one creator's site files and another's, and a module that touches
 * actual project content should not be able to route around that even by
 * accident.
 *
 * Resolving "what is my own creator id" is a different kind of question. It
 * is scoped to the caller's own verified auth id — `user.id` comes from
 * `supabase.auth.getUser()` on the SESSION client, so it cannot be spoofed —
 * and the lookup can only ever return the row matching that id. There is no
 * "another creator's rows" for it to leak. Isolating it here means the admin
 * client never has to appear in the file that actually reads and writes site
 * content, which is the property the test is protecting.
 *
 * ---------------------------------------------------------------------------
 *  WHY THE ADMIN CLIENT, THEN
 * ---------------------------------------------------------------------------
 * Every OTHER working read of `creators` in this codebase — app/app/page.tsx,
 * app/api/onboarding/finalize/route.ts, the settings form's server actions —
 * goes through the admin client. A previous version of this lookup went
 * through the session-scoped client instead, found nothing for a creator who
 * demonstrably already had a site, and then tried to paper over that by
 * INSERTING a second creator row through that same under-privileged client —
 * with a naive email-derived slug that had no collision handling against the
 * table's unique constraint, and missing the onboarding/publish flags other
 * parts of the app depend on. That fabricated a second, empty account instead
 * of finding the real one, and made the bug worse.
 *
 * Provisioning a missing creator is legitimately onboarding's job, with its
 * own collision handling and its own required columns. This function only
 * reads; a user who genuinely has no creator record gets null, same as
 * before, and the "sign up first" paths are correct for them.
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function currentCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
