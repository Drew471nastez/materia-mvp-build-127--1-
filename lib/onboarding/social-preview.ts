/**
 * ===========================================================================
 *  WHOSE ACCOUNT IS THIS: A SOCIAL HANDLE TO ITS PUBLIC PROFILE
 * ===========================================================================
 * The seller onboarding's socials step shows, at the right of each field,
 * the picture of the account typed into it, so a person sees at once that it
 * is theirs. This file is pure: what a typed value means on each network,
 * and which public profile page to read. The route
 * (app/api/onboarding/social-preview) reads that page through fetchPublic
 * and returns its picture and name.
 */

export type SocialNetwork = "instagram" | "tiktok" | "youtube" | "twitter"

const HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /^(?:www\.)?instagram\.com$/i,
  tiktok: /^(?:www\.|m\.)?tiktok\.com$/i,
  youtube: /^(?:www\.|m\.)?youtube\.com$/i,
  twitter: /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i,
}

/** A handle each network would accept: letters, digits, dot, underscore, hyphen; 1 to 50. */
const HANDLE = /^[A-Za-z0-9._-]{1,50}$/

/**
 * The account a typed value names, as the network's own handle, or null.
 * "@name", "name", "instagram.com/name", "https://www.tiktok.com/@name",
 * "youtube.com/@channel" and "x.com/name" all read the same way. A link to
 * another site is not an account here.
 */
export function socialHandle(network: SocialNetwork, raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let value = raw.trim()
  if (!value) return null
  if (/[/.]/.test(value) && /(?:\.com|\/)/i.test(value)) {
    let url: URL
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    } catch {
      return null
    }
    if (!HOSTS[network].test(url.hostname)) return null
    const first = url.pathname.split("/").filter(Boolean)[0] ?? ""
    value = first
  }
  value = value.replace(/^@+/, "")
  return HANDLE.test(value) && !/^\.|\.$/.test(value) ? value : null
}

/** The public profile page to read for that handle. */
export function profileUrl(network: SocialNetwork, handle: string): string {
  switch (network) {
    case "instagram":
      return `https://www.instagram.com/${handle}/`
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`
    case "youtube":
      return `https://www.youtube.com/@${handle}`
    case "twitter":
      return `https://x.com/${handle}`
  }
}

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return value === "instagram" || value === "tiktok" || value === "youtube" || value === "twitter"
}

/** A picture worth showing: https, and not the network's own logo standing in for a profile. */
export function usablePicture(url: string | null | undefined): string | null {
  if (!url || !/^https:\/\//i.test(url)) return null
  if (/static\.cdninstagram\.com\/rsrc|\/favicon|abs\.twimg\.com\/(?:responsive-web|favicons)|youtube\.com\/img\/desktop|ttwstatic\.com\/.*logo/i.test(url)) return null
  return url
}
