/**
 * The username in an Instagram profile address, for the editor and the
 * server alike (no imports: the editor bundles it). lib/onepage/instagram-
 * profile is the rest of the story.
 */
/* i18n-ignore-start: Instagram's own paths and Meta's field names. */
const RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "developer", "legal", "web", "emails", "challenge", "graphql", "api"])
/* i18n-ignore-end */

/** The username in a profile address, "@name" or a bare name; null for a post, a reel or anything else. */
export function instagramUsername(raw: string | null | undefined): string | null {
  const s = (raw || "").trim()
  if (!s) return null
  const bare = /^@?([A-Za-z0-9._]{1,30})$/.exec(s)
  if (bare && !s.includes("/")) return valid(bare[1])
  let u: URL
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "")
  if (host !== "instagram.com" && host !== "instagr.am") return null
  const parts = u.pathname.split("/").filter(Boolean)
  if (parts.length !== 1) return null
  return valid(parts[0].replace(/^@/, ""))
}

function valid(name: string): string | null {
  const n = name.toLowerCase()
  if (!/^[a-z0-9._]{1,30}$/.test(n) || RESERVED.has(n) || n.startsWith(".") || n.endsWith(".")) return null
  return n
}

