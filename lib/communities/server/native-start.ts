import "server-only"

/**
 * WHERE THE PHONE APP OPENS FOR SOMEBODY WHO LIVES IN A COMMUNITY.
 *
 * A signed in person without seller access who is an active member of a
 * community opens the app on the community they used last: the latest
 * community_members.last_seen_at (the member pages' heartbeat, part 85), or,
 * where no heartbeat was ever recorded, the latest joined_at. Only a
 * community that is published and neither deleted nor suspended counts; with
 * communities switched off nobody is sent to one. A seller keeps the start
 * they have (/app), and anybody else the library, which app/native-start
 * decides; this only answers the path or null.
 *
 * Before part 85 there is no last_seen_at column: joined_at alone decides.
 * Before part 81 there is nothing to open: null.
 */
import { hasSellerAccess, readSellerAccess } from "@/lib/account/seller-access"
import { communitiesEnabled } from "../flag"
import { missing, reasonOf, type Db } from "./db"

const LOOK_AT = 20

interface MemberLite {
  community_id: string
  last_seen_at?: string | null
  joined_at: string | null
}

/** The order the candidates are tried in: last seen first (never seen last), then the newest join. */
export function lastUsedOrder(rows: MemberLite[]): MemberLite[] {
  const t = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0)
  return [...rows].sort((a, b) => t(b.last_seen_at) - t(a.last_seen_at) || t(b.joined_at) - t(a.joined_at))
}

export async function lastCommunityPath(db: Db, userId: string): Promise<string | null> {
  try {
    if (!(await communitiesEnabled())) return null
    if (hasSellerAccess(await readSellerAccess(db, userId))) return null
    const read = (withSeen: boolean) => {
      const q = db
        .from("community_members")
        .select(withSeen ? "community_id, last_seen_at, joined_at" : "community_id, joined_at")
        .eq("user_id", userId)
        .eq("status", "active")
      return (withSeen ? q.order("last_seen_at", { ascending: false, nullsFirst: false }) : q).order("joined_at", { ascending: false, nullsFirst: false }).limit(LOOK_AT)
    }
    let res = await read(true)
    if (res.error && missing(res.error)) res = await read(false)
    if (res.error) {
      if (!missing(res.error)) console.error(`[native-start] memberships: ${reasonOf(res.error)}`)
      return null
    }
    const members = lastUsedOrder((res.data as MemberLite[] | null) ?? [])
    if (!members.length) return null
    const { data, error } = await db.from("communities").select("id, slug, status, deleted_at, suspended_at").in("id", members.map((m) => m.community_id))
    if (error) return null
    const open = new Map(
      ((data as { id: string; slug: string; status: string; deleted_at: string | null; suspended_at: string | null }[] | null) ?? [])
        .filter((c) => c.status === "published" && !c.deleted_at && !c.suspended_at && /^[a-z0-9-]{1,64}$/.test(c.slug))
        .map((c) => [c.id, c.slug]),
    )
    for (const m of members) {
      const slug = open.get(m.community_id)
      if (slug) return `/community/${slug}`
    }
    return null
  } catch (e) {
    console.error(`[native-start] ${reasonOf(e)}`)
    return null
  }
}
