/**
 * ===========================================================================
 *  THE LINK IN A REVIEW REQUEST EMAIL
 * ===========================================================================
 * One link per order line (a review_requests row). It opens the review page
 * with no sign in: holding the link is proof enough to review that one
 * product from that one order, and to change that review for a while after.
 * It cannot download anything, see the order, or review anything else, so a
 * link forwarded by mistake costs one review at most, which the store can
 * hide.
 *
 *   token   base64url(16 bytes of the request id) + "." + base64url(first 16 bytes of HMAC-SHA256)
 *   key     REVIEW_LINK_SECRET, else NOTIFY_UNSUBSCRIBE_SECRET, else
 *           EMAIL_LINK_SECRET, derived with a label of its own so no other
 *           signed link (an unsubscribe, a campaign click) passes for one
 *
 * Nothing is stored: the token is made again from the row's id whenever an
 * email needs it, and checked by making it again. 46 characters, which an
 * email client never wraps.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

const LABEL = "storelib.review-request.v1"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function keyFrom(raw: string): Buffer | null {
  if (!raw || raw.length < 16) return null
  return createHmac("sha256", raw).update(LABEL).digest()
}

function secret(): string {
  return process.env.REVIEW_LINK_SECRET || process.env.NOTIFY_UNSUBSCRIBE_SECRET || process.env.EMAIL_LINK_SECRET || ""
}

const idBytes = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex")
function idFrom(bytes: Buffer): string {
  const h = bytes.toString("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Signs with a given secret. Exported for the tests. */
export function signRequestWith(rawSecret: string, requestId: string): string {
  const key = keyFrom(rawSecret)
  if (!key) throw new Error("No review link key is configured")
  if (!UUID.test(requestId)) throw new Error("Not a request id")
  const id = idBytes(requestId.toLowerCase())
  const mac = createHmac("sha256", key).update(id).digest().subarray(0, 16)
  return `${id.toString("base64url")}.${mac.toString("base64url")}`
}

export function verifyRequestWith(rawSecret: string, token: unknown): string | null {
  const key = keyFrom(rawSecret)
  if (!key || typeof token !== "string" || token.length > 80) return null
  const m = token.match(/^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})$/)
  if (!m) return null
  const id = Buffer.from(m[1], "base64url")
  const sig = Buffer.from(m[2], "base64url")
  if (id.length !== 16 || sig.length !== 16) return null
  const expected = createHmac("sha256", key).update(id).digest().subarray(0, 16)
  if (!timingSafeEqual(sig, expected)) return null
  return idFrom(id)
}

/** The token for a request, or null when no key is configured (the email then links to the receipt instead). */
export function signRequest(requestId: string): string | null {
  try {
    return signRequestWith(secret(), requestId)
  } catch {
    return null
  }
}

/** The request id a token names, or null for anything that was not made here. */
export function verifyRequest(token: unknown): string | null {
  return verifyRequestWith(secret(), token)
}

/** Whether a string looks like a token at all, before any database read. */
export function looksLikeRequestToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/.test(token)
}

/** The review page's address for a request, on a given origin. */
export function reviewPagePath(token: string, rate?: number): string {
  return `/review/${token}${rate && rate >= 1 && rate <= 5 ? `?rate=${rate}` : ""}`
}
