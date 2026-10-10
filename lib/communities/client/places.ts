/**
 * ===========================================================================
 *  THE COMMUNITY NAVIGATOR: WHERE A MEMBER IS, AS DATA
 * ===========================================================================
 * Round 15. Inside a community every screen is a PLACE: the feed (All), a
 * space, Learn and one program, the Calendar and one event, Members, the
 * Leaderboard, About, a person's profile, Saved, Notifications and the
 * member's own Membership page. The community layout owns the screen and
 * draws the place; moving between places changes the address with
 * history.pushState and never asks the server for a page
 * (navigator-context.tsx, components/community/member/place-host.tsx).
 *
 * This file (places.ts, re-exported whole by navigator.ts) is the pure half: the Place type, its one canonical address
 * (placeHref) and the way back from an address (placeFromUrl). Browser
 * safe, server safe, no React, so tests drive it directly and the server
 * pages use the same rules as the client.
 *
 * THE ADDRESSES stay the clean paths they always were, so sharing, a reload
 * and search engines keep working: /community/<slug>/learn,
 * /community/<slug>/space/<space>. The one new address is the owner's own:
 * a person's profile inside the community is /community/<slug>?profile=
 * <handle> (and ?profile=me). The old /members/<id> still opens it, and so
 * does the phone's ?space=<space> on the home address.
 */

export type Place =
  | { kind: "feed" }
  | { kind: "space"; slug: string }
  | { kind: "learn" }
  | { kind: "program"; id: string }
  | { kind: "calendar" }
  | { kind: "event"; id: string }
  | { kind: "members" }
  | { kind: "leaderboard" }
  | { kind: "about" }
  | { kind: "profile"; ref: string /* a handle, "me", or (from an old /members/<id> link) a user id */ }
  | { kind: "saved" }
  | { kind: "notifications" }
  | { kind: "membership" }

export type PlaceKind = Place["kind"]

/** Every kind, in the order the places are listed. */
export const PLACE_KINDS: readonly PlaceKind[] = ["feed", "space", "learn", "program", "calendar", "event", "members", "leaderboard", "about", "profile", "saved", "notifications", "membership"]

/** The address's query word for a profile inside the community. */
export const PROFILE_PARAM = "profile"
/** The phone's query word for a space on the home address (lib/community/feed-space-address.ts). */
export const SPACE_PARAM = "space"

/** A space's or a handle's characters. Anything else in an address is not a place. */
const SLUG = /^[a-z0-9](?:[a-z0-9_.-]{0,62}[a-z0-9_])?$/i
/** A program's or an event's id: a uuid or a slug. */
const ID = /^[0-9a-z](?:[0-9a-z-]{0,62}[0-9a-z])?$/i

function clean(value: string | null | undefined, pattern: RegExp): string | null {
  if (!value) return null
  let v = value
  try {
    v = decodeURIComponent(value)
  } catch {
    return null
  }
  return pattern.test(v) ? v : null
}

/** One string per place, the same place always the same string: "feed", "space:general", "profile:me"... */
export function placeKey(place: Place): string {
  switch (place.kind) {
    case "space":
      return `space:${place.slug.toLowerCase()}`
    case "program":
      return `program:${place.id}`
    case "event":
      return `event:${place.id}`
    case "profile":
      return `profile:${place.ref.toLowerCase()}`
    default:
      return place.kind
  }
}

/** The place a key names (placeKey's way back), or null for anything else. Also what the JSON place route reads from ?p=. */
export function placeFromKey(key: string | null | undefined): Place | null {
  if (!key) return null
  const at = key.indexOf(":")
  const kind = (at < 0 ? key : key.slice(0, at)) as PlaceKind
  const arg = at < 0 ? "" : key.slice(at + 1)
  switch (kind) {
    case "feed":
    case "learn":
    case "calendar":
    case "members":
    case "leaderboard":
    case "about":
    case "saved":
    case "notifications":
    case "membership":
      return at < 0 ? { kind } : null
    case "space": {
      const slug = clean(arg, SLUG)
      return slug ? { kind, slug: slug.toLowerCase() } : null
    }
    case "program":
    case "event": {
      const id = clean(arg, ID)
      return id ? { kind, id } : null
    }
    case "profile": {
      const ref = clean(arg, SLUG)
      return ref ? { kind, ref: ref.toLowerCase() } : null
    }
    default:
      return null
  }
}

/** Whether two places are the same place. */
export function samePlace(a: Place | null | undefined, b: Place | null | undefined): boolean {
  return !!a && !!b && placeKey(a) === placeKey(b)
}

/** The canonical address of a place in the community at /community/<slug>. */
export function placeHref(slug: string, place: Place): string {
  const base = `/community/${slug}`
  switch (place.kind) {
    case "feed":
      return base
    case "space":
      return `${base}/space/${encodeURIComponent(place.slug.toLowerCase())}`
    case "learn":
      return `${base}/learn`
    case "program":
      return `${base}/learn/${encodeURIComponent(place.id)}`
    case "calendar":
      return `${base}/events`
    case "event":
      return `${base}/events/${encodeURIComponent(place.id)}`
    case "members":
      return `${base}/members`
    case "leaderboard":
      return `${base}/leaderboard`
    case "about":
      return `${base}/about`
    case "profile":
      return `${base}?${PROFILE_PARAM}=${encodeURIComponent(place.ref.toLowerCase())}`
    case "saved":
      return `${base}/saved`
    case "notifications":
      return `${base}/notifications`
    case "membership":
      return `${base}/membership`
  }
}

/** The community's slug in an address, or null when it is not a community address. */
export function slugFromPath(pathname: string | null | undefined): string | null {
  const path = (pathname || "").split(/[?#]/)[0]
  const m = /^\/community\/([^/]+)/.exec(path)
  return m ? clean(m[1], SLUG) : null
}

/**
 * The place an address is, or null when it is not a place (a post, the join page, a share picture, another community's
 * deeper path). Both shapes a place has had are read: /space/<x> and the phone's ?space=<x>, ?profile=<ref> and the old
 * /members/<id>, Learn's old /classroom.
 */
export function placeFromUrl(pathname: string, search: string): Place | null {
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  const m = /^\/community\/[^/]+((?:\/[^/]+)*)$/.exec(path)
  if (!m) return null
  const parts = m[1].split("/").filter(Boolean)
  if (parts.length === 0) {
    let q: URLSearchParams
    try {
      q = new URLSearchParams((search || "").replace(/^\?/, ""))
    } catch {
      return { kind: "feed" }
    }
    const rawProfile = q.get(PROFILE_PARAM)
    if (rawProfile !== null) {
      const ref = SLUG.test(rawProfile) ? rawProfile : null
      if (ref) return { kind: "profile", ref: ref.toLowerCase() }
    }
    const rawSpace = q.get(SPACE_PARAM)
    if (rawSpace !== null && SLUG.test(rawSpace)) return { kind: "space", slug: rawSpace.toLowerCase() }
    return { kind: "feed" }
  }
  const [first, second, ...rest] = parts
  if (rest.length) return null
  switch (first) {
    case "space": {
      const slug = clean(second, SLUG)
      return slug ? { kind: "space", slug: slug.toLowerCase() } : null
    }
    case "learn":
    case "classroom": {
      if (!second) return { kind: "learn" }
      const id = clean(second, ID)
      return id ? { kind: "program", id } : null
    }
    case "events": {
      if (!second) return { kind: "calendar" }
      const id = clean(second, ID)
      return id ? { kind: "event", id } : null
    }
    case "members": {
      if (!second) return { kind: "members" }
      const ref = clean(second, SLUG)
      return ref ? { kind: "profile", ref: ref.toLowerCase() } : null
    }
    case "leaderboard":
    case "about":
    case "saved":
    case "notifications":
    case "membership":
      return second ? null : ({ kind: first } as Place)
    default:
      return null
  }
}

/** A post's own address in a community: /community/<slug>/post/<id or words-shortid>. */
export function isPostAddress(pathname: string | null | undefined): boolean {
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  return /^\/community\/[^/]+\/post\/[^/]+$/.test(path)
}

/**
 * WHETHER THE SHELL IS AT A PLACE, WITH A POST OPEN OVER IT (round 16, ARCH16 finding B). Opening a post pushes the post's
 * own address, which is not a place; the host used to read that as "the router's page is showing", so while a post was
 * open (and as it closed) the place under it could be hidden or swapped for the routed slot. A post's address now keeps
 * whatever the host was at before it (`held`): the place under the post never changes because of the address. An
 * address that is neither a place nor a post (another page entirely) is not a place.
 */
export function atPlaceFor(pathname: string, search: string, held: boolean, overLayer = true): boolean {
  if (placeFromUrl(pathname, search) !== null) return true
  return held && overLayer && isPostAddress(pathname)
}

/**
 * WHETHER THE ENTRY THE BROWSER IS ON IS AN OPENED POST'S OWN (round 17). A post opened over a place pushes its address with
 * a mark of its own (lightbox.tsx useHistoryLayer, `storelibLayer`), and only that entry may keep the place. The ROUTER can
 * reach a post's address too: a comment notification (`/post/<id>#c-<comment>`, which the shell's link catcher let go), a
 * post's short address that no card on screen holds, a link inside a post. Round 16 held the place for those as well, so
 * the post's own page (the post over the feed) was drawn under a hidden Activity: the address changed and nothing showed.
 */
export function onLayerEntry(state: unknown): boolean {
  return !!state && typeof state === "object" && typeof (state as { storelibLayer?: unknown }).storelibLayer === "string"
}

/**
 * THE SLOT A PLACE IS DRAWN IN (the coordinator's rule for round 15). All, every feed space and Saved are lists of ONE
 * feed: they share the slot "feed" and one CommunityFeed, which reads the list from useCommunityNavigator().place and
 * switches it in place (the pill fill glides, the cards stay). A chat space is a slot of its own, "chat:<slug>"; whether a
 * space is a chat is the community's to say (`chatSpaces`; left out, a space is a feed space). Everything else is keyed
 * by its kind, and its id where it has one. The keep-alive limit counts slots.
 */
export function slotKeyOf(place: Place, chatSpaces?: ReadonlySet<string> | null): string {
  if (place.kind === "feed" || place.kind === "saved") return "feed"
  if (place.kind === "space") return chatSpaces?.has(place.slug.toLowerCase()) ? `chat:${place.slug.toLowerCase()}` : "feed"
  return placeKey(place)
}

/** The same rule under the host's older name. */
export const screenKey = slotKeyOf

/** The tab a place marks in the row of places: everything under the feed (a space, a profile, Saved, the inbox) is Community. */
export function placeTab(place: Place): "home" | "classroom" | "events" | "members" | "leaderboard" | "about" {
  switch (place.kind) {
    case "learn":
    case "program":
      return "classroom"
    case "calendar":
    case "event":
      return "events"
    case "members":
      return "members"
    case "leaderboard":
      return "leaderboard"
    case "about":
      return "about"
    default:
      return "home"
  }
}

