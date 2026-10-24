import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  THE CREATOR IS STILL NOT A VISITOR WHEN THE PAGE IS NOT ON storelib.com
 * ===========================================================================
 * lib/analytics/own-visit.ts leaves the owner's own visits out by reading
 * the session. That works on storelib.com and nowhere else, because the
 * session cookie is HOST-ONLY on purpose (proxy.ts says why: a published
 * page carries model-written JavaScript, and a session shared across hosts
 * would be readable from it). So a creator opening
 *
 *     name.storelib.com        their website
 *     storelib.me/name         their OnePage
 *     their-own-domain.com     a connected domain
 *
 * sent no session, answered "not the owner", and was counted as a visitor.
 * On a new store that is most of the traffic, which is the one thing the
 * analytics were asked not to do.
 *
 * So each of those hosts gets a marker of its own, and it is not a session:
 *
 *   1. The app builds a link to the site carrying a HAND token, good for
 *      two minutes and once on each host, naming the creator (ownLink
 *      below, consumeOwnHandoff).
 *   2. /api/analytics/own, on the site's own host, checks the signature and
 *      answers with a MARK cookie, host-only, httpOnly, and a redirect to
 *      the page without the token in the address.
 *   3. The tracker refuses a view whose MARK names the creator it is about
 *      to be counted for (lib/analytics/collect).
 *
 * What the marker can do is the whole of it: it stops one browser being
 * counted on one creator's pages. It carries no user, grants nothing, reads
 * nothing, and says no more than the creator id the page's own tracking
 * call already sends. Forging one would cost the forger's own visit.
 *
 * The key is ANALYTICS_OWN_SECRET when it is set, and otherwise one derived
 * from the service role key, as lib/orders/signed-link.ts derives its own:
 * already server-only, already configured, and labelled so a signature made
 * here is useless anywhere else that key signs.
 */

/** Host-only, httpOnly: set by the route below, read by the tracker. */
export const OWN_MARKER_COOKIE = "sl_own"
/**
 * The same MARK, for every site on Storelib's own domain (<name>.storelib.com),
 * set by the app while the creator uses it (app/api/analytics/own/token). So
 * the app opens such a site at its plain address, with no hop through
 * /api/analytics/own whose address the browser showed first. A connected
 * domain can't share a cookie with storelib.com, and keeps the hop.
 * Its own name, so it never stands in for a host's own marker.
 */
export const OWN_MARKER_DOMAIN_COOKIE = "sl_own_d"
/** What the link carries, and what the route reads it from. */
export const OWN_MARKER_PARAM = "t"

/**
 * Long enough to walk from the app to the site, short enough that a copied
 * link is stale before it reaches anyone (round AE4: it was half an hour).
 * The app asks for a new one well before that (lib/analytics/own-site).
 */
export const HANDOFF_TTL_MS = 2 * 60_000
/** The browser stays marked for half a year, then asks again by visiting from the app. */
export const MARKER_TTL_MS = 180 * 24 * 60 * 60 * 1000

type Kind = "hand" | "mark"
interface Token {
  k: Kind
  c: string
  e: number
  /** A hand-off's own name, so it can be used once on a host (consumeOwnHandoff). */
  n?: string
}

function signingKey(): Buffer | null {
  const secret = process.env.ANALYTICS_OWN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.own-marker.v1").digest()
}

function sign(key: Buffer, body: string): string {
  return createHmac("sha256", key).update(body).digest("hex")
}

function mint(kind: Kind, creatorId: string, ttl: number, now: number): string | null {
  const key = signingKey()
  if (!key || !creatorId) return null
  const payload: Token = kind === "hand" ? { k: kind, c: creatorId, e: now + ttl, n: randomBytes(12).toString("base64url") } : { k: kind, c: creatorId, e: now + ttl }
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${sign(key, body)}`
}

/** The token a link from the app carries. */
export function signOwnHandoff(creatorId: string, now = Date.now()): string | null {
  return mint("hand", creatorId, HANDOFF_TTL_MS, now)
}

/** The token the cookie holds, once a handoff has been checked. */
export function signOwnMarker(creatorId: string, now = Date.now()): string | null {
  return mint("mark", creatorId, MARKER_TTL_MS, now)
}

/** The creator this token names, when this server signed it and it has not expired. */
export function readOwnToken(token: string | null | undefined, kind: Kind, now = Date.now()): string | null {
  return readOwnPayload(token, kind, now)?.c ?? null
}

function readOwnPayload(token: string | null | undefined, kind: Kind, now: number): { c: string; n: string | null } | null {
  const key = signingKey()
  if (!key || typeof token !== "string" || token.length > 4096) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1), "hex")
  const expected = Buffer.from(sign(key, body), "hex")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: Token
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || payload.k !== kind) return null
  if (typeof payload.e !== "number" || payload.e < now) return null
  /* A hand-off without its own name is one from before it could be used only once: no longer taken. */
  if (kind === "hand" && (typeof payload.n !== "string" || !payload.n)) return null
  return typeof payload.c === "string" && payload.c ? { c: payload.c, n: typeof payload.n === "string" ? payload.n : null } : null
}

/** Where a hand-off is written down as used: the rate limiter's table (lib/api/rate-limit), swept after two days, long past any hand-off's two minutes. */
export const HANDOFF_BUCKET = "own_handoff"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * A HAND-OFF IS TAKEN ONCE ON EACH HOST. The first page view (or marker
 * route) that brings it on a host writes it down and gets the creator back;
 * any later one with the same token on that host gets null, so a link copied
 * from the app with #sl_own= on it cannot mark the browser of whoever opens
 * it next. Once per HOST, so the creator opening two of their sites from the
 * same screen is left out on both.
 *
 * Written down first, then counted: only a use that finds itself the one
 * row there is the first. Two arriving at the same moment both find two and
 * both count as visits, which errs the safe way. A database that cannot
 * write it down (an error, not "used") lets it through, as before: the worst
 * that does is not count one browser on one creator's pages.
 */
export async function consumeOwnHandoff(db: Db, token: string | null | undefined, host: string | null | undefined, now = Date.now()): Promise<string | null> {
  const payload = readOwnPayload(token, "hand", now)
  if (!payload?.n) return null
  const subject = `${payload.n}|${String(host ?? "").toLowerCase().slice(0, 253)}`
  try {
    const { error } = await db.from("rate_limit_hits").insert({ bucket: HANDOFF_BUCKET, subject })
    if (error) return payload.c
    const { data: uses, error: readError } = await db.from("rate_limit_hits").select("subject").eq("bucket", HANDOFF_BUCKET).eq("subject", subject).limit(2)
    if (readError || !Array.isArray(uses)) return payload.c
    return uses.length <= 1 ? payload.c : null
  } catch {
    return payload.c
  }
}

/**
 * THE ONE QUESTION THE TRACKER ASKS: is this browser the creator whose page
 * it is about to count? A cookie for another creator is somebody else's
 * marker and means nothing here, so their visit is counted as any other.
 */
export function marksOwner(cookieValue: string | null | undefined, creatorId: string | null | undefined, now = Date.now()): boolean {
  if (!creatorId) return false
  return readOwnToken(cookieValue, "mark", now) === creatorId
}

/**
 * The address the app sends the creator to: the page they asked for, by way
 * of the marker route on that page's own host. Only a plain https address is
 * taken, and only its own path is carried over, so nothing here can be
 * pointed at another site. Null when there is no key or the address is not
 * one, and the caller then links to the site as it always did.
 */
export function ownLink(siteUrl: string, creatorId: string, now = Date.now()): string | null {
  const token = signOwnHandoff(creatorId, now)
  if (!token) return null
  let url: URL
  try {
    url = new URL(siteUrl)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  const to = `${url.pathname}${url.search}` || "/"
  const marker = new URL("/api/analytics/own", url.origin)
  marker.searchParams.set(OWN_MARKER_PARAM, token)
  if (to !== "/") marker.searchParams.set("to", to)
  return marker.toString()
}

/**
 * Where the route sends the browser afterwards: a path on this same host and
 * nothing else. A value that names a host, a scheme, or a backslash the
 * browser would read as one, is the root instead.
 */
export function ownReturnPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/"
  if (raw.length > 2048 || /[\x00-\x1f\x7f\\]/.test(raw)) return "/"
  return raw
}
