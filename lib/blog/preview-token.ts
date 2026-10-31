import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  A LINK TO A DRAFT
 * ===========================================================================
 * /admin/blog/preview/<token> draws a post's draft through the article's own
 * blocks, noindex, for whoever holds the link: the admin, or somebody the
 * admin sent it to. The token is the post's id and an expiry, signed with
 * the same key as the admin session (lib/admin-session.ts), so it cannot be
 * made from the post's id alone, it ends on its own, and changing the key
 * ends every one.
 *
 *     <post id>.<expiry, base36>.<HMAC-SHA256, hex, first 32>
 */

export const PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000

function key(): string | null {
  const k = process.env.BLOG_ADMIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return k.length >= 16 ? k : null
}

const sig = (k: string, id: string, exp: string) => createHmac("sha256", k).update(`blog-preview.${id}.${exp}`).digest("hex").slice(0, 32)

export function signPreviewToken(postId: string, now = Date.now(), ttl = PREVIEW_TTL_MS): string | null {
  const k = key()
  if (!k || !/^[0-9a-f-]{36}$/i.test(postId)) return null
  const exp = (now + ttl).toString(36)
  return `${postId}.${exp}.${sig(k, postId, exp)}`
}

/** The post id a token opens, or null when it is not one this server signed, or it has run out. */
export function verifyPreviewToken(token: string | null | undefined, now = Date.now()): string | null {
  const k = key()
  if (!k || !token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [id, exp, given] = parts
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-z]{1,12}$/.test(exp) || !/^[0-9a-f]{32}$/.test(given)) return null
  const ms = parseInt(exp, 36)
  if (!Number.isFinite(ms) || ms < now) return null
  const want = Buffer.from(sig(k, id, exp), "hex")
  const got = Buffer.from(given, "hex")
  return got.length === want.length && timingSafeEqual(got, want) ? id : null
}
