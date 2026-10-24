import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * THE CREATOR LOOKING AT THEIR OWN PAGE IS NOT A VISITOR.
 *
 * Every time a creator checked their store after an edit it was counted as a
 * visit, and on a new store that is most of the traffic. Shopify leaves the
 * owner's own visits out, and so does app/api/track-view, by asking this.
 *
 * NOR IS THE STORE'S TEAM (round AD1). A manager or staff member working on
 * the store (lib/team, store_team_members) checks its pages as often as the
 * owner does, signed in with their own account, and every look was a
 * visitor: a store with a small team saw its own people in Visitors, in
 * conversion's denominator and in the funnel.
 *
 * It only answers the question; it never refuses anybody, which is why the
 * tracker stays a public route. The session is read only when the request
 * carries a sign-in, so a visitor who never signed in costs nothing extra.
 */
export async function isOwnVisit(cookieNames: string[], ownerUserId: string | null | undefined, creatorId?: string | null): Promise<boolean> {
  if (!ownerUserId && !creatorId) return false
  const signedIn = cookieNames.some((name) => name.startsWith("sb-") && name.includes("auth-token"))
  if (!signedIn) return false
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const userId = data.user?.id
    if (!userId) return false
    if (ownerUserId && userId === ownerUserId) return true
    return creatorId ? await isTeamMember(createAdminClient(), userId, creatorId) : false
  } catch {
    return false
  }
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Whether this account is an active member of this store's team. A table not there yet (part 135) is no. */
export async function isTeamMember(db: Db, userId: string, creatorId: string): Promise<boolean> {
  try {
    const { data, error } = await db.from("store_team_members").select("id").eq("creator_id", creatorId).eq("user_id", userId).eq("status", "active").limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
