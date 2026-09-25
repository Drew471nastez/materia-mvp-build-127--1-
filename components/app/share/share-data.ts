/**
 * ===========================================================================
 *  SHARING A STORELIB ADDRESS: THE PLATFORMS, THE STEPS, THE SHARE LINKS
 * ===========================================================================
 * Everything the share sheet (./share-storelib.tsx) says and links to, kept
 * free of JSX so the home page's server component can use it to work out
 * which platforms a creator has connected before the page is sent.
 *
 * Two lists, for two different jobs:
 *
 *   BIO PLATFORMS   the places a creator puts their link in their own bio.
 *                   Tapping one opens a short how to, because the question
 *                   people have is not "how do I post this" but "where does
 *                   the link go on my profile".
 *   SHARE TARGETS   the places a creator posts the link. Each is the
 *                   platform's own share address with the link filled in.
 */

import { normalizeSocialUrl } from "@/lib/onepage/types"
import { resolveSocialInput, type SocialPlatformKey } from "@/lib/social/platforms"

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
  creator: "Your page with everything you sell",
  onepage: "Your link in bio page",
  website: "The website you published",
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

/** Shown when a creator has connected none, so the how tos are still one tap away. */
export const DEFAULT_BIO_PLATFORMS: readonly BioPlatform[] = ["instagram", "tiktok", "youtube"]

export interface BioHowTo {
  name: string
  /** The platform's own address, opened when the creator has not connected a profile. */
  home: string
  /** A condition the platform puts on bio links, said once, before the steps. */
  needs?: { text: string; link?: { label: string; href: string } }
  /** A button's own name is between ** marks, drawn bold so the eye finds it on the screen. */
  steps: readonly string[]
  /** One line after the steps, for the case that trips people up. */
  note?: string
}

/*
  THE STEPS, WRITTEN FOR A PHONE. Each is the button's own name as the app
  shows it, in the order a person meets them. Where the apps have moved a
  field between versions the note says so, rather than a step that is right
  for only half of the people reading it.
*/
export const BIO_HOW_TO: Record<BioPlatform, BioHowTo> = {
  instagram: {
    name: "Instagram",
    home: "https://www.instagram.com/",
    steps: [
      "Open your profile in the Instagram app",
      "Tap **Edit profile**",
      "Tap **Links**, then **Add external link**",
      "Paste your link and tap **Done**",
      "Tap the link in your bio to check it opens",
    ],
    note: "On some versions the field is called **Website** instead of **Links**. Use whichever you see.",
  },
  tiktok: {
    name: "TikTok",
    home: "https://www.tiktok.com/",
    needs: {
      text: "TikTok shows a website link once you have 1,000 followers or a Business account.",
      link: {
        label: "About Business accounts",
        href: "https://ads.tiktok.com/help/article/about-business-registration?lang=en",
      },
    },
    steps: [
      "In the TikTok app, tap **Profile**",
      "Tap **Edit profile**",
      "Next to **Links**, tap **Add**",
      "Paste your link and save",
      "Tap the link in your bio to check it opens",
    ],
  },
  youtube: {
    name: "YouTube",
    home: "https://www.youtube.com/",
    steps: [
      "Open YouTube and go to **Your channel**",
      "Tap the pencil to edit your channel",
      "Under **Links**, tap **Add link**",
      "Give it a title, paste your link and save",
      "Check the link under your channel name",
    ],
  },
  twitter: {
    name: "X",
    home: "https://x.com/",
    steps: [
      "Go to your profile on X",
      "Tap **Edit profile**",
      "Paste your link in the **Website** field",
      "Tap **Save**",
      "Tap the link on your profile to check it opens",
    ],
  },
  facebook: {
    name: "Facebook",
    home: "https://www.facebook.com/",
    steps: [
      "Go to your profile on Facebook",
      "Tap **Edit profile**",
      "Find **Links** and tap **Add**",
      "Paste your link and save",
      "Check the link on your profile",
    ],
  },
  threads: {
    name: "Threads",
    home: "https://www.threads.net/",
    steps: [
      "Go to your profile in the Threads app",
      "Tap **Edit profile**",
      "Tap **Links** and add your link",
      "Tap **Done**",
      "Tap the link on your profile to check it opens",
    ],
  },
  linkedin: {
    name: "LinkedIn",
    home: "https://www.linkedin.com/",
    steps: [
      "Go to your profile on LinkedIn",
      "Tap the pencil next to your name",
      "Scroll to **Website** and paste your link",
      "Add a short link name and save",
      "Check the link under your headline",
    ],
  },
  pinterest: {
    name: "Pinterest",
    home: "https://www.pinterest.com/",
    steps: [
      "Go to your profile on Pinterest",
      "Tap **Edit profile**",
      "Paste your link in the **Website** field",
      "Tap **Done**",
      "Check the link on your profile",
    ],
  },
  twitch: {
    name: "Twitch",
    home: "https://www.twitch.tv/",
    steps: [
      "Open Twitch and go to your channel settings",
      "Find **Social links**",
      "Add a title and paste your link",
      "Tap **Add**, then save",
      "Check the link in your About section",
    ],
  },
  snapchat: {
    name: "Snapchat",
    home: "https://www.snapchat.com/",
    needs: { text: "Snapchat shows a website link on a Public Profile." },
    steps: [
      "Open your **Public Profile** in Snapchat",
      "Tap **Edit profile**",
      "Tap **Website** and paste your link",
      "Tap **Save**",
      "Check the link on your profile",
    ],
  },
}

/** A bio platform the creator has, with their own profile address when known. */
export interface ConnectedPlatform {
  key: BioPlatform
  /** Their profile, opened by "Open Instagram". Null opens the platform itself. */
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

export type ShareTarget =
  | "facebook"
  | "x"
  | "whatsapp"
  | "threads"
  | "pinterest"
  | "linkedin"
  | "telegram"
  | "reddit"
  | "email"

export const SHARE_TARGETS: readonly { key: ShareTarget; label: string }[] = [
  { key: "facebook", label: "Facebook" },
  { key: "x", label: "X" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "threads", label: "Threads" },
  { key: "pinterest", label: "Pinterest" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "telegram", label: "Telegram" },
  { key: "reddit", label: "Reddit" },
  { key: "email", label: "Email" },
]

/** Each platform's own share address, with the link filled in and nothing else added. */
export function shareTargetUrl(target: ShareTarget, url: string): string {
  const u = encodeURIComponent(url)
  switch (target) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`
    case "x":
      return `https://x.com/intent/tweet?url=${u}`
    case "whatsapp":
      return `https://wa.me/?text=${u}`
    case "threads":
      return `https://www.threads.net/intent/post?text=${u}`
    case "pinterest":
      return `https://www.pinterest.com/pin/create/button/?url=${u}`
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`
    case "telegram":
      return `https://t.me/share/url?url=${u}`
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}`
    case "email":
      return `mailto:?body=${u}`
  }
}
