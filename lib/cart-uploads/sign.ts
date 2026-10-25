/**
 * ===========================================================================
 *  WHOSE PICTURE THIS IS: THE BROWSER'S CART ID AND THE SIGNATURE ON A VALUE
 * ===========================================================================
 * The browser that uploads a picture is given a random id in an httpOnly
 * cookie on the store's host (`sl_cart_uid`, 24 random bytes). The server
 * keeps only its SHA-256 (`visitor_hash`), never the id itself.
 *
 * A cart line's value for the picture (lib/cart-uploads/rules.ts) carries
 * `<id>.<sig>`, where `sig` is an HMAC-SHA256 over the store's id, the
 * upload's id and that hash, under a key derived from the server's secret.
 * So the value:
 *   - names nothing anyone can list or guess (128 random bits, then 132 of
 *     signature);
 *   - checks only in the browser that has the cookie: copied into another
 *     cart, sent from another browser, it is refused;
 *   - checks only on the store it was made for: the same value on another
 *     store's host is refused before the database is asked.
 * The row in cart_uploads says the same again (its creator_id and
 * visitor_hash), and every read asks both.
 */
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto"

import { CART_VISITOR_COOKIE, CART_VISITOR_MAX_AGE, readRef } from "./rules"

const UID = /^[A-Za-z0-9_-]{32}$/
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

function key(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign cart uploads with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-cart-uploads"), Buffer.from(own ? "own" : "service"), 32))
}

/** A new id for a browser's cart. */
export function newCartVisitor(): string {
  return randomBytes(24).toString("base64url")
}

/** The cart id in a Cookie header, or null. */
export function cartVisitorOf(cookieHeader: string | null | undefined): string | null {
  const raw = String(cookieHeader ?? "").match(new RegExp(`(?:^|;\\s*)${CART_VISITOR_COOKIE}=([^;]*)`))?.[1]
  return raw && UID.test(raw) ? raw : null
}

/** What the server keeps of the id: its SHA-256, 64 hex. */
export function visitorHash(visitor: string): string {
  return createHash("sha256").update(`cart-visitor:${visitor}`).digest("hex")
}

/** The Set-Cookie for the id: httpOnly, this host only, 30 days. */
export function cartVisitorCookie(visitor: string, secure = true): string {
  return `${CART_VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=${CART_VISITOR_MAX_AGE}; SameSite=Lax; HttpOnly${secure ? "; Secure" : ""}`
}

function signature(creatorId: string, uploadId: string, hash: string): string {
  return createHmac("sha256", key()).update(`cart-upload:v1:${creatorId.toLowerCase()}:${uploadId.toLowerCase()}:${hash}`).digest("base64url").slice(0, 22)
}

/** The 32 hex of a uuid, as a value names it. */
export function compactId(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase()
}

/** The uuid a value's 32 hex is. */
export function uuidOf(id: string): string {
  const h = id.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** `<id>.<sig>` for an upload of this store, from this browser. */
export function signRef(creatorId: string, uploadId: string, hash: string): string {
  const id = compactId(uploadId)
  return `${id}.${signature(creatorId, id, hash)}`
}

/**
 * The upload's uuid when `ref` was made for this store and this browser, else
 * null. Compared in constant time.
 */
export function verifyRef(ref: string, creatorId: string | null | undefined, hash: string | null | undefined): string | null {
  const r = readRef(ref)
  if (!r || !creatorId || !UUID.test(creatorId) || !hash || !/^[0-9a-f]{64}$/.test(hash)) return null
  const want = Buffer.from(signature(creatorId, r.id, hash))
  const got = Buffer.from(r.sig)
  return want.length === got.length && timingSafeEqual(want, got) ? uuidOf(r.id) : null
}
