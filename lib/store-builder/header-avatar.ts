/**
 * ===========================================================================
 *  WHICH PICTURE THE PROFILE HEADER DRAWS, AND AT WHAT SIZE
 * ===========================================================================
 * One expression, in one place, because two things need the answer and they
 * have to agree EXACTLY.
 *
 * The header renders the avatar through Radix's Avatar, and Radix loads it
 * with a detached `new Image()` inside an effect — so the request cannot
 * start until the bundle has downloaded, parsed and hydrated. On a phone on
 * mobile data that is most of a second of an empty circle before the download
 * even begins, which is "sometimes it takes some time to load the profile
 * avatar".
 *
 * A `<link rel="preload" as="image">` in the server-rendered HTML fixes that:
 * the browser's preload scanner finds it in the first bytes and the picture is
 * usually already in cache by the time Radix asks for it. But a preload only
 * helps if its URL is CHARACTER-FOR-CHARACTER the one that is later requested.
 * A different `w=`, a different fallback, and the page downloads the avatar
 * twice and shows it no sooner.
 *
 * So the page does not recompute it. It calls this, and so does the renderer.
 */
import { avatarSizeMap } from "./defaults"
/* The type is types.ts's; defaults.ts only imports it. */
import type { AvatarSizeChoice } from "./types"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

export interface HeaderAvatarSettings {
  /**
   * `""` is a real value and does not mean "absent": it means the creator
   * cleared the picture and wants their initials. `undefined` means nothing
   * was ever stored here, so the profile row decides.
   */
  avatarUrl?: string
  avatarSizeChoice?: AvatarSizeChoice
  mobileAvatarSizeChoice?: AvatarSizeChoice
}

/**
 * @param isMobile The BUILDER's explicit phone preview, not a viewport. The
 *   live page never sets it, which is what makes the preload's URL knowable on
 *   the server at all.
 */
export function headerAvatar(
  settings: HeaderAvatarSettings | undefined,
  profileAvatarUrl: string | null | undefined,
  isMobile?: boolean,
): { url?: string; size: number } {
  const choice = (isMobile ? settings?.mobileAvatarSizeChoice || "medium" : settings?.avatarSizeChoice || "medium") as AvatarSizeChoice
  const size = avatarSizeMap[choice] ?? avatarSizeMap.medium

  const source =
    settings?.avatarUrl === ""
      ? undefined
      : settings?.avatarUrl !== undefined
        ? settings.avatarUrl
        : profileAvatarUrl || undefined

  return { url: source ? optimizedImageUrl(source, size) : undefined, size }
}
