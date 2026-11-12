/**
 * ===========================================================================
 *  AN INSTAGRAM PROFILE'S PICTURE (AND, WITH META'S TOKEN, ITS POSTS)
 * ===========================================================================
 * The owner, round 3: "fetch images and the profile avatar from an Instagram
 * profile for social embeds and blocks". What Instagram allows, honestly:
 *
 *   WITH A META APP TOKEN  (INSTAGRAM_GRAPH_ACCESS_TOKEN and
 *       INSTAGRAM_GRAPH_USER_ID, a Business or Creator account connected to a
 *       Meta app with instagram_basic): the Graph API's business_discovery
 *       field, Meta's official way to read another professional account's
 *       public name, profile picture and recent posts. A personal account is
 *       not visible to it.
 *   WITHOUT ONE: the profile page's public Open Graph picture, read once on
 *       the creator's own request through the same private address guard as
 *       every link preview (lib/api/public-fetch). Instagram often answers a
 *       server with its sign-in page instead, and then there is no picture:
 *       the creator's own upload stays.
 *
 * Either way the picture is copied into Storelib's storage (app/api/onepage/
 * instagram-profile): Instagram's CDN addresses are signed and expire within
 * days, so one is never saved on a page. Posts are kept as their permalinks,
 * which the page shows through Instagram's own embed. Nothing is scraped
 * beyond the page's <meta> tags, and nothing runs on a schedule.
 *
 * Pure, for tests/onepage-social-r3.test.ts: no fetch here.
 */
import { cleanMetaText, parseLinkMetadata } from "./link-metadata"

export { instagramUsername } from "./instagram-username"

export interface GraphConfig {
  token: string
  userId: string
}

/** Meta's token and the professional account it reads through, when both are set. */
export function instagramGraphConfig(env: Record<string, string | undefined>): GraphConfig | null {
  const token = env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim()
  const userId = env.INSTAGRAM_GRAPH_USER_ID?.trim()
  if (!token || !userId || !/^\d{5,25}$/.test(userId)) return null
  return { token, userId }
}

/** The Graph API's business_discovery request for `username`, at Meta's API `version` (lib/analytics/destinations/providers META_GRAPH_VERSION). */
export function businessDiscoveryUrl(cfg: GraphConfig, username: string, version: string): string {
  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,media.limit(9){permalink,media_type}}`
  return `https://graph.facebook.com/${version}/${cfg.userId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(cfg.token)}`
}

export interface InstagramProfile {
  username: string
  name: string | null
  /** The picture's address on Instagram's CDN: copied into storage, never saved as it is. */
  picture: string | null
  /** Post addresses (instagram.com/p/... or /reel/...), newest first. Only through the Graph API. */
  posts: string[]
}

const POST = /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/

function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 2048) return null
  try {
    const u = new URL(v)
    return u.protocol === "https:" ? u.href : null
  } catch {
    return null
  }
}

/** A business_discovery answer as a profile, or null. */
export function parseBusinessDiscovery(json: unknown, username: string): InstagramProfile | null {
  const bd = (json as { business_discovery?: Record<string, unknown> } | null)?.business_discovery
  if (!bd || typeof bd !== "object") return null
  const media = ((bd.media as { data?: unknown[] } | undefined)?.data || []) as { permalink?: unknown }[]
  const posts = media
    .map((m) => httpsUrl(m?.permalink))
    .filter((p): p is string => !!p && POST.test(p))
    .slice(0, 9)
  return {
    username: typeof bd.username === "string" ? bd.username : username,
    name: typeof bd.name === "string" ? cleanMetaText(bd.name, 120) || null : null,
    picture: httpsUrl(bd.profile_picture_url),
    posts,
  }
}

/**
 * A profile page's Open Graph picture and name, or null when the answer is
 * Instagram's sign-in page or its own logo rather than the profile.
 */
export function parseProfileOpenGraph(html: string, username: string): InstagramProfile | null {
  const address = `https://www.instagram.com/${username}/`
  const meta = parseLinkMetadata(html, address)
  const picture = meta.image
  if (!picture) return null
  let host = ""
  try {
    host = new URL(picture).hostname.toLowerCase()
  } catch {
    return null
  }
  /* A profile's picture is on Instagram's or Facebook's CDN; the sign-in page's is Instagram's logo from static.cdninstagram.com. */
  if (!/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(host) || host === "static.cdninstagram.com" || /\/rsrc\.php\//.test(picture)) return null
  /* "Satori Studio (@satori) • Instagram photos and videos" */
  const named = /^(.*?)\s*\(@[A-Za-z0-9._]+\)/.exec(meta.title)
  return { username, name: named?.[1]?.trim() || null, picture, posts: [] }
}
