import { toPublicHttpUrl } from "@/lib/url/public-url"

/**
 * ===========================================================================
 *  THE SOCIAL PLATFORMS, IN ONE PLACE
 * ===========================================================================
 * There were three lists. The edit-profile dialog had five platforms with
 * per-platform placeholder text, `components/store-builder/social-media-icons`
 * had its own five with the icon components, and the API route had a third
 * five it validated against. Adding one meant finding all three, and missing
 * one meant a field a creator could fill in that never appeared, or an icon on
 * the page with nothing behind it. The `enabled` flag that used to be a fourth
 * source of truth was removed for exactly this reason.
 *
 * So: the order, the labels and the handle rules live here, the marks live in
 * components/social/platform-icons.tsx keyed by the same union, and everything
 * else imports one of the two.
 *
 * This file is deliberately free of JSX so the API route can import it.
 */

export const SOCIAL_PLATFORM_KEYS = [
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "twitter",
  "twitch",
  // Spotify is not offered any more — see LEGACY_SOCIAL_PLATFORM_KEYS.
  "spotify",
] as const

export type SocialPlatformKey = (typeof SOCIAL_PLATFORM_KEYS)[number]

/**
 * Offered in the editor, in this order, which is the order they appear on the
 * page.
 */
export const OFFERED_SOCIAL_PLATFORM_KEYS = [
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "twitter",
  "twitch",
] as const satisfies readonly SocialPlatformKey[]

/**
 * Still stored, still rendered, no longer offered.
 *
 * Spotify was on the list and is not on the new one. Dropping it outright
 * would strand every creator who has already saved one: the link would keep
 * showing on their page with no field anywhere to change or clear it. So the
 * editor shows a legacy platform only when it already has a value — nobody new
 * is offered it, and nobody existing is stuck with it.
 */
export const LEGACY_SOCIAL_PLATFORM_KEYS = ["spotify"] as const satisfies readonly SocialPlatformKey[]

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatformKey, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  twitch: "Twitch",
  spotify: "Spotify",
}

/** Where a bare handle turns into a profile. */
const PROFILE_URL: Record<SocialPlatformKey, (handle: string) => string> = {
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  twitch: (h) => `https://www.twitch.tv/${h}`,
  spotify: (h) => `https://open.spotify.com/user/${h}`,
}

const MAX_URL = 300

/**
 * A field that says "Username or URL" and accepts one of them is a lie, and it
 * was one.
 *
 * The old rule prefixed `https://` onto anything without a scheme and then
 * required a dot in the hostname. So `andrew.rullz` — a perfectly ordinary
 * Instagram handle, and the exact one in the report — became
 * `https://andrew.rullz/`, a link to a domain that does not exist, saved
 * without complaint. And `andrewrullz`, with no dot, was rejected silently:
 * the field simply emptied itself on save with nothing said.
 *
 * A handle is now recognised as a handle — no scheme, no slash, no space — and
 * turned into that platform's profile URL. Anything with a slash or a scheme
 * is treated as a URL, as before.
 *
 * The protocol allowlist is unchanged and still the point of the function:
 * `javascript:` and `data:` end up in an href on a public page. They carry a
 * scheme, so they never reach the handle branch, and the branch they do reach
 * refuses them by name rather than by accident. (It used to survive on the
 * accident that "alert(1)" is an invalid port.)
 */
export function resolveSocialInput(key: SocialPlatformKey, raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > MAX_URL) return null

  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (scheme && scheme !== "http" && scheme !== "https") return null

  if (!scheme && !value.includes("/") && !/\s/.test(value)) {
    const handle = value.replace(/^@+/, "")
    // The characters every one of these platforms allows in a handle, and
    // nothing that could reshape the URL it is pasted into.
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return null
    return PROFILE_URL[key](handle)
  }

  return toPublicHttpUrl(value, MAX_URL)
}
