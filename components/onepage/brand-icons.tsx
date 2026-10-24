/**
 * ===========================================================================
 *  EVERY MARK THE ONEPAGE DRAWS, FROM ONE PLACE
 * ===========================================================================
 * THERE WERE FOUR COPIES AND THEY DISAGREED.
 *
 * The links tab, the phone preview, the published page and the design tab
 * each pasted their own SVG paths for the social icons. The editor offered 22
 * platforms; the published page knew 11 and quietly returned nothing for the
 * rest, so a creator who added WhatsApp, Discord or a website saw it in the
 * editor, saw a globe standing in for it in the preview, and found nothing at
 * all on the page visitors open. Some of the drawings were not the brand
 * either: Snapchat was an outlined ghost, Telegram a generic paper plane,
 * Patreon its retired mark, and Discord and Calendly painted their own brand
 * colours over whatever colour the theme asked for.
 *
 * `SocialIcon` and `LinkIcon` are now the only way those three surfaces get a
 * mark. Each surface keeps its own sizes, circles and borders; only where the
 * picture comes from moved here.
 *
 * THE MARKS ARE SIMPLE ICONS, THROUGH react-icons/si, which is the set each
 * brand publishes its own silhouette to (see components/social/platform-icons
 * .tsx for the longer version of that argument). A website and an email have
 * no brand, so they are lucide's globe and envelope at the same stroke the
 * link icons use.
 *
 * COLOUR COMES FROM THE CALLER. Every mark draws in the colour it is handed,
 * `currentColor` by default, so the page's social colour setting, a button's
 * text colour and the editor's white-on-brand tiles all just work. The only
 * brand colour in this file is the question of which of black or white reads
 * on one (`markOn`), for the editor tiles that are brand coloured on purpose.
 *
 * No "use client" line: nothing here holds state, every importer is already a
 * client component, and a server file importing the platform list should get
 * the list rather than a client reference to it.
 */

import type React from "react"
import type { IconType } from "react-icons"
import { FaLinkedin } from "react-icons/fa6"
import {
  SiApplemusic,
  SiCalendly,
  SiDiscord,
  SiFacebook,
  SiGithub,
  SiInstagram,
  SiKick,
  SiNotion,
  SiPatreon,
  SiPinterest,
  SiReddit,
  SiSnapchat,
  SiSoundcloud,
  SiSpotify,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiTwitch,
  SiVimeo,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "react-icons/si"
import { Globe, Link as LinkGlyph, Mail, type LucideIcon } from "lucide-react"

import { canonicalSocialPlatform } from "@/lib/onepage/social-url"
import { LINK_LINE_ICONS, isLinkBrandIcon, linkIconKey, type LinkBrandIcon } from "./link-icons"

/** The platforms the editor offers for the social row, in the editor's order. */
export const ONEPAGE_SOCIAL_PLATFORMS = [
  { key: "threads", label: "Threads" },
  { key: "email", label: "Email" },
  { key: "facebook", label: "Facebook" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "X" },
  { key: "tiktok", label: "TikTok" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "snapchat", label: "Snapchat" },
  { key: "instagram", label: "Instagram" },
  { key: "discord", label: "Discord" },
  { key: "github", label: "GitHub" },
  { key: "kick", label: "Kick" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "patreon", label: "Patreon" },
  { key: "pinterest", label: "Pinterest" },
  { key: "soundcloud", label: "SoundCloud" },
  { key: "spotify", label: "Spotify" },
  { key: "applemusic", label: "Apple Music" },
  { key: "telegram", label: "Telegram" },
  { key: "twitch", label: "Twitch" },
  { key: "website", label: "Website" },
  { key: "calendly", label: "Calendly" },
] as const

export type OnePageSocialPlatform = (typeof ONEPAGE_SOCIAL_PLATFORMS)[number]["key"]

export const ONEPAGE_SOCIAL_PLATFORM_KEYS: readonly OnePageSocialPlatform[] = ONEPAGE_SOCIAL_PLATFORMS.map((p) => p.key)

const LABELS = new Map<string, string>(ONEPAGE_SOCIAL_PLATFORMS.map((p) => [p.key, p.label]))

/** A platform's name as a person reads it, whatever spelling the data used. */
export function socialPlatformLabel(platform: string): string {
  const key = canonicalSocialPlatform(platform)
  return LABELS.get(key) ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Link")
}

type Drawing = { brand: IconType } | { line: LucideIcon }

const SOCIAL_MARKS: Record<OnePageSocialPlatform, Drawing> = {
  threads: { brand: SiThreads },
  email: { line: Mail },
  facebook: { brand: SiFacebook },
  youtube: { brand: SiYoutube },
  twitter: { brand: SiX },
  tiktok: { brand: SiTiktok },
  whatsapp: { brand: SiWhatsapp },
  snapchat: { brand: SiSnapchat },
  instagram: { brand: SiInstagram },
  discord: { brand: SiDiscord },
  github: { brand: SiGithub },
  kick: { brand: SiKick },
  linkedin: { brand: FaLinkedin },
  patreon: { brand: SiPatreon },
  pinterest: { brand: SiPinterest },
  soundcloud: { brand: SiSoundcloud },
  spotify: { brand: SiSpotify },
  applemusic: { brand: SiApplemusic },
  telegram: { brand: SiTelegram },
  twitch: { brand: SiTwitch },
  website: { line: Globe },
  calendly: { brand: SiCalendly },
}

/** The same marks under the names link buttons were saved with, plus three that are not social platforms. */
const LINK_BRAND_MARKS: Record<LinkBrandIcon, IconType> = {
  instagram: SiInstagram,
  twitter: SiX,
  youtube: SiYoutube,
  tiktok: SiTiktok,
  spotify: SiSpotify,
  facebook: SiFacebook,
  linkedin: FaLinkedin,
  twitch: SiTwitch,
  discord: SiDiscord,
  telegram: SiTelegram,
  whatsapp: SiWhatsapp,
  pinterest: SiPinterest,
  snapchat: SiSnapchat,
  reddit: SiReddit,
  threads: SiThreads,
  github: SiGithub,
  "apple-music": SiApplemusic,
  notion: SiNotion,
  vimeo: SiVimeo,
}

type SvgProps = {
  size?: number | string
  color?: string
  className?: string
  style?: React.CSSProperties
  role?: string
  "aria-label"?: string
  "aria-hidden"?: boolean
  focusable?: "false"
  "data-mark"?: string
}

/**
 * The cast is the react-icons v5 / React 19 typing mismatch described in
 * components/social/platform-icons.tsx: `IconType` returns React 18's global
 * JSX.Element, so TypeScript refuses it as a component although it renders.
 *
 * `currentColor` is not passed on. react-icons writes `color` into an inline
 * style, and an inline `color: currentColor` beats a caller's `text-gray-500`
 * class, which is how the editor colours its marks. Leaving it out lets the
 * mark inherit exactly as a lucide icon does.
 */
function BrandSvg({ Icon, color, ...rest }: SvgProps & { Icon: IconType }) {
  const Svg = Icon as unknown as React.ComponentType<SvgProps>
  return <Svg color={color && color !== "currentColor" ? color : undefined} {...rest} />
}

/** A mark next to its own visible name is decoration; one on its own is the link's name. */
function labelled(title: string | undefined): Pick<SvgProps, "role" | "aria-label" | "aria-hidden" | "focusable"> {
  return title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: "false" }
}

export type SocialIconProps = {
  platform: string
  size?: number | string
  color?: string
  /** For the two line marks (website, email) and the fallback. */
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
  /** Give it when the mark stands alone, as in the social row, so the link has a name. */
  title?: string
}

/**
 * A social platform's mark. Every spelling in lib/onepage/social-url.ts
 * resolves first; a name nobody knows draws a plain link glyph rather than
 * nothing, so a saved link can never vanish from the page because its icon
 * was missing.
 */
export function SocialIcon({ platform, size = 20, color = "currentColor", strokeWidth = 2, className, style, title }: SocialIconProps) {
  const key = canonicalSocialPlatform(platform)
  const a11y = labelled(title)
  const drawing: Drawing | undefined =
    SOCIAL_MARKS[key as OnePageSocialPlatform] ?? (isLinkBrandIcon(key) ? { brand: LINK_BRAND_MARKS[key] } : undefined)

  if (drawing && "brand" in drawing) {
    return <BrandSvg Icon={drawing.brand} size={size} color={color} className={className} style={style} data-mark={key} {...a11y} />
  }
  const Line = drawing && "line" in drawing ? drawing.line : LinkGlyph
  return (
    <Line
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      data-mark={drawing ? key : "fallback"}
      {...a11y}
    />
  )
}

export type LinkIconProps = {
  name: string | null | undefined
  /** Leave it out to size the icon with a class. */
  size?: number | string
  color?: string
  strokeWidth?: number | string
  className?: string
  style?: React.CSSProperties
}

/** Whether `LinkIcon` draws anything for this name. */
export function hasLinkIcon(name: string | null | undefined): boolean {
  return linkIconKey(name) !== null
}

/**
 * A link button's icon: a line icon from ./link-icons.ts drawn with a round
 * stroke, or a brand's solid mark. Null for a name that is not in the set, so
 * a caller can keep asking `hasLinkIcon` before it lays out room for one.
 */
export function LinkIcon({ name, size, color = "currentColor", strokeWidth = 2, className, style }: LinkIconProps) {
  const key = linkIconKey(name)
  if (!key) return null
  if (isLinkBrandIcon(key)) {
    return (
      <BrandSvg
        Icon={LINK_BRAND_MARKS[key]}
        size={size}
        color={color}
        className={className}
        style={style}
        data-mark={key}
        aria-hidden
        focusable="false"
      />
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      data-mark={key}
      aria-hidden
      focusable="false"
    >
      <path d={LINK_LINE_ICONS[key]} />
    </svg>
  )
}

/**
 * BLACK OR WHITE, WHICHEVER READS ON A BRAND COLOUR.
 *
 * The editor draws each platform as a white mark in a circle of its brand
 * colour. On Snapchat's yellow and Kick's green a white mark is barely there,
 * so on a colour that light the mark is black, which is what both brands do
 * themselves. The threshold is a relative luminance of 0.6: high enough that
 * WhatsApp and Spotify keep their white marks.
 */
export function markOn(background: string | null | undefined): string {
  const hex = (background ?? "").replace("#", "")
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff"
  const linear = [0, 2, 4].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  return luminance > 0.6 ? "#000000" : "#ffffff"
}
