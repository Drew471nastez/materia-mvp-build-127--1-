import "server-only"

/**
 * WHAT THE NAVIGATOR LISTS FOR ONE SIGNED IN PERSON (GET /api/me/places).
 *
 * Their active memberships, most recently visited first (orderByLastVisit in
 * lib/nav/places-shared.ts), each a community somewhere a row can take them:
 * not deleted, not suspended, and a draft only for its own staff. Plus the
 * two answers the panel's last row needs: whether they began selling and
 * whether their seller onboarding is finished (lib/account/seller-access).
 *
 * Three small reads at most. Before part 85 there is no last_seen_at column
 * and the order falls back to last_active_at; before part 81 there are no
 * community tables and the list is empty. Neither is an error.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { meetsRole } from "@/lib/communities/permissions"
import type { Role } from "@/lib/communities/types"
import { missing, reasonOf, type Db } from "@/lib/communities/server/db"
import { readSellerAccess } from "@/lib/account/seller-access"
import { orderByLastVisit, PLACES_LIMIT, type PlaceCommunity, type PlaceMemberRow, type PlacesResponse } from "./places-shared"

type MemberRow = PlaceMemberRow & { role: Role | null }

async function memberships(db: Db, userId: string): Promise<MemberRow[]> {
  const read = (withSeen: boolean) => {
    const cols = withSeen ? "community_id, role, last_seen_at, last_active_at, joined_at" : "community_id, role, last_active_at, joined_at"
    const q = db.from("community_members").select(cols).eq("user_id", userId).eq("status", "active")
    return (withSeen ? q.order("last_seen_at", { ascending: false, nullsFirst: false }) : q)
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(PLACES_LIMIT * 2)
  }
  let res = await read(true)
  if (res.error && missing(res.error)) res = await read(false)
  if (res.error) {
    if (!missing(res.error)) console.error(`[places] memberships: ${reasonOf(res.error)}`)
    return []
  }
  return (res.data as MemberRow[] | null) ?? []
}

export async function readPlaces(db: Db, userId: string): Promise<PlacesResponse> {
  const [on, access] = await Promise.all([communitiesEnabled(), readSellerAccess(db, userId)])
  let communities: PlaceCommunity[] = []
  if (on) {
    try {
      const mine = orderByLastVisit(await memberships(db, userId))
      const ids = [...new Set(mine.map((m) => m.community_id))]
      if (ids.length) {
        const { data, error } = await db
          .from("communities")
          .select("id, slug, name, logo_url, status, suspended_at, deleted_at")
          .in("id", ids)
          .is("deleted_at", null)
        if (error) {
          if (!missing(error)) console.error(`[places] communities: ${reasonOf(error)}`)
        } else {
          const byId = new Map(
            ((data as { id: string; slug: string; name: string; logo_url: string | null; status: string; suspended_at: string | null }[] | null) ?? []).map((c) => [c.id, c]),
          )
          for (const m of mine) {
            const c = byId.get(m.community_id)
            if (!c || c.suspended_at || c.status === "suspended") continue
            if (c.status === "draft" && !meetsRole(m.role, "moderator")) continue
            if (communities.some((x) => x.id === c.id)) continue
            communities.push({ id: c.id, slug: c.slug, name: c.name, logoUrl: c.logo_url })
            if (communities.length >= PLACES_LIMIT) break
          }
        }
      }
    } catch (e) {
      console.error(`[places] ${reasonOf(e)}`)
      communities = []
    }
  }
  return {
    signedIn: true,
    communitiesOn: on,
    isCreator: access.state !== "none",
    hasSellerAccess: access.state === "seller",
    communities,
  }
}
