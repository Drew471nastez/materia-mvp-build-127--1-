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
 * device) gets a plain line glyph in ink, so a brand colour always means a
 * brand.
 */
import * as React from "react"
import {
  ArrowUpRight,
  Globe,
  Link2,
  Mail,
  Megaphone,
  Monitor,
  Search,
  Smartphone,
  Tablet,
  Users,
  type LucideIcon,
} from "lucide-react"
import { socialNetworkOfHost } from "@/lib/analytics/sources"
import { BRAND_MARKS } from "./brand-marks"

type Mark = { kind: "brand"; name: string } | { kind: "line"; Icon: LucideIcon }

const brand = (name: string): Mark => ({ kind: "brand", name })
const line = (Icon: LucideIcon): Mark => ({ kind: "line", Icon })

const SOURCE: Record<string, Mark> = {
  direct: line(ArrowUpRight),
  organic_search: line(Search),
  paid_search: line(Megaphone),
  paid: line(Megaphone),
  email: line(Mail),
  affiliate: line(Link2),
  referral: line(Link2),
  social: line(Users),
}

const DEVICE: Record<string, Mark> = {
  mobile: line(Smartphone),
  tablet: line(Tablet),
  desktop: line(Monitor),
}

function network(name: string): Mark {
  return name in BRAND_MARKS || name === "google" ? brand(name) : line(Users)
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
  const social = socialNetworkOfHost(h)
  if (social) return network(social)
  if (is("yahoo.com", "yandex.ru", "yandex.com", "startpage.com", "qwant.com")) return line(Search)
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
  if (n.includes("samsung")) return line(Globe)
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
  return null
}

export type IconFor = "source" | "social" | "referrer" | "device" | "browser" | "os"

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
  if (!m) return <Globe className="h-3.5 w-3.5" strokeWidth={2} />
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

export function SourceIcon({ kind, value }: { kind: IconFor; value: string }) {
  const mark =
    kind === "source"
      ? SOURCE[value]
      : kind === "social"
        ? network(value)
        : kind === "referrer"
          ? markForHost(value)
          : kind === "device"
            ? DEVICE[value]
            : kind === "browser"
              ? markForBrowser(value)
              : markForOs(value)
  const m: Mark = mark ?? line(Globe)
  if (m.kind === "brand") {
    return (
      <span
        aria-hidden
        data-brand={m.name}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#eceef1]"
        style={{ background: m.name === "snapchat" ? "#FFFC00" : "#fff" }}
      >
        <BrandGlyph name={m.name} />
      </span>
    )
  }
  const Icon = m.Icon
  return (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#eceef1] bg-[#f7f7f8] text-[#4b5563]">
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  )
}
