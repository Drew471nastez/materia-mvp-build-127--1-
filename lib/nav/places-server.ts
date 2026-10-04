import "server-only"

/**
 * WHAT THE NAVIGATOR LISTS FOR ONE SIGNED IN PERSON (GET /api/me/places).
 *
 * One recent list, the last thing touched first (mergeRecent in
 * lib/nav/places-shared.ts): the courses and digital products they own,
 * each at the last time it was used (a course's player opened, a file
 * downloaded) or bought, and the communities they are active in, each at
 * the later of its last visit and their last activity there. Read from
 * their own rows only (entitlements, completed orders,
 * course_enrollments.last_opened_at, the download_events of their own
 * entitlements and orders, community_members), all by the session's user
 * id; a table that is not there yet is an empty list, never an error.
 *
 * A community is listed only where a row can take them: not deleted, not
 * suspended, and a draft only for its own staff. Plus the two answers the
 * panel's last row needs: whether they began selling and whether their
 * seller onboarding is finished (lib/account/seller-access).
 *
 * A handful of small reads, in a few waves, none of them over more than a
 * few dozen rows. Before part 85 there is no last_seen_at column and the
 * last activity alone counts; before part 81 there are no community tables
 * and only the library is listed. Neither is an error.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { meetsRole } from "@/lib/communities/permissions"
import type { Role } from "@/lib/communities/types"
import { missing, reasonOf, type Db } from "@/lib/communities/server/db"
import { readSellerAccess } from "@/lib/account/seller-access"
import {
  lastTouched,
  mergeRecent,
  orderByLastVisit,
  PLACES_LIMIT,
  PRODUCTS_LIMIT,
  rankRecentProducts,
  type PlaceMemberRow,
  type PlaceOpenedRow,
  type PlaceOwnedRow,
  type PlaceRecent,
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

/** An id that may be spelled into a filter: the database's own uuids, nothing else. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Recent = { item: PlaceRecent; at: number }

/**
 * THE LIBRARY SIDE OF THE RECENT LIST. What they bought (entitlements and
 * completed orders, as the library reads them), the courses whose player
 * they opened, and the files they downloaded from their own purchases (the
 * download_events of those entitlements and orders, newest first); then the
 * products themselves, only digital products and courses (a membership
 * lives elsewhere). A course opened but not among the purchases read is
 * checked against their purchases by id before it may count, so a free
 * preview or a creator's own course never shows up as theirs.
 */
export async function readRecentProducts(db: Db, userId: string): Promise<Recent[]> {
  const [ents, orders, opened] = await Promise.all([
    rowsOf<PlaceOwnedRow & { id: string }>("entitlements", db.from("entitlements").select("id, product_id, created_at").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(RECENT_SCAN)),
    rowsOf<PlaceOwnedRow & { id: string }>("orders", db.from("orders").select("id, product_id, created_at").eq("buyer_id", userId).eq("status", "completed").order("created_at", { ascending: false }).limit(RECENT_SCAN)),
    rowsOf<PlaceOpenedRow>("course_enrollments", db.from("course_enrollments").select("product_id, last_opened_at").eq("buyer_id", userId).order("last_opened_at", { ascending: false }).limit(PRODUCTS_LIMIT * 2)),
  ])
  const owned: PlaceOwnedRow[] = [...ents, ...orders]
  const downloads = await readDownloads(db, ents, orders)
  const known = new Set(owned.map((r) => r.product_id).filter(Boolean))
  const unknown = [...new Set(opened.map((r) => r.product_id).filter((id): id is string => !!id && !known.has(id)))]
  const used = [...opened, ...downloads]
  /* Every product that could make the list, ranked as if the unknown ones were theirs; the check below decides. */
  const candidates = rankRecentProducts([...owned, ...unknown.map((product_id) => ({ product_id, created_at: null }))], used)
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
  const out: Recent[] = []
  for (const { productId, at } of rankRecentProducts([...owned, ...entAgain, ...orderAgain], used)) {
    const p = byId.get(productId)
    if (!p) continue
    const kind = p.type === "course" ? "course" : "product"
    out.push({ item: { kind, id: p.id, title: p.title?.trim() || (kind === "course" ? "Course" : "Untitled product"), imageUrl: p.thumbnail_url || null, slug: "" }, at })
    if (out.length >= PRODUCTS_LIMIT) break
  }
  return out
}

/**
 * THE LAST DOWNLOADS OF THEIR OWN PURCHASES, as moments a product was used.
 * Only by the ids of the entitlements and orders just read for this person,
 * so another buyer's download of the same file never counts; at most a few
 * dozen rows, newest first.
 */
async function readDownloads(db: Db, ents: { id: string; product_id: string | null }[], orders: { id: string; product_id: string | null }[]): Promise<PlaceOpenedRow[]> {
  const byEnt = new Map(ents.filter((e) => UUID.test(e.id) && e.product_id).map((e) => [e.id, e.product_id]))
  const byOrder = new Map(orders.filter((o) => UUID.test(o.id) && o.product_id).map((o) => [o.id, o.product_id]))
  const or = [byEnt.size ? `entitlement_id.in.(${[...byEnt.keys()].join(",")})` : "", byOrder.size ? `order_id.in.(${[...byOrder.keys()].join(",")})` : ""].filter(Boolean).join(",")
  if (!or) return []
  const rows = await rowsOf<{ entitlement_id: string | null; order_id: string | null; created_at: string | null }>(
    "download_events",
    db.from("download_events").select("entitlement_id, order_id, created_at").or(or).order("created_at", { ascending: false }).limit(RECENT_SCAN),
  )
  return rows
    .map((r) => ({ product_id: (r.entitlement_id && byEnt.get(r.entitlement_id)) || (r.order_id && byOrder.get(r.order_id)) || null, last_opened_at: r.created_at }))
    .filter((r) => r.product_id)
}

/** THE COMMUNITY SIDE OF THE RECENT LIST: active memberships, each at the later of its last visit and its last activity. */
async function readRecentCommunities(db: Db, userId: string): Promise<Recent[]> {
  const out: Recent[] = []
  try {
    const mine = orderByLastVisit(await memberships(db, userId))
    const ids = [...new Set(mine.map((m) => m.community_id))]
    if (!ids.length) return out
    const { data, error } = await db
      .from("communities")
      .select("id, slug, name, logo_url, status, suspended_at, deleted_at")
      .in("id", ids)
      .is("deleted_at", null)
    if (error) {
      if (!missing(error)) console.error(`[places] communities: ${reasonOf(error)}`)
      return out
    }
    const byId = new Map(
      ((data as { id: string; slug: string; name: string; logo_url: string | null; status: string; suspended_at: string | null }[] | null) ?? []).map((c) => [c.id, c]),
    )
    for (const m of mine) {
      const c = byId.get(m.community_id)
      if (!c || c.suspended_at || c.status === "suspended") continue
      if (c.status === "draft" && !meetsRole(m.role, "moderator")) continue
      if (out.some((x) => x.item.id === c.id)) continue
      out.push({ item: { kind: "community", id: c.id, title: c.name, imageUrl: c.logo_url, slug: c.slug }, at: lastTouched(m) })
      if (out.length >= PLACES_LIMIT) break
    }
  } catch (e) {
    console.error(`[places] ${reasonOf(e)}`)
    return []
  }
  return out
}

export async function readPlaces(db: Db, userId: string): Promise<PlacesResponse> {
  /* All four at once: the communities are read as soon as the switch says they may be, beside the library. */
  const switchOn = communitiesEnabled()
  const [on, access, products, communities] = await Promise.all([
    switchOn,
    readSellerAccess(db, userId),
    readRecentProducts(db, userId),
    switchOn.then((yes) => (yes ? readRecentCommunities(db, userId) : [])),
  ])
  return {
    signedIn: true,
    communitiesOn: on,
    isCreator: access.state !== "none",
    hasSellerAccess: access.state === "seller",
    recent: mergeRecent(products, communities),
  }
}
