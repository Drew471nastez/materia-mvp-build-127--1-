/**
 * ===========================================================================
 *  THE STORE'S SOCIAL LINKS, ONE LIST
 * ===========================================================================
 * Theme settings › Social holds one address per platform. The footer and the
 * header draw them as icons (components/website-builder/theme/ThemeSocials),
 * and the theme's `shop` object lists them for section code
 * (lib/storelib-theme/globals). All three read this list, so a platform
 * added here reaches every place at once.
 *
 * ONLY AN ADDRESS A VISITOR CAN OPEN. A field that says `javascript:` or
 * anything else that is not http(s) is left out rather than drawn as a link.
 * A bare `instagram.com/name` is given its https, since that is what
 * somebody typing it meant. Email is the one exception: an address, with or
 * without `mailto:`, becomes a `mailto:` link and nothing else does.
 */

export const SOCIAL_PLATFORMS = [
  { key: "social_instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { key: "social_tiktok", label: "TikTok", placeholder: "https://tiktok.com/@username" },
  { key: "social_youtube", label: "YouTube", placeholder: "https://youtube.com/@channel" },
  { key: "social_twitter", label: "X", placeholder: "https://x.com/username" },
  { key: "social_facebook", label: "Facebook", placeholder: "https://facebook.com/page" },
  { key: "social_linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/name" },
  { key: "social_pinterest", label: "Pinterest", placeholder: "https://pinterest.com/username" },
  { key: "social_threads", label: "Threads", placeholder: "https://threads.net/@username" },
  { key: "social_spotify", label: "Spotify", placeholder: "https://open.spotify.com/artist/id" },
  { key: "social_soundcloud", label: "SoundCloud", placeholder: "https://soundcloud.com/name" },
  { key: "social_snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/username" },
  { key: "social_bluesky", label: "Bluesky", placeholder: "https://bsky.app/profile/name" },
  { key: "social_whatsapp", label: "WhatsApp", placeholder: "https://wa.me/15551234567" },
  { key: "social_discord", label: "Discord", placeholder: "https://discord.gg/invite" },
  { key: "social_twitch", label: "Twitch", placeholder: "https://twitch.tv/channel" },
  { key: "social_github", label: "GitHub", placeholder: "https://github.com/name" },
  /* Not a network, but where a visitor looks for the same thing: the creator's own site and inbox. */
  { key: "social_website", label: "Website", placeholder: "https://example.com" },
  { key: "social_email", label: "Email", placeholder: "hello@example.com" },
] as const

export type SocialKey = (typeof SOCIAL_PLATFORMS)[number]["key"]

export interface SocialLink {
  key: SocialKey
  label: string
  url: string
}

/** An address a visitor can open, or "" when it is not one. */
export function socialUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw || /\s/.test(raw)) return ""
  if (/^https?:\/\//i.test(raw)) return raw
  /* A scheme of any other kind (javascript:, data:, mailto:) is not a profile. */
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return ""
  if (raw.startsWith("//")) return `https:${raw}`
  /* "instagram.com/name": a host with a dot in it, then a path or nothing. */
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(raw)) return `https://${raw}`
  return ""
}

const EMAIL = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[a-z]{2,}$/i

/**
 * The Email field's link: `mailto:` and the address, whether it was typed
 * with the scheme or without. Anything that is not one address is "".
 */
export function socialEmailUrl(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().replace(/^mailto:/i, "") : ""
  return EMAIL.test(raw) ? `mailto:${raw}` : ""
}

/** The link for one platform's field: an email address for Email, a web address for the rest. */
export function socialHref(key: string, value: unknown): string {
  return key === "social_email" ? socialEmailUrl(value) : socialUrl(value)
}

/**
 * The links to draw, in the platforms' order. `overrides` is a section's own
 * fields with the same keys (the footer has five), and a link typed there
 * wins over the theme's for its platform.
 */
export function socialLinks(
  theme: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): SocialLink[] {
  const out: SocialLink[] = []
  for (const p of SOCIAL_PLATFORMS) {
    const url = socialHref(p.key, overrides[p.key]) || socialHref(p.key, theme[p.key])
    if (url) out.push({ key: p.key, label: p.label, url })
  }
  return out
}

/**
 * A HANDLE IS ENOUGH. What a person knows about their own account is
 * usually "@name", not the address of its profile page. Typed into a
 * platform's field, a handle becomes that platform's profile address; an
 * address, or anything for a platform with no handle (Spotify, Discord,
 * WhatsApp, a website), is left as it was typed.
 */
const PROFILE_BY_HANDLE: Partial<Record<SocialKey, (h: string) => string>> = {
  social_instagram: (h) => `https://instagram.com/${h}`,
  social_tiktok: (h) => `https://tiktok.com/@${h}`,
  social_youtube: (h) => `https://youtube.com/@${h}`,
  social_twitter: (h) => `https://x.com/${h}`,
  social_facebook: (h) => `https://facebook.com/${h}`,
  social_linkedin: (h) => `https://linkedin.com/in/${h}`,
  social_pinterest: (h) => `https://pinterest.com/${h}`,
  social_threads: (h) => `https://threads.net/@${h}`,
  social_soundcloud: (h) => `https://soundcloud.com/${h}`,
  social_snapchat: (h) => `https://snapchat.com/add/${h}`,
  social_bluesky: (h) => `https://bsky.app/profile/${h}`,
  social_twitch: (h) => `https://twitch.tv/${h}`,
  social_github: (h) => `https://github.com/${h}`,
}

/** Whether a platform's field takes a handle. */
export function takesHandle(key: string): boolean {
  return key in PROFILE_BY_HANDLE
}

/** What is saved for what was typed: a handle made into its profile address, anything else as typed. */
export function socialFromInput(key: string, typed: string): string {
  const raw = (typed ?? "").trim()
  const make = PROFILE_BY_HANDLE[key as SocialKey]
  if (!make) return raw
  /* "@name" or "name": letters, digits, dots, underscores and dashes, nothing that reads as an address. */
  const m = /^@?([a-z0-9._-]{1,60})$/i.exec(raw)
  if (m && !/\.[a-z]{2,}$/i.test(m[1])) return make(m[1])
  return raw
}
