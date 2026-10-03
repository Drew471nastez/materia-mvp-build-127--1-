import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  THE PAYOUTS DEMO'S DOOR
 * ===========================================================================
 * /app/payouts/demo is the real Payouts page drawn with made up data, so its
 * owner can see every state (a dispute, a failed payout, Stripe asking for
 * details, setup not started) in production without a real account in that
 * state. It shows nothing real, but it is still behind a password.
 *
 *   THE PASSWORD IS NEVER IN THE CODE. Only its SHA-256 is, and the server
 *   compares hashes in constant time. PAYOUTS_DEMO_PASSWORD_SHA256 replaces
 *   it without a deploy of new code.
 *
 *   THE DOOR STAYS OPEN FOR ONE PERSON. After the right password the server
 *   sets an httpOnly cookie signed with a key derived from a server secret,
 *   bound to the signed in person's id and valid for seven days. Copied to
 *   another account, it opens nothing.
 */
export const DEMO_COOKIE = "storelib_payouts_demo"
export const DEMO_TTL_SECONDS = 7 * 24 * 3600

/** SHA-256 of the demo password. */
const DEFAULT_PASSWORD_SHA256 = "0f90d50d7717427404294b99c7fe10080662993a11d003e39ae65d37aa148451"

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export function passwordMatches(input: unknown): boolean {
  if (typeof input !== "string" || input.length === 0 || input.length > 200) return false
  const want = (process.env.PAYOUTS_DEMO_PASSWORD_SHA256 || DEFAULT_PASSWORD_SHA256).trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(want)) return false
  return timingSafeEqual(Buffer.from(sha256Hex(input), "hex"), Buffer.from(want, "hex"))
}

function signingKey(): Buffer | null {
  const secret = process.env.PAYOUTS_DEMO_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!secret) return null
  return createHmac("sha256", secret).update("storelib.payouts-demo.v1").digest()
}

function signature(key: Buffer, userId: string, expires: number): string {
  return createHmac("sha256", key).update(`${userId}.${expires}`).digest("hex")
}

/** The cookie's value for this person: when it ends, and the signature over who and when. */
export function demoToken(userId: string, now = Date.now()): string | null {
  const key = signingKey()
  if (!key || !userId) return null
  const expires = Math.floor(now / 1000) + DEMO_TTL_SECONDS
  return `${expires}.${signature(key, userId, expires)}`
}

export function demoTokenValid(token: string | null | undefined, userId: string | null | undefined, now = Date.now()): boolean {
  const key = signingKey()
  if (!key || !token || !userId) return false
  const match = /^(\d{9,12})\.([0-9a-f]{64})$/.exec(token)
  if (!match) return false
  const expires = Number(match[1])
  if (!Number.isFinite(expires) || expires * 1000 < now) return false
  const want = Buffer.from(signature(key, userId, expires), "hex")
  const got = Buffer.from(match[2], "hex")
  return want.length === got.length && timingSafeEqual(want, got)
}
