/**
 * The mark beside a row in Analytics: where a visit came from, which app,
 * which device, browser or system.
 *
 * Official silhouettes from Simple Icons (react-icons/si), in the page's ink,
 * like every other brand mark in Storelib (components/social/platform-icons
 * has the reasoning): the real shape, recognised at a glance, without a row
 * of competing brand colours. Anything without a mark of its own gets a plain
 * line icon rather than a guessed logo.
 */
import type { IconType } from "react-icons"
import {
  SiAndroid,
  SiApple,
  SiBrave,
  SiDuckduckgo,
  SiFacebook,
  SiFirefoxbrowser,
  SiGmail,
  SiGoogle,
  SiGooglechrome,
  SiInstagram,
  SiLinkedin,
  SiLinux,
  SiOpenai,
  SiOpera,
  SiPinterest,
  SiReddit,
  SiSafari,
  SiSamsung,
  SiSnapchat,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "react-icons/si"
import {
  ArrowUpRight,
  Globe,
  Laptop,
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

type Mark = { kind: "brand"; Icon: IconType } | { kind: "line"; Icon: LucideIcon }

const brand = (Icon: IconType): Mark => ({ kind: "brand", Icon })
const line = (Icon: LucideIcon): Mark => ({ kind: "line", Icon })

const NETWORK: Record<string, Mark> = {
  instagram: brand(SiInstagram),
  tiktok: brand(SiTiktok),
  facebook: brand(SiFacebook),
  x: brand(SiX),
  youtube: brand(SiYoutube),
  pinterest: brand(SiPinterest),
  linkedin: brand(SiLinkedin),
  snapchat: brand(SiSnapchat),
  reddit: brand(SiReddit),
  threads: brand(SiThreads),
  whatsapp: brand(SiWhatsapp),
  telegram: brand(SiTelegram),
}

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

/** A referrer's host, to the mark of the company behind it. */
function markForHost(host: string): Mark | null {
  const h = host.toLowerCase().replace(/^www\./, "")
  const is = (...names: string[]) => names.some((n) => h === n || h.endsWith(`.${n}`))
  if (h === "mail.google.com" || h === "gmail.com") return brand(SiGmail)
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return brand(SiGoogle)
  if (is("duckduckgo.com")) return brand(SiDuckduckgo)
  if (is("bing.com", "yahoo.com", "yandex.ru", "baidu.com")) return line(Search)
  if (is("instagram.com")) return brand(SiInstagram)
  if (is("facebook.com", "fb.com", "fb.me")) return brand(SiFacebook)
  if (is("x.com", "twitter.com", "t.co")) return brand(SiX)
  if (is("youtube.com", "youtu.be")) return brand(SiYoutube)
  if (is("tiktok.com")) return brand(SiTiktok)
  if (is("linkedin.com", "lnkd.in")) return brand(SiLinkedin)
  if (/(^|\.)pinterest\.[a-z.]+$/.test(h) || is("pin.it")) return brand(SiPinterest)
  if (is("reddit.com")) return brand(SiReddit)
  if (is("threads.net", "threads.com")) return brand(SiThreads)
  if (is("snapchat.com")) return brand(SiSnapchat)
  if (is("wa.me", "whatsapp.com")) return brand(SiWhatsapp)
  if (is("t.me", "telegram.org", "telegram.me")) return brand(SiTelegram)
  if (is("chatgpt.com", "openai.com")) return brand(SiOpenai)
  return null
}

const DEVICE: Record<string, Mark> = {
  mobile: line(Smartphone),
  tablet: line(Tablet),
  desktop: line(Monitor),
}

function markForBrowser(name: string): Mark | null {
  const n = name.toLowerCase()
  if (n.includes("chrome")) return brand(SiGooglechrome)
  if (n.includes("safari")) return brand(SiSafari)
  if (n.includes("firefox")) return brand(SiFirefoxbrowser)
  if (n.includes("opera")) return brand(SiOpera)
  if (n.includes("samsung")) return brand(SiSamsung)
  if (n.includes("brave")) return brand(SiBrave)
  if (n.includes("instagram")) return brand(SiInstagram)
  if (n.includes("facebook")) return brand(SiFacebook)
  if (n.includes("tiktok")) return brand(SiTiktok)
  if (n.includes("edge")) return line(Globe)
  return null
}

function markForOs(name: string): Mark | null {
  const n = name.toLowerCase()
  if (n === "ios" || n.includes("mac")) return brand(SiApple)
  if (n.includes("android")) return brand(SiAndroid)
  if (n.includes("linux")) return brand(SiLinux)
  if (n.includes("windows") || n.includes("chrome")) return line(Laptop)
  return null
}

export type IconFor = "source" | "social" | "referrer" | "device" | "browser" | "os"

export function SourceIcon({ kind, value }: { kind: IconFor; value: string }) {
  const mark =
    kind === "source"
      ? SOURCE[value]
      : kind === "social"
        ? NETWORK[value]
        : kind === "referrer"
          ? markForHost(value)
          : kind === "device"
            ? DEVICE[value]
            : kind === "browser"
              ? markForBrowser(value)
              : markForOs(value)
  const Mark = mark ?? line(Globe)
  const Icon = Mark.Icon as React.ComponentType<{ className?: string; "aria-hidden"?: boolean; strokeWidth?: number }>
  return (
    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#eceef1] bg-[#f7f7f8] text-[#303036]">
      {Mark.kind === "brand" ? <Icon className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
    </span>
  )
}
