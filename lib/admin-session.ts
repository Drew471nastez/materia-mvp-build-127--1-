import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  THE ADMIN GATE, WITHOUT THE COOKIE JAR
 * ===========================================================================
 * Split from lib/admin-blog-auth.ts, which reads the cookie, so that the part
 * worth testing can be RUN: importing `next/headers` outside a request drags
 * the framework in and the suite cannot start. Everything here is arithmetic
 * over a string.
 *
 * ===========================================================================
 *  WHAT THIS IS
 * ===========================================================================
 * This cookie opens /admin/blog, which can write, edit and delete posts on
 * storelib.com, and /api/admin/spam-purge, which can DELETE USER ACCOUNTS.
 *
 * It used to be a constant:
 *
 *     const SESSION_TOKEN = "slblog_…_v1"
 *     return cookieStore.get("blog_admin")?.value === SESSION_TOKEN
 *
 * written in this file, next to the username and password that issued it,
 * all three in the repository. Anybody who could read the repo could set the
 * cookie by hand and skip the login entirely, and nothing could be revoked
 * without a deploy. A password in source is a password everybody has.
 *
 * So the cookie is now a SIGNED, DATED token rather than a known string:
 *
 *     v2.<issued, base36>.<nonce>.<HMAC-SHA256 of the two>
 *
 * The key is `BLOG_ADMIN_SECRET` when it is set, and the Supabase service
 * role key otherwise — a value that is already server-only and already in the
 * environment, so this needs no new configuration to be safe. The token
 * cannot be computed from the repository, it expires on its own, and
 * changing the key invalidates every one that has been issued.
 *
 * The PASSWORD has no fallback on purpose: see app/api/admin/blog/auth. With
 * `BLOG_ADMIN_PASSWORD` unset nobody can sign in at all, which is the right
 * answer for a credential that leaked, and setting it is one line in the
 * environment.
 */

const COOKIE = "blog_admin"
/** A month, the same as the cookie has always been given. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

function signingKey(): string | null {
  const key = process.env.BLOG_ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  // A short key is a missing key. Signing with "" would sign nothing.
  return key.length >= 16 ? key : null
}

function sign(key: string, issued: string, nonce: string): string {
  return createHmac("sha256", key).update(`blog-admin.${issued}.${nonce}`).digest("hex")
}

/**
 * A fresh token for somebody who just proved who they are. Null when there
 * is no key to sign with, which the login route reports rather than issuing
 * something unverifiable.
 */
export function issueSessionToken(): string | null {
  const key = signingKey()
  if (!key) return null
  const issued = Date.now().toString(36)
  const nonce = randomBytes(9).toString("hex")
  return `v2.${issued}.${nonce}.${sign(key, issued, nonce)}`
}

/** Whether a cookie value is one this server issued, and still current. */
export function verifySessionToken(raw: string | undefined | null): boolean {
  const key = signingKey()
  if (!key || !raw) return false

  const parts = raw.split(".")
  if (parts.length !== 4 || parts[0] !== "v2") return false
  const [, issued, nonce, given] = parts

  const ms = Number.parseInt(issued, 36)
  if (!Number.isFinite(ms)) return false
  // Expired, or issued in a future this server has not reached: both are
  // tokens to refuse rather than argue with.
  if (Date.now() - ms > SESSION_MAX_AGE * 1000) return false
  if (ms > Date.now() + 60_000) return false

  const want = Buffer.from(sign(key, issued, nonce), "hex")
  let got: Buffer
  try {
    got = Buffer.from(given, "hex")
  } catch {
    return false
  }
  // Length first: timingSafeEqual throws on a mismatch rather than returning.
  return got.length === want.length && timingSafeEqual(got, want)
}

export const ADMIN_COOKIE = COOKIE
