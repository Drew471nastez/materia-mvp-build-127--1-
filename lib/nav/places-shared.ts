/**
 * ===========================================================================
 *  THE NAVIGATOR'S PLACES: WHAT GET /api/me/places ANSWERS, AND IN WHAT ORDER
 * ===========================================================================
 * The hamburger left of the Storelib logo and the one beside a community's
 * name open the same panel (components/nav/place-navigator.tsx): the
 * communities this person is in, most recently visited first, then the ways
 * out to the rest of Storelib. This file is the part both the route and the
 * panel need, with nothing in it that touches a server or a browser, so the
 * rules are tested directly (tests/place-navigator.test.ts).
 */

export const PLACES_URL = "/api/me/places"

/** One community in the list: enough to draw a row and link to it. */
export interface PlaceCommunity {
  id: string
  slug: string
  name: string
  logoUrl: string | null
}

/** GET /api/me/places. Signed out: every list empty and every flag false. */
export interface PlacesResponse {
  signedIn: boolean
  /** The communities switch (platform_flags). Off: no communities and no Discover communities. */
  communitiesOn: boolean
  /** Began selling (a creators row or profiles.is_creator), finished or not. */
  isCreator: boolean
  /** Seller onboarding finished (lib/account/seller-access): Dashboard rather than Start creating. */
  hasSellerAccess: boolean
  communities: PlaceCommunity[]
}

export const SIGNED_OUT_PLACES: PlacesResponse = {
  signedIn: false,
  communitiesOn: false,
  isCreator: false,
  hasSellerAccess: false,
  communities: [],
}

/** How many communities the panel lists at most; the list scrolls inside the panel past six. */
export const PLACES_LIMIT = 20

/** A membership row as the route reads it, with every way of telling when it was last used. */
export interface PlaceMemberRow {
  community_id: string
  last_seen_at?: string | null
  last_active_at?: string | null
  joined_at?: string | null
}

const at = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0)

/**
 * MOST RECENTLY VISITED FIRST. last_seen_at is the member pages' heartbeat
 * (part 85), so it is the visit; a row with none (never visited since the
 * heartbeat existed, or before part 85 has run) falls back to the last thing
 * they did there, then to when they joined. A row with none of the three
 * goes last, and ties keep the order they came in.
 */
export function orderByLastVisit<T extends PlaceMemberRow>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i, k: [at(r.last_seen_at), at(r.last_active_at), at(r.joined_at)] as const }))
    .sort((a, b) => b.k[0] - a.k[0] || b.k[1] - a.k[1] || b.k[2] - a.k[2] || a.i - b.i)
    .map((x) => x.r)
}

/** Where the navigator was opened from. */
export type NavigatorCurrent = { kind: "community"; id: string } | { kind: "storelib" }

/** One row of the panel, in order. `current` marks the community being looked at. */
export type NavigatorRow =
  | { kind: "community"; community: PlaceCommunity; href: string; current: boolean }
  | { kind: "link"; key: "discover-communities" | "explore"; label: string; href: string }

export interface NavigatorModel {
  communities: NavigatorRow[]
  links: NavigatorRow[]
  /** The action at the foot of the panel. Signed out there are two (Log in and Start creating). */
  actions: { key: "dashboard" | "start-creating" | "log-in"; label: string; href: string; primary: boolean }[]
}

/**
 * THE PANEL, AS DATA. Signed in: my communities (the current one marked),
 * Discover communities, Explore, then Dashboard for a seller or Start
 * creating for everybody else. Signed out: Explore, Discover communities,
 * then Log in and Start creating. With communities switched off there is no
 * community anywhere in it. A community slug that would not make a safe path
 * is dropped rather than linked.
 */
export function navigatorModel(places: PlacesResponse, current?: NavigatorCurrent): NavigatorModel {
  const on = places.communitiesOn
  const communities: NavigatorRow[] = on && places.signedIn
    ? places.communities
        .filter((c) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(c.slug))
        .map((c) => ({ kind: "community" as const, community: c, href: `/community/${c.slug}`, current: current?.kind === "community" && current.id === c.id }))
    : []
  const discover: NavigatorRow = { kind: "link", key: "discover-communities", label: "Discover communities", href: "/explore/communities" }
  const explore: NavigatorRow = { kind: "link", key: "explore", label: "Explore", href: "/explore" }
  const links = places.signedIn ? [...(on ? [discover] : []), explore] : [explore, ...(on ? [discover] : [])]
  const actions: NavigatorModel["actions"] = places.signedIn
    ? [places.hasSellerAccess
        ? { key: "dashboard", label: "Dashboard", href: "/app", primary: true }
        : { key: "start-creating", label: "Start creating", href: "/sell", primary: true }]
    : [
        { key: "log-in", label: "Log in", href: "/login", primary: false },
        { key: "start-creating", label: "Start creating", href: "/sell", primary: true },
      ]
  return { communities, links, actions }
}

/** A body from the route, read defensively: anything unexpected is the signed out answer. */
export function parsePlaces(body: unknown): PlacesResponse {
  if (!body || typeof body !== "object") return SIGNED_OUT_PLACES
  const b = body as Record<string, unknown>
  const list = Array.isArray(b.communities) ? b.communities : []
  return {
    signedIn: b.signedIn === true,
    communitiesOn: b.communitiesOn === true,
    isCreator: b.isCreator === true,
    hasSellerAccess: b.hasSellerAccess === true,
    communities: list
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .filter((c) => typeof c.id === "string" && typeof c.slug === "string" && typeof c.name === "string")
      .map((c) => ({ id: c.id as string, slug: c.slug as string, name: c.name as string, logoUrl: typeof c.logoUrl === "string" ? c.logoUrl : null }))
      .slice(0, PLACES_LIMIT),
  }
}
