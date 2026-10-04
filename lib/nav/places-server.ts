import "server-only"

/**
 * WHAT THE NAVIGATOR LISTS FOR ONE SIGNED IN PERSON (GET /api/me/places).
 *
 * Recently opened: the digital products and courses they own, newest first
 * (rankRecentProducts in lib/nav/places-shared.ts), at most five, each with
 * its cover and title. Read from their own rows only (entitlements,
 * completed orders, course_enrollments.last_opened_at), all by the session's
 * user id; a table that is not there yet is an empty list, never an error.
 *
 * Their active memberships, most recently visited first (orderByLastVisit in
 * lib/nav/places-shared.ts), each a community somewhere a row can take them:
 * not deleted, not suspended, and a draft only for its own staff. Plus the
 * two answers the panel's last row needs: whether they began selling and
 * whether their seller onboarding is finished (lib/account/seller-access).
 *
 * A handful of small reads, in two waves, none of them over more than a few
 * dozen rows. Before part 85 there is no last_seen_at column
 * and the order falls back to last_active_at; before part 81 there are no
 * community tables and the list is empty. Neither is an error.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { meetsRole } from "@/lib/communities/permissions"
import type { Role } from "@/lib/communities/types"
import { missing, reasonOf, type Db } from "@/lib/communities/server/db"
import { readSellerAccess } from "@/lib/account/seller-access"
import {
  orderByLastVisit,
  PLACES_LIMIT,
  PRODUCTS_LIMIT,
  rankRecentProducts,
  type PlaceCommunity,
  type PlaceMemberRow,
  type PlaceOpenedRow,
  type PlaceOwnedRow,
  type PlaceProduct,
  type PlacesResponse,
} from "./places-shared"

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

/** How far back each list of purchases is read: enough for five that are digital products or courses. */
const RECENT_SCAN = 40

/** A read that may meet a table not created yet: its rows, or none. Never throws. */
async function rowsOf<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await q
    if (error) {
      if (!missing(error)) console.error(`[places] ${label}: ${reasonOf(error)}`)
      return []
    }
    return Array.isArray(data) ? (data as T[]) : []
  } catch (e) {
    console.error(`[places] ${label}: ${reasonOf(e)}`)
    return []
  }
}

/**
 * RECENTLY OPENED. What they bought (entitlements and completed orders, as
 * the library reads them) and the courses whose player they opened, at once;
 * then the products themselves, only digital products and courses (a
 * membership or a community lives elsewhere in the panel). A course opened
 * but not among the purchases read is checked against their purchases by id
 * before it may count, so a free preview or a creator's own course never
 * shows up as theirs.
 */
export async function readRecentProducts(db: Db, userId: string): Promise<PlaceProduct[]> {
  const [ents, orders, opened] = await Promise.all([
    rowsOf<PlaceOwnedRow>("entitlements", db.from("entitlements").select("product_id, created_at").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(RECENT_SCAN)),
    rowsOf<PlaceOwnedRow>("orders", db.from("orders").select("product_id, created_at").eq("buyer_id", userId).eq("status", "completed").order("created_at", { ascending: false }).limit(RECENT_SCAN)),
    rowsOf<PlaceOpenedRow>("course_enrollments", db.from("course_enrollments").select("product_id, last_opened_at").eq("buyer_id", userId).order("last_opened_at", { ascending: false }).limit(PRODUCTS_LIMIT * 2)),
  ])
  const owned = [...ents, ...orders]
  const known = new Set(owned.map((r) => r.product_id).filter(Boolean))
  const unknown = [...new Set(opened.map((r) => r.product_id).filter((id): id is string => !!id && !known.has(id)))]
  /* Every product that could make the five, ranked as if the unknown ones were theirs; the check below decides. */
  const candidates = rankRecentProducts([...owned, ...unknown.map((product_id) => ({ product_id, created_at: null }))], opened)
    .slice(0, RECENT_SCAN)
    .map((r) => r.productId)
  if (!candidates.length) return []

  const [products, entAgain, orderAgain] = await Promise.all([
    rowsOf<{ id: string; title: string | null; thumbnail_url: string | null; type: string | null }>(
      "products",
      db.from("products").select("id, title, thumbnail_url, type").in("id", candidates).in("type", ["digital", "course"]),
    ),
    unknown.length ? rowsOf<PlaceOwnedRow>("entitlements", db.from("entitlements").select("product_id, created_at").eq("buyer_id", userId).in("product_id", unknown)) : Promise.resolve([]),
    unknown.length ? rowsOf<PlaceOwnedRow>("orders", db.from("orders").select("product_id, created_at").eq("buyer_id", userId).eq("status", "completed").in("product_id", unknown)) : Promise.resolve([]),
  ])
  const byId = new Map(products.map((p) => [p.id, p]))
  const out: PlaceProduct[] = []
  for (const { productId } of rankRecentProducts([...owned, ...entAgain, ...orderAgain], opened)) {
    const p = byId.get(productId)
    if (!p) continue
    out.push({ id: p.id, kind: p.type === "course" ? "course" : "product", title: p.title?.trim() || (p.type === "course" ? "Course" : "Untitled product"), coverUrl: p.thumbnail_url || null })
    if (out.length >= PRODUCTS_LIMIT) break
  }
  return out
}

export async function readPlaces(db: Db, userId: string): Promise<PlacesResponse> {
  const [on, access, products] = await Promise.all([communitiesEnabled(), readSellerAccess(db, userId), readRecentProducts(db, userId)])
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
    products,
  }
}
