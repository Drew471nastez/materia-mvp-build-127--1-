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
 * ONE NAME PER PLATFORM, WHATEVER THE DATA CALLS IT.
 *
 * The editor stores `twitter`, `applemusic`, `email` and `website`, but a row
 * imported from elsewhere, or written by an older editor, can say `x`,
 * `apple_music`, `mail` or `web`. Both the address below and the icon in
 * components/onepage/brand-icons.tsx go through this first, so a platform is
 * never drawn as one thing and linked as another, and an alias is never the
 * reason a link disappears from the page.
 */
const SOCIAL_PLATFORM_ALIASES: Record<string, string> = {
  x: "twitter",
  "x-twitter": "twitter",
  twitter_x: "twitter",
  apple_music: "applemusic",
  "apple-music": "applemusic",
  itunes: "applemusic",
  mail: "email",
  "e-mail": "email",
  web: "website",
  site: "website",
  url: "website",
  homepage: "website",
  fb: "facebook",
  ig: "instagram",
  yt: "youtube",
}

export function canonicalSocialPlatform(platform: string | null | undefined): string {
  const key = String(platform ?? "").trim().toLowerCase()
  return SOCIAL_PLATFORM_ALIASES[key] ?? key
}

/**
 * WHERE A HANDLE LIVES, FOR THE PLATFORMS THAT HAVE HANDLES.
 *
 * Spotify is here for the links already saved as `@something`, which have
 * always been sent to an artist page; the editor no longer accepts a Spotify
 * handle, because Spotify has none and nobody types an artist id. Apple Music
 * is not here at all: an artist page is /artist/<name>/<id>, so there is no
 * address a handle could be turned into that would not be a guess, and the
 * editor asks for the link instead. A website has no handle either; it only
 * gets the https:// it was typed without, further down.
 */
const SOCIAL_PROFILE_BASE: Record<string, string> = {
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
  calendly: "https://calendly.com/",
}

/**
 * A WHATSAPP NUMBER IS DIGITS ONLY.
 *
 * wa.me takes the number in international form with nothing else in it: no
 * plus, no spaces, no brackets. People type "+44 7700 900123", so that is
 * what is accepted, and the digits are what goes in the address. It used to
 * be pasted in as typed, plus and all, which WhatsApp does not open.
 */
const PHONE_LIKE = /^\+?[\d\s().-]{6,}$/

/** Whether a bare `@name` means something on this platform (WhatsApp takes a number instead). */
export function hasSocialHandles(platform: string): boolean {
  const key = canonicalSocialPlatform(platform)
  return key !== "whatsapp" && key in SOCIAL_PROFILE_BASE
}

/**
 * The profile address for a handle, or null when the value is not a handle
 * or the platform has no handles.
 *
 * A handle is `@name`, or a bare name with nothing in it that belongs to an
 * address (no slash, dot or colon). `mara.studio` is therefore read as a
 * domain, which is why the editor's hint asks for the @.
 */
export function socialHandleUrl(platform: string, value: string): string | null {
  const key = canonicalSocialPlatform(platform)
  const typed = value.trim()
  if (!typed) return null

  if (key === "whatsapp") {
    const digits = PHONE_LIKE.test(typed) ? typed.replace(/\D/g, "") : ""
    return digits.length >= 6 ? SOCIAL_PROFILE_BASE.whatsapp + digits : null
  }

  const base = SOCIAL_PROFILE_BASE[key]
  if (!base) return null
  if (typed.startsWith("@")) {
    const handle = typed.slice(1).trim()
    return handle ? base + handle : null
  }
  if (!typed.includes("/") && !typed.includes(".") && !typed.includes(":")) return base + typed
  return null
}

/**
 * Normalizes a social media URL/handle to a full URL.
 * Handles @username, plain usernames, and partial URLs.
 */
export function normalizeSocialUrl(platform: string, url: string): string {
  if (!url) return url
  const typed = url.trim()
  const key = canonicalSocialPlatform(platform)

  // Already a full URL
  if (typed.startsWith('http://') || typed.startsWith('https://') || typed.startsWith('mailto:')) {
    return typed
  }

  // Handle email separately
  if (key === 'email') {
    if (typed.includes('@')) return `mailto:${typed}`
    return typed
  }

  // @username, a plain username, or a WhatsApp number
  const profile = socialHandleUrl(key, typed)
  if (profile) return profile

  // A website, or anything with dots/slashes but no protocol: a full URL missing https://
  if (!typed.startsWith('http')) {
    return 'https://' + typed.replace(/^\/\//, '')
  }

  return typed
}
