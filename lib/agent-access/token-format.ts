/**
 * What a connection token is, with nothing else attached: making one,
 * hashing one, and telling one apart from anything else. Pure, so it can be
 * tested and imported without a server around it. The checking of a request
 * is in ./tokens.ts.
 */
import { createHash, randomBytes } from "node:crypto"

export const TOKEN_PREFIX = "slb_"

/** 32 random bytes, base64url: 43 characters an agent's config can hold. */
export function mintToken(): { token: string; hash: string; prefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/** The shape a real token has, checked before anything touches the database. */
export function looksLikeToken(value: string): boolean {
  return /^slb_[A-Za-z0-9_-]{43}$/.test(value)
}

/** Said to an agent whose key may only read. */
export const READ_ONLY_REFUSAL =
  "This connection key can read the site but not change it. Make a key that can change it in Website settings, Connections."

/** How long a new key works, unless the creator picks otherwise. */
export const DEFAULT_KEY_DAYS = 180

/** Whether a key's day has passed. A key with no day never expires. */
export function keyExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  if (!expiresAt) return false
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) && t <= now
}

/** Whether a key's scopes let it change the site. A key from before scopes existed (null) can. */
export function scopesCanWrite(scopes: unknown): boolean {
  return !Array.isArray(scopes) || scopes.includes("write")
}

/** The day a new key stops working: `days` from now, or never for 0. At most two years. */
export function expiryFor(days: unknown, now = Date.now()): string | null {
  const n = days === undefined ? DEFAULT_KEY_DAYS : Number(days)
  if (n === 0) return null
  const d = Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 730) : DEFAULT_KEY_DAYS
  return new Date(now + d * 86_400_000).toISOString()
}
