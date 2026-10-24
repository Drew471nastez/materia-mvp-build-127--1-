/**
 * ===========================================================================
 *  A GUEST'S PURCHASE, REMEMBERED BY THE BROWSER THAT MADE IT
 * ===========================================================================
 * Somebody buys without an account, closes the tab, and comes back to the
 * product a week later. They paid; they should see Download, not Buy. The
 * old answer was a copy of the receipt token in localStorage, which nothing
 * wrote after a checkout any more, which Safari empties after seven days,
 * and which any script on the page could read.
 *
 * Now the server keeps the note, in one cookie:
 *
 *     sl_owned = <grant>~<grant>~...        (newest first, at most MAX_GRANTS)
 *     grant    = <order id>.<expiry, unix seconds>.<signature>
 *     signature = HMAC-SHA256(key, "v1|<order id>|<receipt token>|<expiry>"),
 *                 base64url, the first 32 characters (192 bits)
 *
 * WHAT IT IS TIED TO. One order, by its id, AND that order's receipt token,
 * which never leaves the server here: a grant cannot be made for an order
 * without already holding that order's secret, and a grant names nothing
 * else. The receipt token is the credential the receipt email carries to the
 * address the order was paid with, so the grant is exactly as strong as the
 * email link and no stronger.
 *
 * WHAT IT IS NOT. Never an address, a device fingerprint or an IP: those are
 * shared by households, offices and phone networks, and are no proof of who
 * paid. A grant only ever comes from somebody who opened the receipt.
 *
 * REVOCATION. The grant only says "this browser opened the receipt of order
 * X". Every read goes back to the order row and asks canDeliver (./rules), so
 * a refund, a dispute or a failed payment closes it at once, wherever the
 * cookie is. Expiry is a year (GRANT_TTL_SECONDS), checked from the signed
 * value, not from the cookie's own Max-Age, which the browser controls.
 *
 * THE COOKIE. httpOnly (no script reads it), Secure on https, SameSite=Lax,
 * path /, host only: storelib.com's own, or the creator's domain when the
 * receipt was opened there (each host remembers what was opened on it).
 *
 * THE KEY. GUEST_ACCESS_SECRET when set, else RECEIPT_TOKEN_SECRET, else one
 * derived from the service role key under a label of its own (the fallback
 * lib/orders/signed-link.ts and lib/checkout/cart-tokens.ts use), so a
 * signature made here means nothing anywhere else that key signs.
 *
 * The pure half (format, sign, verify, merge) takes the key as an argument,
 * so tests/guest-access-r39.test.ts runs it without an environment; the
 * database half is in ./guest-access-server.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

export const GUEST_ACCESS_COOKIE = "sl_owned"
/** A year, as asked: long enough to come back to a course, short enough to end. */
export const GRANT_TTL_SECONDS = 365 * 24 * 60 * 60
/** A browser that bought more than this many things as a guest keeps the newest. 30 grants are about 2.4 KB. */
export const MAX_GRANTS = 30

const VERSION = "v1"
const SIG_CHARS = 32
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GRANT_SHAPE = /^([0-9a-f-]{36})\.(\d{9,11})\.([A-Za-z0-9_-]{32})$/

export interface Grant {
  orderId: string
  /** Unix seconds. */
  exp: number
  sig: string
}

/** The signing key from the environment, or null when the deployment has none (then nothing is remembered). */
export function guestAccessKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.GUEST_ACCESS_SECRET || env.RECEIPT_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (secret.length < 16) return null
  return createHmac("sha256", secret).update("storelib.guest-purchase-access.v1").digest()
}

function signature(key: Buffer, orderId: string, receiptToken: string, exp: number): string {
  return createHmac("sha256", key).update(`${VERSION}|${orderId.toLowerCase()}|${receiptToken}|${exp}`).digest("base64url").slice(0, SIG_CHARS)
}

/** A grant for one order, good until `now + GRANT_TTL_SECONDS`. */
export function signGrant(key: Buffer, order: { id: string; receiptToken: string }, now = Date.now()): Grant | null {
  if (!UUID.test(order.id) || typeof order.receiptToken !== "string" || order.receiptToken.length < 16) return null
  const exp = Math.floor(now / 1000) + GRANT_TTL_SECONDS
  return { orderId: order.id.toLowerCase(), exp, sig: signature(key, order.id, order.receiptToken, exp) }
}

/** True when this server signed the grant for this order's token and it has not run out. */
export function grantHolds(key: Buffer, grant: Grant, receiptToken: string | null | undefined, now = Date.now()): boolean {
  if (typeof receiptToken !== "string" || receiptToken.length < 16) return false
  if (!Number.isFinite(grant.exp) || grant.exp * 1000 <= now) return false
  const expected = Buffer.from(signature(key, grant.orderId, receiptToken, grant.exp))
  const given = Buffer.from(grant.sig)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Every well formed grant in the cookie, newest first, duplicates and junk dropped. Signatures are NOT checked here. */
export function readGrants(raw: string | null | undefined): Grant[] {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 8192) return []
  const out: Grant[] = []
  const seen = new Set<string>()
  for (const part of raw.split("~")) {
    const m = GRANT_SHAPE.exec(part.trim())
    if (!m || !UUID.test(m[1])) continue
    const orderId = m[1].toLowerCase()
    if (seen.has(orderId)) continue
    seen.add(orderId)
    out.push({ orderId, exp: Number(m[2]), sig: m[3] })
    if (out.length >= MAX_GRANTS) break
  }
  return out
}

export function writeGrants(grants: readonly Grant[]): string {
  return grants.map((g) => `${g.orderId}.${g.exp}.${g.sig}`).join("~")
}

/** The cookie with these grants added in front (replacing older grants for the same orders), expired ones dropped, capped. */
export function mergeGrants(existing: readonly Grant[], added: readonly Grant[], now = Date.now()): Grant[] {
  const live = (g: Grant) => g.exp * 1000 > now
  const ids = new Set(added.map((g) => g.orderId))
  return [...added.filter(live), ...existing.filter((g) => live(g) && !ids.has(g.orderId))].slice(0, MAX_GRANTS)
}

/** The grants without these orders (a refund seen, an order claimed into an account). */
export function withoutOrders(grants: readonly Grant[], orderIds: Iterable<string>): Grant[] {
  const drop = new Set([...orderIds].map((id) => id.toLowerCase()))
  return grants.filter((g) => !drop.has(g.orderId))
}

/** How the cookie is written. `secure` is true on https (always, in production). */
export function guestAccessCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: GRANT_TTL_SECONDS }
}

/** The cookie's value from a request's Cookie header. */
export function guestAccessFromCookieHeader(header: string | null | undefined): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=")
    if (i < 0 || part.slice(0, i).trim() !== GUEST_ACCESS_COOKIE) continue
    const value = part.slice(i + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return null
}

/** Whether the browser reached us over https (behind Vercel the request URL can say http; the forwarded protocol does not lie about it). */
export function requestIsHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (forwarded) return forwarded === "https"
  try {
    return new URL(request.url).protocol === "https:"
  } catch {
    return true
  }
}
