/**
 * ===========================================================================
 *  SHARING A STORELIB ADDRESS
 * ===========================================================================
 * What the share pill and its panel (./share-storelib.tsx) show, kept free
 * of JSX so a server component can build it before the page is sent: the
 * creator page, the OnePage and the website, each with the one line that
 * says what it opens.
 *
 * connectedBioPlatforms reads the bio platforms a creator has connected from
 * the creator page and the OnePage. The panel no longer draws a how to for
 * each platform or a row of share links (see the top of ./share-storelib.tsx
 * for why), so their words and addresses went with them.
 */

import { normalizeSocialUrl } from "@/lib/onepage/types"
import { resolveSocialInput, type SocialPlatformKey } from "@/lib/social/platforms"
import { tt } from "@/lib/i18n/text"

export type ShareSurface = "creator" | "onepage" | "website"

export interface ShareAddress {
  surface: ShareSurface
  /** What the segmented control calls it. */
  label: string
  /** Always absolute: what is copied, encoded in the QR code and handed to a share link. */
  url: string
  /** The address without https://, as a person would type it. */
  display: string
  /**
   * False while nothing answers at the address yet: a OnePage that has not
   * been published. It is still offered, so the creator can find it, with a
   * line saying it opens once published. Missing means live.
   */
  live?: boolean
}

/**
 * One line under the address saying what each one opens, because "Creator
 * page", "OnePage" and "Website" are three names for three different things
 * and the switch between them said nothing about which is which.
 */
export const SURFACE_HINT: Record<ShareSurface, string> = {
  get creator() { return tt("Your page with everything you sell") },
  get onepage() { return tt("Your link in bio page") },
  get website() { return tt("The website you published") },
}

export type BioPlatform =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "facebook"
  | "threads"
  | "linkedin"
  | "pinterest"
  | "twitch"
  | "snapchat"

/** The order they appear in, which is roughly how often creators use them. */
export const BIO_PLATFORMS: readonly BioPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "threads",
  "linkedin",
  "pinterest",
  "twitch",
  "snapchat",
]

/** A bio platform the creator has, with their own profile address when known. */
export interface ConnectedPlatform {
  key: BioPlatform
  /** Their own profile address, or null when only the platform is known. */
  profileUrl: string | null
}

/** Only http and https ever reach an href: a saved value is the creator's own text. */
function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

const CREATOR_PAGE_KEY: Partial<Record<BioPlatform, SocialPlatformKey>> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  twitter: "twitter",
  facebook: "facebook",
  linkedin: "linkedin",
  twitch: "twitch",
}

/**
 * The platforms a creator has connected, from the two places Storelib keeps
 * them: the creator page's header (store_builder_configs, keyed like
 * lib/social/platforms) and the OnePage's social_links, whose older rows
 * still carry instagram, tiktok and youtube as their own columns. The creator
 * page wins where both have one, because it is the one Settings edits.
 */
export function connectedBioPlatforms(input: {
  creatorPage?: Record<string, { url?: string | null } | null | undefined> | null
  onePage?: Record<string, string | null | undefined> | null
}): ConnectedPlatform[] {
  const out: ConnectedPlatform[] = []
  for (const key of BIO_PLATFORMS) {
    const pageKey = CREATOR_PAGE_KEY[key]
    const fromPage = pageKey ? resolveSocialInput(pageKey, input.creatorPage?.[pageKey]?.url ?? null) : null
    const raw = input.onePage?.[key]?.trim()
    const fromOnePage = raw ? safeHttpUrl(normalizeSocialUrl(key, raw)) : null
    const profileUrl = safeHttpUrl(fromPage) ?? fromOnePage
    if (profileUrl) out.push({ key, profileUrl })
  }
  return out
}
