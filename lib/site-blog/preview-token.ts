import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * ===========================================================================
 *  A LINK TO A CREATOR'S DRAFT POST
 * ===========================================================================
 * /blogs/<handle>/~preview/<token> draws a post's draft, noindex and never
 * cached, for whoever holds the link. The token is the post's id and an
 * expiry a day ahead, signed with the server's key under a namespace of its
 * own (`site-blog-preview.`), so a storelib.com blog preview token never
 * opens a creator's post nor the other way round, it cannot be made from the
 * id alone, and it ends by itself.
 *
 *     <post id>.<expiry, base36>.<HMAC-SHA256, hex, first 32>
 *
 * The post is still read by the creator the site belongs to
 * (readPreviewPost filters creator_id), so a token for one store's post
 * opens nothing on another store's site.
 */

export const SITE_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000

function key(): string | null {
  const k = process.env.SITE_BLOG_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return k.length >= 16 ? k : null
}

const sig = (k: string, id: string, exp: string) => createHmac("sha256", k).update(`site-blog-preview.${id}.${exp}`).digest("hex").slice(0, 32)

export function signSitePostPreview(postId: string, now = Date.now(), ttl = SITE_PREVIEW_TTL_MS): string | null {
  const k = key()
  if (!k || !/^[0-9a-f-]{36}$/i.test(postId)) return null
  const exp = (now + ttl).toString(36)
  return `${postId.toLowerCase()}.${exp}.${sig(k, postId.toLowerCase(), exp)}`
}

/** The post id a token opens, or null when this server did not sign it or it has run out. */
export function verifySitePostPreview(token: string | null | undefined, now = Date.now()): string | null {
  const k = key()
  if (!k || !token || typeof token !== "string" || token.length > 120) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [id, exp, given] = parts
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-z]{1,12}$/.test(exp) || !/^[0-9a-f]{32}$/.test(given)) return null
  const ms = parseInt(exp, 36)
  if (!Number.isFinite(ms) || ms < now) return null
  const want = Buffer.from(sig(k, id, exp), "hex")
  const got = Buffer.from(given, "hex")
  return got.length === want.length && timingSafeEqual(got, want) ? id : null
}
