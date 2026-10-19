/**
 * The mark beside a row in Analytics: where a visit came from, which app,
 * which device, browser or system.
 *
 * THE REAL LOGOS, IN THEIR OWN COLOURS. A row of grey silhouettes made
 * Instagram, TikTok and X look like the same thing at a glance; the colour
 * is how anybody finds their Instagram row in a list. The shapes are Simple
 * Icons, inlined in ./brand-marks with their brand colours. Instagram gets
 * its gradient, TikTok its cyan and red offset, YouTube its white play
 * button, Snapchat its yellow, Google its four colours.
 *
 * Anything that is not a company (Direct, Search, Email, a referral, a
 * campaign, a device) gets a glyph drawn for this list: two tones of ink, a
 * dark body and a light face, on a small raised white tile. They replaced
 * stock outline icons in a grey box, which the owner found flat. A website
 * with no brand mark here shows its own favicon, and the globe only when it
 * has none.
 */
import * as React from "react"
import { socialNetworkOfHost } from "@/lib/analytics/sources"
import { BRAND_MARKS } from "./brand-marks"
import { BrowserLogo, COLOUR_BROWSERS } from "./browser-logos"

type GlyphName =
  | "direct"
  | "search"
  | "paid"
  | "email"
  | "link"
  | "social"
  | "campaign"
  | "globe"
  | "mobile"
  | "tablet"
  | "desktop"

type Mark = { kind: "brand"; name: string } | { kind: "glyph"; name: GlyphName } | { kind: "site"; host: string }

const brand = (name: string): Mark => ({ kind: "brand", name })
const glyph = (name: GlyphName): Mark => ({ kind: "glyph", name })

const SOURCE: Record<string, Mark> = {
  direct: glyph("direct"),
  organic_search: glyph("search"),
  paid_search: glyph("paid"),
  paid: glyph("paid"),
  email: glyph("email"),
  affiliate: glyph("link"),
  referral: glyph("globe"),
  social: glyph("social"),
}

const DEVICE: Record<string, Mark> = {
  mobile: glyph("mobile"),
  tablet: glyph("tablet"),
  desktop: glyph("desktop"),
}

function network(name: string): Mark {
  return name in BRAND_MARKS || name === "google" ? brand(name) : glyph("social")
}

/** A referrer's host, to the mark of the company behind it. */
export function markForHost(host: string): Mark | null {
  const h = host.toLowerCase().replace(/^www\./, "")
  const is = (...names: string[]) => names.some((n) => h === n || h.endsWith(`.${n}`))
  if (is("mail.google.com", "gmail.com")) return brand("gmail")
  if (is("gemini.google.com", "bard.google.com")) return brand("gemini")
  if (/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)) return brand("google")
  if (is("bing.com")) return brand("bing")
  if (is("duckduckgo.com")) return brand("duckduckgo")
  if (is("baidu.com")) return brand("baidu")
  if (is("ecosia.org")) return brand("ecosia")
  if (is("search.brave.com", "brave.com")) return brand("brave")
  if (is("chatgpt.com", "chat.openai.com", "openai.com")) return brand("chatgpt")
  if (is("perplexity.ai")) return brand("perplexity")
  if (is("messenger.com", "m.me")) return brand("messenger")
  if (is("linktr.ee")) return brand("linktree")
  if (is("substack.com")) return brand("substack")
  if (is("spotify.com", "open.spotify.com")) return brand("spotify")
  if (is("github.com", "github.io")) return brand("github")
  if (is("stripe.com")) return brand("stripe")
  if (is("apple.com", "icloud.com", "apple.news")) return brand("apple")
  const social = socialNetworkOfHost(h)
  if (social) return network(social)
  if (is("yahoo.com", "yandex.ru", "yandex.com", "startpage.com", "qwant.com")) return glyph("search")
  return null
}

function markForBrowser(name: string): Mark | null {
  const n = name.toLowerCase()
  if (n.includes("instagram")) return brand("instagram")
  if (n.includes("facebook")) return brand("facebook")
  if (n.includes("tiktok")) return brand("tiktok")
  if (n.includes("edge")) return brand("edge")
  if (n.includes("opera")) return brand("opera")
  if (n.includes("brave")) return brand("brave")
  if (n.includes("samsung")) return brand("samsung")
  if (n.includes("firefox")) return brand("firefox")
  if (n.includes("chrome")) return brand("chrome")
  if (n.includes("safari")) return brand("safari")
  return null
}

function markForOs(name: string): Mark | null {
  const n = name.toLowerCase()
  if (n === "ios" || n.includes("mac")) return brand("apple")
  if (n.includes("android")) return brand("android")
  if (n.includes("chromeos") || n.includes("chrome os")) return brand("chrome")
  if (n.includes("windows")) return brand("windows")
  if (n.includes("linux")) return brand("linux")
  if (n === "other" || n === "unknown" || n === "(other)") return glyph("globe")
  return null
}

export type IconFor = "source" | "social" | "referrer" | "device" | "browser" | "os" | "campaign"

/** Google's G in its four colours; Simple Icons only has it in one. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-3.5 w-3.5" aria-hidden>
      <path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

function BrandGlyph({ name }: { name: string }) {
  const id = React.useId().replace(/:/g, "")
  if (name === "google") return <GoogleG />
  const m = BRAND_MARKS[name]
  if (!m) return <Glyph name="globe" />
  const size = "h-3.5 w-3.5"
  if (name === "instagram") {
    return (
      <svg viewBox={m.vb} className={size} aria-hidden>
        <defs>
          <radialGradient id={id} cx="0.3" cy="1.07" r="1.2">
            <stop offset="0" stopColor="#FDF497" />
            <stop offset="0.1" stopColor="#FDF497" />
            <stop offset="0.45" stopColor="#FD5949" />
            <stop offset="0.6" stopColor="#D6249F" />
            <stop offset="0.9" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <path d={m.d} fill={`url(#${id})`} />
      </svg>
    )
  }
  if (name === "tiktok") {
    return (
      <svg viewBox={m.vb} className={size} aria-hidden>
        <path d={m.d} fill="#25F4EE" transform="translate(-0.9 -0.7)" />
        <path d={m.d} fill="#FE2C55" transform="translate(0.9 0.7)" />
        <path d={m.d} fill="#000000" />
      </svg>
    )
  }
  if (name === "youtube") {
    return (
      <svg viewBox={m.vb} className={size} aria-hidden>
        <rect x="7" y="7" width="10" height="10" fill="#fff" />
        <path d={m.d} fill={m.fill ?? "#FF0000"} />
      </svg>
    )
  }
  return (
    <svg viewBox={m.vb} className={size} aria-hidden>
      <path d={m.d} fill={m.fill ?? "#1a1a2e"} />
    </svg>
  )
}

/* The two inks every glyph is drawn in, and the light face between them. */
const INK = "#1a1a2e"
const MID = "#8b919c"
const FACE = "#e6e8ee"

/**
 * THE GLYPHS, drawn on a 16 unit square for a 14px mark. Each is a dark body
 * with a light face, so it reads as an object rather than a line drawing:
 * a phone has a screen, a monitor has a stand, an envelope has a flap.
 */
function Glyph({ name }: { name: GlyphName }) {
  const common = { viewBox: "0 0 16 16", className: "h-3.5 w-3.5", "aria-hidden": true } as const
  switch (name) {
    case "mobile":
      return (
        <svg {...common}>
          <rect x="4" y="0.75" width="8" height="14.5" rx="2" fill={INK} />
          <rect x="5.1" y="2.3" width="5.8" height="10.6" rx="0.8" fill={FACE} />
          <rect x="6.9" y="13.55" width="2.2" height="0.7" rx="0.35" fill={MID} />
        </svg>
      )
    case "tablet":
      return (
        <svg {...common}>
          <rect x="2" y="1" width="12" height="14" rx="2" fill={INK} />
          <rect x="3.2" y="2.3" width="9.6" height="10.8" rx="0.8" fill={FACE} />
          <circle cx="8" cy="14.05" r="0.45" fill={MID} />
        </svg>
      )
    case "desktop":
      return (
        <svg {...common}>
          <rect x="0.75" y="1.75" width="14.5" height="10" rx="1.6" fill={INK} />
          <rect x="1.9" y="2.9" width="12.2" height="7.7" rx="0.6" fill={FACE} />
          <path d="M6.6 11.75h2.8l.45 1.9H6.15z" fill={MID} />
          <rect x="4.6" y="13.4" width="6.8" height="1.35" rx="0.675" fill={INK} />
        </svg>
      )
    case "direct":
      /* An address bar with the caret in it: typed in, or opened from a bookmark. */
      return (
        <svg {...common}>
          <rect x="0.75" y="3.5" width="14.5" height="9" rx="4.5" fill={INK} />
          <rect x="1.9" y="4.65" width="12.2" height="6.7" rx="3.35" fill={FACE} />
          <rect x="4.3" y="6.1" width="1.3" height="3.8" rx="0.65" fill={INK} />
          <rect x="7" y="7.35" width="5" height="1.3" rx="0.65" fill={MID} />
        </svg>
      )
    case "search":
      return (
        <svg {...common}>
          <circle cx="6.6" cy="6.6" r="5.35" fill={INK} />
          <circle cx="6.6" cy="6.6" r="3.9" fill={FACE} />
          <path d="M10.4 10.4l4.1 4.1" stroke={INK} strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      )
    case "paid":
      /* A megaphone: paid reach. */
      return (
        <svg {...common}>
          <path d="M1.5 6.1c0-.7.55-1.25 1.25-1.25H5l6.4-3.4c.6-.3 1.3.1 1.3.8v11.5c0 .7-.7 1.1-1.3.8L5 11.15H2.75c-.7 0-1.25-.55-1.25-1.25z" fill={INK} />
          <path d="M5 4.85v6.3" stroke={FACE} strokeWidth="1" />
          <path d="M5.2 11.3l.9 3.1c.15.5.6.85 1.15.85h.5c.5 0 .85-.45.75-.95l-.7-3z" fill={MID} />
          <path d="M14.2 5.6c.8.6 1.3 1.45 1.3 2.4s-.5 1.8-1.3 2.4" stroke={MID} strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </svg>
      )
    case "email":
      return (
        <svg {...common}>
          <rect x="0.75" y="2.75" width="14.5" height="10.5" rx="2" fill={INK} />
          <rect x="1.95" y="3.95" width="12.1" height="8.1" rx="1" fill={FACE} />
          <path d="M2.4 4.6l5.6 4.1 5.6-4.1" stroke={INK} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" fill="none" />
        </svg>
      )
    case "link":
      return (
        <svg {...common}>
          <path d="M6.9 9.1a3 3 0 0 0 4.25 0l2.4-2.4a3 3 0 0 0-4.25-4.25l-.9.9" stroke={INK} strokeWidth="1.9" strokeLinecap="round" fill="none" />
          <path d="M9.1 6.9a3 3 0 0 0-4.25 0l-2.4 2.4a3 3 0 0 0 4.25 4.25l.9-.9" stroke={MID} strokeWidth="1.9" strokeLinecap="round" fill="none" />
        </svg>
      )
    case "social":
      /* Two speech bubbles, the one behind lighter. */
      return (
        <svg {...common}>
          <path d="M6.4 1.5h6.6c1.2 0 2.2 1 2.2 2.2v3.6c0 1.2-1 2.2-2.2 2.2h-.5v1.9l-2.5-1.9H6.4c-1.2 0-2.2-1-2.2-2.2V3.7c0-1.2 1-2.2 2.2-2.2z" fill={MID} />
          <path d="M3 5.6h6.6c1.2 0 2.2 1 2.2 2.2v3.6c0 1.2-1 2.2-2.2 2.2H6.1l-2.6 2v-2H3c-1.2 0-2.2-1-2.2-2.2V7.8c0-1.2 1-2.2 2.2-2.2z" fill={INK} />
          <rect x="3.1" y="8.35" width="5.6" height="1.1" rx="0.55" fill={FACE} />
          <rect x="3.1" y="10.35" width="3.6" height="1.1" rx="0.55" fill={FACE} />
        </svg>
      )
    case "campaign":
      /* A tag: the link was tagged with a campaign. */
      return (
        <svg {...common}>
          <path d="M1 2.4C1 1.6 1.6 1 2.4 1h4.8c.4 0 .75.15 1 .4l6.6 6.6c.55.55.55 1.45 0 2l-4.8 4.8c-.55.55-1.45.55-2 0L1.4 8.2c-.25-.25-.4-.6-.4-1z" fill={INK} />
          <circle cx="4.6" cy="4.6" r="1.45" fill={FACE} />
        </svg>
      )
    case "globe":
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7.25" fill={INK} />
          <circle cx="8" cy="8" r="6" fill={FACE} />
          <ellipse cx="8" cy="8" rx="2.6" ry="6" stroke={INK} strokeWidth="1.1" fill="none" />
          <path d="M2 8h12M3 4.9h10M3 11.1h10" stroke={INK} strokeWidth="1.1" fill="none" />
        </svg>
      )
  }
}

/**
 * THE TILE every mark sits on: white, a hairline edge and a one pixel shadow
 * under it, so it reads as a small raised key rather than a grey patch.
 */
export const TILE =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-white shadow-[0_0_0_0.5px_rgba(17,24,39,0.12),0_1px_2px_rgba(17,24,39,0.08),inset_0_-1px_0_rgba(17,24,39,0.04)]"

/** The site's own icon, and the globe when it has none or it does not load. */
function SiteIcon({ host }: { host: string }) {
  const [failed, setFailed] = React.useState(false)
  if (failed) return <Glyph name="globe" />
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={(e) => {
        /* A one pixel answer is "no icon", not an icon. */
        if (e.currentTarget.naturalWidth < 2) setFailed(true)
      }}
      className="h-3.5 w-3.5 rounded-[3px] object-contain"
    />
  )
}

/** A bare host, or null when the value is not one ("Direct", "Other"). */
function hostOf(value: string): string | null {
  const h = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null
}

export function SourceIcon({ kind, value }: { kind: IconFor; value: string }) {
  let mark: Mark | null | undefined
  /* A source named by its network ("social_instagram", a community's Traffic sources) wears that network's mark. */
  if (kind === "source") mark = SOURCE[value] ?? (value.startsWith("social_") ? network(value.slice("social_".length)) : undefined)
  else if (kind === "social") mark = network(value)
  else if (kind === "referrer") {
    /* A company already named by Analytics (lib/analytics/sources referrerBrand): "google", "instagram", "x". */
    if (value === "google" || value in BRAND_MARKS) mark = brand(value)
    const host = hostOf(value)
    mark = mark ?? markForHost(value) ?? (host ? { kind: "site", host } : null)
  } else if (kind === "device") mark = DEVICE[value]
  else if (kind === "browser") mark = markForBrowser(value)
  else if (kind === "campaign") mark = glyph("campaign")
  else mark = markForOs(value)
  const m: Mark = mark ?? glyph("globe")
  /* A browser in its own colours (./browser-logos), not a one-colour silhouette. */
  if (m.kind === "brand" && kind === "browser" && COLOUR_BROWSERS.has(m.name)) {
    return (
      <span aria-hidden data-brand={m.name} className={TILE}>
        <BrowserLogo name={m.name} />
      </span>
    )
  }
  if (m.kind === "brand") {
    return (
      <span aria-hidden data-brand={m.name} className={TILE} style={m.name === "snapchat" ? { background: "#FFFC00" } : undefined}>
        <BrandGlyph name={m.name} />
      </span>
    )
  }
  if (m.kind === "site") {
    return (
      <span aria-hidden data-site={m.host} className={TILE}>
        <SiteIcon host={m.host} />
      </span>
    )
  }
  return (
    <span aria-hidden data-glyph={m.name} className={TILE}>
      <Glyph name={m.name} />
    </span>
  )
}
