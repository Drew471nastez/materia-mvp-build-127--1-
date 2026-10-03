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
 * somebody typing it meant.
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
  { key: "social_snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/username" },
  { key: "social_bluesky", label: "Bluesky", placeholder: "https://bsky.app/profile/name" },
  { key: "social_whatsapp", label: "WhatsApp", placeholder: "https://wa.me/15551234567" },
  { key: "social_discord", label: "Discord", placeholder: "https://discord.gg/invite" },
  { key: "social_twitch", label: "Twitch", placeholder: "https://twitch.tv/channel" },
  { key: "social_github", label: "GitHub", placeholder: "https://github.com/name" },
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
    const url = socialUrl(overrides[p.key]) || socialUrl(theme[p.key])
    if (url) out.push({ key: p.key, label: p.label, url })
  }
  return out
}
