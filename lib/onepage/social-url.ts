/**
 * ===========================================================================
 *  A SOCIAL LINK AS TYPED, MADE INTO AN ADDRESS
 * ===========================================================================
 * Moved out of ./types.ts unchanged, and re-exported from there, so a module
 * that needs only this does not have to compile the whole OnePage type file
 * with it: the structured data in lib/seo/structured-data.ts builds `sameAs`
 * from the same addresses the page draws its icons with.
 */

/**
 * Normalizes a social media URL/handle to a full URL.
 * Handles @username, plain usernames, and partial URLs.
 */
export function normalizeSocialUrl(platform: string, url: string): string {
  if (!url) return url

  // Already a full URL
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
    return url
  }

  // Platform base URLs
  const platformBaseUrls: Record<string, string> = {
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/@",
    twitter: "https://x.com/",
    youtube: "https://youtube.com/@",
    threads: "https://threads.net/@",
    facebook: "https://facebook.com/",
    github: "https://github.com/",
    linkedin: "https://linkedin.com/in/",
    twitch: "https://twitch.tv/",
    snapchat: "https://snapchat.com/add/",
    pinterest: "https://pinterest.com/",
    soundcloud: "https://soundcloud.com/",
    kick: "https://kick.com/",
    patreon: "https://patreon.com/",
    discord: "https://discord.gg/",
    spotify: "https://open.spotify.com/artist/",
    telegram: "https://t.me/",
    whatsapp: "https://wa.me/",
  }

  const baseUrl = platformBaseUrls[platform]

  // Handle email separately
  if (platform === 'email') {
    if (url.startsWith('mailto:')) return url
    if (url.includes('@')) return `mailto:${url}`
    return url
  }

  // Handle @username format
  if (url.startsWith('@')) {
    const username = url.slice(1)
    if (baseUrl && username) {
      return baseUrl + username
    }
  }

  // Handle plain username (no @, no URL-like characters)
  if (!url.includes('/') && !url.includes('.') && !url.includes(':') && baseUrl) {
    return baseUrl + url
  }

  // Has dots/slashes but no protocol — assume full URL missing https://
  if (!url.startsWith('http')) {
    return 'https://' + url
  }

  return url
}
