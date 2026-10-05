/**
 * ===========================================================================
 *  THE NAVIGATOR'S PLACES: WHAT GET /api/me/places ANSWERS, AND IN WHAT ORDER
 * ===========================================================================
 * The hamburger beside the Storelib logo and the one right of a community's
 * name open the same panel (components/nav/place-navigator.tsx): one recent
 * list that mixes the courses and digital products this person used and the
 * communities they are in, the last one they touched first, then the ways
 * out to the rest of Storelib. This file is the part both the route and the
 * panel need, with nothing in it that touches a server or a browser, so the
 * rules are tested directly (tests/place-navigator.test.ts).
 */

export const PLACES_URL = "/api/me/places"

/** What a recent row is: a course (its player), a digital product (its library page) or a community. */
export type PlaceKind = "course" | "product" | "community"

/**
 * One row of the recent list: enough to draw it (a picture, a name, what
 * kind of thing it is) and to work out where it goes. The address is never
 * taken from the answer: it is made here from the kind and the id or slug.
 */
export interface PlaceRecent {
  kind: PlaceKind
  id: string
  title: string
  /** A product's cover or a community's logo. */
  imageUrl: string | null
  /** A community's slug, which its address is made from. Empty for a course or a product. */
  slug: string
}

/** GET /api/me/places. Signed out: an empty list and every flag false. */
export interface PlacesResponse {
  signedIn: boolean
  /** The communities switch (platform_flags). Off: no community rows and no Discover communities. */
  communitiesOn: boolean
  /** Began selling (a creators row or profiles.is_creator), finished or not. */
  isCreator: boolean
  /** Seller onboarding finished (lib/account/seller-access): Dashboard rather than Start creating. */
  hasSellerAccess: boolean
  /** Courses, digital products and communities, the last one touched first, at most RECENT_LIMIT. */
  recent: PlaceRecent[]
}

export const SIGNED_OUT_PLACES: PlacesResponse = {
  signedIn: false,
  communitiesOn: false,
  isCreator: false,
  hasSellerAccess: false,
  recent: [],
}

/** A time as milliseconds; a missing or unreadable one is the oldest there is. */
export const at = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0)

/** How many rows the recent list has at most: a glance, not the library. Past eight or so it scrolls inside the panel. */
export const RECENT_LIMIT = 12

/** How many things from the library are considered for it. */
export const PRODUCTS_LIMIT = 8

/** How many communities are considered for it. */
export const PLACES_LIMIT = 20

/** A purchase as the route reads it: an entitlement or a completed order. */
export interface PlaceOwnedRow {
  product_id: string | null
  created_at?: string | null
}

/** A moment the person used something they own: a course player opened (course_enrollments.last_opened_at) or a file downloaded (download_events). */
export interface PlaceOpenedRow {
  product_id: string | null
  last_opened_at?: string | null
}

/**
 * THE LAST TIME EACH THING OF THEIRS WAS USED, NEWEST FIRST. A course counts
 * from the last time its player was opened, a digital product from its last
 * download, and either from when it was bought when that is later (or when
 * it was never used). Only what they own is listed: a course opened without
 * being owned (a free preview, or the creator's own) is left out. Each
 * product once, at its latest moment; ties keep the order they came in.
 */
export function rankRecentProducts(owned: PlaceOwnedRow[], used: PlaceOpenedRow[]): { productId: string; at: number }[] {
  const latest = new Map<string, { at: number; i: number }>()
  const mine = new Set<string>()
  let i = 0
  const bump = (id: string, t: number) => {
    const was = latest.get(id)
    if (!was) latest.set(id, { at: t, i: i++ })
    else if (t > was.at) was.at = t
  }
  for (const r of owned) {
    if (!r.product_id) continue
    mine.add(r.product_id)
    bump(r.product_id, at(r.created_at))
  }
  for (const r of used) if (r.product_id && mine.has(r.product_id)) bump(r.product_id, at(r.last_opened_at))
  return [...latest.entries()]
    .sort((a, b) => b[1].at - a[1].at || a[1].i - b[1].i)
    .map(([productId, v]) => ({ productId, at: v.at }))
}

/** Where a library row goes: a course to its player, anything else to its page in the library. */
export function productHref(p: { kind: PlaceKind; id: string }): string {
  const id = encodeURIComponent(p.id)
  return p.kind === "course" ? `/account/library/courses/${id}` : `/account/library/products/${id}`
}

/** A membership row as the route reads it, with every way of telling when it was last used. */
export interface PlaceMemberRow {
  community_id: string
  last_seen_at?: string | null
  last_active_at?: string | null
  joined_at?: string | null
}

/**
 * WHEN A COMMUNITY WAS LAST TOUCHED. last_seen_at is the member pages'
 * heartbeat (part 85), the visit; last_active_at is the last thing they did
 * there. Whichever is later counts. A row with neither (never visited since
 * the heartbeat existed, or before part 85 has run) falls back to when they
 * joined.
 */
export function lastTouched(r: PlaceMemberRow): number {
  return Math.max(at(r.last_seen_at), at(r.last_active_at)) || at(r.joined_at)
}

/** The last touched first; a row with no time at all goes last, and ties keep the order they came in. */
export function orderByLastVisit<T extends PlaceMemberRow>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i, k: lastTouched(r) }))
    .sort((a, b) => b.k - a.k || a.i - b.i)
    .map((x) => x.r)
}

/**
 * ONE LIST, THE LAST TOUCHED FIRST. Each side arrives in its own order with
 * its own moment; merged by that moment, the newer first. On a tie a thing
 * from the library goes before a community (it came first), and within each
 * side the order it came in is kept.
 */
export function mergeRecent(things: { item: PlaceRecent; at: number }[], communities: { item: PlaceRecent; at: number }[], limit = RECENT_LIMIT): PlaceRecent[] {
  return [...things, ...communities]
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.at - a.at || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item)
}

/** Where the navigator was opened from. */
export type NavigatorCurrent = { kind: "community"; id: string } | { kind: "storelib" }

/** The small word under a recent row's name: what kind of thing it is. */
export const KIND_HINT: Record<PlaceKind, string> = { course: "Course", product: "Digital product", community: "Community" }

export type NavigatorRecentRow = { kind: "recent"; item: PlaceRecent; href: string; hint: string; current: boolean }
export type NavigatorLinkRow = { kind: "link"; key: "discover-communities" | "explore"; label: string; href: string }

/** One row of the panel, in order. `current` marks the community being looked at. */
export type NavigatorRow = NavigatorRecentRow | NavigatorLinkRow

export interface NavigatorModel {
  /** The recent list, shown first with no heading; empty means it is not drawn at all, nor the rule under it. */
  recent: NavigatorRecentRow[]
  links: NavigatorLinkRow[]
  /**
   * The action at the foot of the panel. Signed out there are two (Log in and
   * Start creating).
   *
   * `quiet`: drawn as a row rather than a button (components/nav/place-
   * navigator.tsx). "If the user is not a seller, add a button, very subtle,
   * Start creating or something like that, but it should not look very AI. If
   * the user is a creator and has joined, show Dashboard as it currently is."
   * A signed in person who does not sell had the same solid black button a
   * seller's Dashboard has, which is the panel shouting at somebody who came
   * to it to go somewhere they already know. So theirs is quiet: the row
   * shape the ways out already use, in grey, with a shop in the line family
   * the rest of the panel draws in. Dashboard is untouched.
   */
  actions: { key: "dashboard" | "start-creating" | "log-in"; label: string; href: string; primary: boolean; quiet?: boolean }[]
}

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const SAFE_ID = /^[0-9a-zA-Z-]{1,64}$/

/**
 * THE PANEL, AS DATA. Signed in: the recent list (courses, digital products
 * and communities, the last touched first, the community being looked at
 * marked), Discover communities, Explore, then Dashboard for a seller or
 * Start creating for everybody else. Signed out: Explore, Discover
 * communities, then Log in and Start creating. With communities switched
 * off there is no community anywhere in it. A slug or an id that would not
 * make a safe path is dropped rather than linked.
 */
export function navigatorModel(places: PlacesResponse, current?: NavigatorCurrent): NavigatorModel {
  const on = places.communitiesOn
  const recent: NavigatorRecentRow[] = []
  if (places.signedIn) {
    for (const item of places.recent) {
      if (item.kind === "community") {
        if (!on || !SAFE_SLUG.test(item.slug)) continue
        recent.push({ kind: "recent", item, href: `/community/${item.slug}`, hint: KIND_HINT.community, current: current?.kind === "community" && current.id === item.id })
      } else {
        if (!SAFE_ID.test(item.id)) continue
        recent.push({ kind: "recent", item, href: productHref(item), hint: KIND_HINT[item.kind], current: false })
      }
      if (recent.length >= RECENT_LIMIT) break
    }
  }
  const discover: NavigatorLinkRow = { kind: "link", key: "discover-communities", label: "Discover communities", href: "/explore?type=communities" }
  const explore: NavigatorLinkRow = { kind: "link", key: "explore", label: "Explore", href: "/explore" }
  const links = places.signedIn ? [...(on ? [discover] : []), explore] : [explore, ...(on ? [discover] : [])]
  /*
    WHO IS A SELLER IS THE ONE RULE THERE ALREADY IS: `hasSellerAccess`, which
    the route reads from lib/account/seller-access (readSellerAccess, state
    === "seller"), the same answer /app itself is gated on. A creator who
    began and has not finished is not one yet, and still gets Start creating.
  */
  const actions: NavigatorModel["actions"] = places.signedIn
    ? [places.hasSellerAccess
        ? { key: "dashboard", label: "Dashboard", href: "/app", primary: true }
        : { key: "start-creating", label: "Start creating", href: "/sell", primary: false, quiet: true }]
    : [
        { key: "log-in", label: "Log in", href: "/login", primary: false },
        { key: "start-creating", label: "Start creating", href: "/sell", primary: true },
      ]
  return { recent, links, actions }
}

const str = (v: unknown) => (typeof v === "string" ? v : null)

/** One recent row from an answer, or null when it is not a whole one. */
function recentRow(v: unknown): PlaceRecent | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  if (r.kind !== "course" && r.kind !== "product" && r.kind !== "community") return null
  const id = str(r.id)
  const title = str(r.title)
  if (!id || title === null) return null
  const slug = r.kind === "community" ? str(r.slug) : ""
  if (slug === null) return null
  return { kind: r.kind, id, title, imageUrl: str(r.imageUrl), slug }
}

/**
 * A body from the route, read defensively: anything unexpected is the
 * signed out answer. An answer from before the one list (separate
 * `products` and `communities`, still in a tab's sessionStorage the first
 * time a new deploy loads) is read too, things first, so nobody opens an
 * empty panel.
 */
export function parsePlaces(body: unknown): PlacesResponse {
  if (!body || typeof body !== "object") return SIGNED_OUT_PLACES
  const b = body as Record<string, unknown>
  let rows: unknown[] = Array.isArray(b.recent) ? b.recent : []
  if (!Array.isArray(b.recent)) {
    const things = (Array.isArray(b.products) ? b.products : []).map((p) => (p && typeof p === "object" ? { ...(p as object), imageUrl: (p as Record<string, unknown>).coverUrl } : p))
    const clubs = (Array.isArray(b.communities) ? b.communities : []).map((c) => (c && typeof c === "object" ? { kind: "community", ...(c as object), title: (c as Record<string, unknown>).name, imageUrl: (c as Record<string, unknown>).logoUrl } : c))
    rows = [...things, ...clubs]
  }
  return {
    signedIn: b.signedIn === true,
    communitiesOn: b.communitiesOn === true,
    isCreator: b.isCreator === true,
    hasSellerAccess: b.hasSellerAccess === true,
    recent: rows
      .map(recentRow)
      .filter((r): r is PlaceRecent => r !== null)
      .slice(0, RECENT_LIMIT),
  }
}
