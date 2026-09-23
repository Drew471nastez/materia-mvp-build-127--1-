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
