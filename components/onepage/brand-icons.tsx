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
 * COLOUR COMES FROM THE CALLER, unless the caller asks for the brand's.
 * Every mark draws in the colour it is handed, `currentColor` by default, so
 * the page's social colour setting and a button's text colour just work.
 * `tone="brand"` (round 11: "make them colorful, use their actual icons")
 * draws each mark in its own colour instead (BRAND_COLORS): Instagram's
 * gradient, YouTube's red, Spotify's green. A brand whose mark is black (X,
 * Threads, TikTok, GitHub) keeps the caller's colour, so it still reads on a
 * dark page; a brand whose colour is too light to see on white (Snapchat's
 * yellow) keeps a hairline of black around it, as Snapchat draws it.
 *
 * No "use client" line: nothing here holds state, every importer is already a
 * client component, and a server file importing the platform list should get
 * the list rather than a client reference to it.
 */

import type React from "react"
import { useId } from "react"
import type { IconType } from "react-icons"
import { FaLinkedin } from "react-icons/fa6"
import {
  SiAmazon,
  SiApplemusic,
  SiApplepodcasts,
  SiBandcamp,
  SiBluesky,
  SiBuymeacoffee,
  SiCashapp,
  SiEtsy,
  SiGoogleforms,
  SiGooglecalendar,
  SiGumroad,
  SiKofi,
  SiLoom,
  SiMixcloud,
  SiPaypal,
  SiSubstack,
  SiTypeform,
  SiVenmo,
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
import { SiBrevo, SiCaldotcom, SiGoogleanalytics, SiGooglesheets, SiKit, SiMailchimp, SiMake, SiMeta, SiZapier } from "react-icons/si"
import { SiAppstore, SiAudiomack, SiGoogleplay, SiRss } from "react-icons/si"
import { Globe, Link as LinkGlyph, Mail, Webhook, type LucideIcon } from "lucide-react"

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

/** The same marks under the names link buttons were saved with, plus the brands a link or an embed can be (round 11). */
const LINK_BRAND_MARKS: Record<LinkBrandIcon, IconType> = {
  amazon: SiAmazon,
  etsy: SiEtsy,
  kofi: SiKofi,
  buymeacoffee: SiBuymeacoffee,
  paypal: SiPaypal,
  cashapp: SiCashapp,
  venmo: SiVenmo,
  bluesky: SiBluesky,
  substack: SiSubstack,
  patreon: SiPatreon,
  kick: SiKick,
  soundcloud: SiSoundcloud,
  bandcamp: SiBandcamp,
  "apple-podcasts": SiApplepodcasts,
  gumroad: SiGumroad,
  calendly: SiCalendly,
  loom: SiLoom,
  typeform: SiTypeform,
  "google-forms": SiGoogleforms,
  "google-calendar": SiGooglecalendar,
  mixcloud: SiMixcloud,
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

/* ─── Brand colours ───────────────────────────────────────────────────── */

/**
 * EACH BRAND'S OWN COLOUR, from its brand guidelines (the hex Simple Icons
 * publishes with each mark). INK is a brand whose mark is black: drawn in the
 * caller's colour instead, so X on a dark page is white rather than gone.
 * Instagram is its gradient (InstagramMark below), not a colour.
 */
const INK = "ink"
export const BRAND_COLORS: Readonly<Record<string, string>> = {
  instagram: "#FF0069",
  facebook: "#0866FF",
  youtube: "#FF0000",
  twitter: INK,
  threads: INK,
  tiktok: INK,
  whatsapp: "#25D366",
  snapchat: "#FFFC00",
  discord: "#5865F2",
  github: INK,
  kick: "#53FC18",
  linkedin: "#0A66C2",
  patreon: INK,
  pinterest: "#BD081C",
  soundcloud: "#FF5500",
  spotify: "#1ED760",
  applemusic: "#FA243C",
  "apple-music": "#FA243C",
  telegram: "#26A5E4",
  twitch: "#9146FF",
  calendly: "#006BFF",
  reddit: "#FF4500",
  notion: INK,
  vimeo: "#1AB7EA",
  amazon: "#FF9900",
  etsy: "#F16521",
  kofi: "#FF5E5B",
  buymeacoffee: "#FFDD00",
  paypal: "#002991",
  cashapp: "#00D64F",
  venmo: "#008CFF",
  bluesky: "#0285FF",
  substack: "#FF6719",
  bandcamp: "#1DA0C3",
  "apple-podcasts": "#9933CC",
  gumroad: "#FF90E8",
  loom: "#625DF5",
  typeform: INK,
  "google-forms": "#7248B9",
  "google-calendar": "#4285F4",
  mixcloud: "#5000FF",
}

/** Too light to see on white: drawn with a hairline of black around it, as these brands draw themselves on white. */
const LIGHT_BRANDS = new Set(["snapchat", "kick", "buymeacoffee", "gumroad"])

/** A brand's own colour, or null when it has none of its own (a website, an email, a black mark). */
export function brandColor(platform: string): string | null {
  const key = canonicalSocialPlatform(platform)
  const c = BRAND_COLORS[key] ?? BRAND_COLORS[platform]
  return c && c !== INK ? c : null
}

export type MarkTone = "brand" | "mono"

/** The style that puts a brand's colour on a react-icons mark (or nothing, for mono and ink brands). */
function brandStyle(key: string, tone: MarkTone | undefined, style: React.CSSProperties | undefined): { color?: string; style?: React.CSSProperties } {
  if (tone !== "brand") return { style }
  const c = BRAND_COLORS[key]
  if (!c || c === INK) return { style }
  if (LIGHT_BRANDS.has(key)) {
    return { color: c, style: { ...style, stroke: "#111113", strokeWidth: 1.4, paintOrder: "stroke", strokeLinejoin: "round" } }
  }
  return { color: c, style }
}

/* Simple Icons' Instagram glyph, so it can be filled with the gradient (a react-icons mark has no room for a <defs>). */
const INSTAGRAM_PATH =
  "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"

/**
 * INSTAGRAM IN ITS OWN GRADIENT: yellow at the bottom left, through orange
 * and magenta, to violet at the top right, as Instagram's glyph is drawn.
 * The gradient's id is this mark's own (useId), so two on one page never
 * borrow each other's, and one inside a hidden panel never loses its fill.
 */
function InstagramMark({ size, className, style, ...a11y }: SvgProps) {
  const id = `ig${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <svg viewBox="0 0 24 24" width={size ?? "1em"} height={size ?? "1em"} className={className} style={style} data-mark="instagram" data-tone="brand" {...a11y}>
      <defs>
        <radialGradient id={id} cx="0.3" cy="1.07" r="1.3" fx="0.3" fy="1.07">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="0.75" stopColor="#E1306C" />
          <stop offset="1" stopColor="#833AB4" />
        </radialGradient>
      </defs>
      <path d={INSTAGRAM_PATH} fill={`url(#${id})`} />
    </svg>
  )
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
  "data-tone"?: string
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
  /** "brand": the brand's own colour (BRAND_COLORS); "mono" (the default): `color`. */
  tone?: MarkTone
}

/**
 * A social platform's mark. Every spelling in lib/onepage/social-url.ts
 * resolves first; a name nobody knows draws a plain link glyph rather than
 * nothing, so a saved link can never vanish from the page because its icon
 * was missing.
 */
export function SocialIcon({ platform, size = 20, color = "currentColor", strokeWidth = 2, className, style, title, tone }: SocialIconProps) {
  const key = canonicalSocialPlatform(platform)
  const a11y = labelled(title)
  const linkKey = isLinkBrandIcon(key) ? key : isLinkBrandIcon(platform) ? platform : null
  const drawing: Drawing | undefined =
    SOCIAL_MARKS[key as OnePageSocialPlatform] ?? (linkKey ? { brand: LINK_BRAND_MARKS[linkKey] } : undefined)

  if (drawing && "brand" in drawing) {
    const markKey = linkKey ?? key
    if (tone === "brand" && markKey === "instagram") return <InstagramMark size={size} className={className} style={style} {...a11y} />
    const b = brandStyle(markKey, tone, style)
    return <BrandSvg Icon={drawing.brand} size={size} color={b.color ?? color} className={className} style={b.style} data-mark={markKey} data-tone={tone === "brand" ? "brand" : undefined} {...a11y} />
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
  /** "brand": a brand mark in its own colour; a line icon is unchanged. */
  tone?: MarkTone
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
export function LinkIcon({ name, size, color = "currentColor", strokeWidth = 2, className, style, tone }: LinkIconProps) {
  const key = linkIconKey(name)
  if (!key) return null
  if (isLinkBrandIcon(key)) {
    if (tone === "brand" && key === "instagram") return <InstagramMark size={size} className={className} style={style} aria-hidden focusable="false" />
    const b = brandStyle(key, tone, style)
    return (
      <BrandSvg
        Icon={LINK_BRAND_MARKS[key]}
        size={size}
        color={b.color ?? color}
        className={className}
        style={b.style}
        data-mark={key}
        data-tone={tone === "brand" ? "brand" : undefined}
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

/* ─── The marks of the tools a page connects to ───────────────────────── */

/**
 * ROUND 40: "Tally, Klaviyo, Omnisend must have icons." The tools a page's
 * signups and forms go to, each in its own mark: Mailchimp, Kit, Google
 * Sheets, Zapier, Make, Meta, Google Analytics and Cal.com from Simple
 * Icons (react-icons/si), in their own colour; Klaviyo's flag and
 * Omnisend's "i" redrawn from the logos Storelib already shows on Settings ›
 * Integrations (public/integrations), so they take a colour like the rest;
 * Tally and beehiiv have no mark in the set, so each is a plain drawing of
 * its own (tally strokes, a hive cell), in near black.
 */
type MarkProps = { size?: number | string; color?: string; className?: string; tone?: MarkTone }

function TallyMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="tally">
      <rect x="2" y="2" width="20" height="20" rx="5" fill={color} />
      <g stroke="#fff" strokeWidth="1.9" strokeLinecap="round">
        <path d="M7.5 7v10M10.5 7v10M13.5 7v10M16.5 7v10" />
        <path d="M5.8 15.6 18.2 8.4" />
      </g>
    </svg>
  )
}

function KlaviyoMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="klaviyo">
      <path d="M3 5.5h18l-5.2 6.5L21 18.5H3z" fill={color} />
    </svg>
  )
}

function OmnisendMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="omnisend">
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={color} />
      <circle cx="12" cy="8" r="1.9" fill="#fff" />
      <path d="M11.4 11.6c0 3 .35 5 1.9 6.5" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function BeehiivMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="beehiiv">
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z" fill={color} />
      <path d="M7.5 10.25h9M7.5 13.75h9" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/* Round 41: MailerLite and Flodesk have no mark in the set either. MailerLite's green tile with its open "ml" strokes; Flodesk's near black tile with its "f". Brevo is in the set. */
function MailerLiteMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="mailerlite">
      <rect x="2" y="3.5" width="20" height="17" rx="5" fill={color} />
      <path d="M6.6 15.5v-4.2a1.6 1.6 0 0 1 3.2 0v4.2M9.8 11.3a1.6 1.6 0 0 1 3.2 0v4.2M15.6 8.2v6a1.3 1.3 0 0 0 1.9 1.15" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FlodeskMark({ size = 20, color = "currentColor", className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden focusable="false" data-mark="flodesk">
      <rect x="2" y="2" width="20" height="20" rx="5.5" fill={color} />
      <path d="M14.8 6.6c-1.9-.4-3.4.4-3.4 2.6V18M8.8 11h5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const INTEGRATION_ICONS: Record<string, { brand?: IconType; draw?: (p: MarkProps) => React.ReactElement; color: string; line?: boolean }> = {
  mailerlite: { draw: MailerLiteMark, color: "#09C269" },
  brevo: { brand: SiBrevo, color: "#0B996E" },
  flodesk: { draw: FlodeskMark, color: "#111113" },
  tally: { draw: TallyMark, color: "#111113" },
  klaviyo: { draw: KlaviyoMark, color: "#232426" },
  omnisend: { draw: OmnisendMark, color: "#111113" },
  beehiiv: { draw: BeehiivMark, color: "#111113" },
  mailchimp: { brand: SiMailchimp, color: "#241C15" },
  kit: { brand: SiKit, color: "#111113" },
  sheets: { brand: SiGooglesheets, color: "#34A853" },
  zapier: { brand: SiZapier, color: "#FF4F00" },
  make: { brand: SiMake, color: "#6D00CC" },
  meta: { brand: SiMeta, color: "#0866FF" },
  ga: { brand: SiGoogleanalytics, color: "#E37400" },
  calcom: { brand: SiCaldotcom, color: "#111113" },
  webhook: { color: "#111113", line: true },
}

export const INTEGRATION_MARK_KEYS: readonly string[] = Object.keys(INTEGRATION_ICONS)

/** A connected tool's mark: in its own colour (`tone="brand"`, the default) or in `color` ("mono"). A name it does not know draws nothing. */
export function IntegrationMark({ id, size = 20, color, className, tone = "brand" }: MarkProps & { id: string }) {
  const m = INTEGRATION_ICONS[id]
  if (!m) return null
  const fill = tone === "brand" || !color ? m.color : color
  if (m.line) return <Webhook size={size} color={fill} strokeWidth={1.8} className={className} aria-hidden data-mark={id} />
  if (m.draw) return m.draw({ size, color: fill, className })
  const Svg = m.brand as unknown as React.ComponentType<SvgProps>
  return <Svg size={size} color={fill} className={className} aria-hidden focusable="false" data-mark={id} />
}

/* ─── The app blocks' marks (round AL) ────────────────────────────────── */

/**
 * ROUND AL, the owner: "for the apps that actually are companies, just use
 * their original icon ... You need to use the original Google Maps icon."
 * The Add block sheet and the app blocks (lib/onepage/app-blocks) draw each
 * service's own mark. Google Maps and Google are their own four colours,
 * drawn here from the published logos; Audiomack, RSS, the App Store and
 * Google Play are Simple Icons (react-icons/si) like the rest of this file;
 * every social or brand mark this file already draws (SocialIcon) is used
 * as is. Cameo, Bonfire and Fourthwall publish no mark in that set, so each
 * is a plain monogram of its name, never a picture loaded from their sites.
 */
function GoogleMapsMark({ size = 20, className }: MarkProps) {
  return (
    <svg viewBox="0 0 92.3 132.3" width={size} height={size} className={className} aria-hidden focusable="false" data-mark="google-maps" data-tone="brand">
      <path fill="#1a73e8" d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z" />
      <path fill="#ea4335" d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z" />
      <path fill="#4285f4" d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3" />
      <path fill="#fbbc04" d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3" />
      <path fill="#34a853" d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.4 14.5 6.8 23.1 12.8 23.1s3.4-8.7 12.8-23.2" />
    </svg>
  )
}

function GoogleMark({ size = 20, className }: MarkProps) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden focusable="false" data-mark="google" data-tone="brand">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** A brand with no mark in the set: its first letter, bold, in a rounded square. */
function monogram(letter: string, key: string) {
  const M = ({ size = 20, color = "currentColor", className }: MarkProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden focusable="false" data-mark={key}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="none" stroke={color} strokeWidth="2" />
      <text x="12" y="16.6" textAnchor="middle" fontSize="12.5" fontWeight="800" fontFamily="Inter, system-ui, sans-serif" fill={color}>
        {letter}
      </text>
    </svg>
  )
  M.displayName = `Monogram(${key})`
  return M
}

/* i18n-ignore-start: marks' keys and letters, not words. */
const APP_MARKS: Record<string, { brand?: IconType; draw?: (p: MarkProps) => React.ReactElement; multicolor?: boolean }> = {
  "google-maps": { draw: GoogleMapsMark, multicolor: true },
  google: { draw: GoogleMark, multicolor: true },
  audiomack: { brand: SiAudiomack },
  rss: { brand: SiRss },
  appstore: { brand: SiAppstore },
  googleplay: { brand: SiGoogleplay },
  cameo: { draw: monogram("C", "cameo") },
  bonfire: { draw: monogram("B", "bonfire") },
  fourthwall: { draw: monogram("4", "fourthwall") },
}
/* i18n-ignore-end */

/** Instagram's app icon behind a white mark: its own colours, as the app draws them, on a round tile. */
export const INSTAGRAM_FILL = "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)"

/** Marks drawn in their own several colours: on a white tile, never recoloured. */
export function isMulticolorMark(key: string): boolean {
  return !!APP_MARKS[key]?.multicolor
}

/** Whether AppMark draws a service's mark for this key (otherwise the caller draws its own glyph). */
export function hasAppMark(key: string): boolean {
  if (APP_MARKS[key]) return true
  const canon = canonicalSocialPlatform(key)
  return !!SOCIAL_MARKS[canon as OnePageSocialPlatform] || isLinkBrandIcon(key) || isLinkBrandIcon(canon)
}

/**
 * A service's mark for the app blocks and the Add block sheet: in `color`
 * (a white mark on its brand colour), or in its own colours with
 * tone="brand". Instagram's gradient and the Google marks are always their
 * own. A key it does not know draws nothing.
 */
export function AppMark({ id, size = 20, color = "currentColor", className, tone }: MarkProps & { id: string }) {
  const own = APP_MARKS[id]
  if (own?.draw) return own.draw({ size, color, className })
  if (own?.brand) return <BrandSvg Icon={own.brand} size={size} color={color} className={className} aria-hidden focusable="false" data-mark={id} />
  if (!hasAppMark(id)) return null
  return <SocialIcon platform={id} size={size} color={color} className={className} tone={tone} />
}
