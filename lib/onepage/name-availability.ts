/**
 * ===========================================================================
 *  IS storelib.me/{name} FREE FOR THIS PERSON?
 * ===========================================================================
 * The one check for "taken", used by the editor's live check
 * (app/api/onepage/address) and by the save itself (PUT /api/onepage), so
 * the field never says "available" for a name the save then refuses.
 *
 * storelib.me/{name} looks the name up as a page address first and as a
 * username second (lib/onepage/published-page findPublishedOnePage), so a
 * name is taken when ANOTHER page has it as its address or ANOTHER person
 * has it as their username, in any case: `Mara` and `mara` are one address.
 * The person's own page and own username are never in the way. An address
 * another creator's page left in the last 30 days is taken too (it still
 * redirects to their page); one the person's own page left is free for them.
 *
 * Read with the service client: the owner's own client cannot see other
 * people's pages under RLS, which is why an older check never found a clash.
 * The database's own unique index on lower(slug) (supabase/sql/run-now/54)
 * is the last word when two saves race.
 */
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { exactIlike } from "@/lib/onepage/username"
import { oldAddressHeld } from "@/lib/onepage/old-addresses"

export type NameTaken = "free" | "taken" | "unknown"

export async function onePageNameTaken(name: string, own: { onepageId?: string | null; userId: string }): Promise<NameTaken> {
  try {
    const admin = createAdminClient()
    const pattern = exactIlike(name.toLowerCase())
    let pages = admin.from("onepages").select("id").ilike("slug", pattern).limit(1)
    if (own.onepageId) pages = pages.neq("id", own.onepageId)
    else pages = pages.neq("owner_id", own.userId)
    const [page, person] = await Promise.all([
      pages.maybeSingle(),
      admin.from("profiles").select("id").ilike("username", pattern).neq("id", own.userId).limit(1).maybeSingle(),
    ])
    if (page.error || person.error) return "unknown"
    if (page.data || person.data) return "taken"
    /*
      AN ADDRESS ANOTHER CREATOR JUST LEFT (lib/onepage/old-addresses, SQL
      part 472). It still sends their visitors on to their page, so it is
      taken for anybody else for 30 days; the creator who left it can take
      it back at once. Before the SQL runs there is no history and it is free.
    */
    const held = await oldAddressHeld(admin, name, own.userId)
    if (held === "unknown") return "unknown"
    return held === "held" ? "taken" : "free"
  } catch {
    return "unknown"
  }
}
