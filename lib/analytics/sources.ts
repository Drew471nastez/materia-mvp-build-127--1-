/**
 * WHERE A VISIT CAME FROM
 *
 * The one set of rules for turning a referrer, UTM tags and an in-app
 * browser's signature into a source: used when a view is recorded
 * (app/api/track-view), by the browser's own hint (lib/analytics-utils), and
 * when OnePage views are read back for Analytics (lib/analytics/reports), so
 * every page names a visit the same way.
 *
 * A HOST IS MATCHED BY ITS DOMAIN, NEVER BY A SUBSTRING. The rules this
 * replaced asked `ref.includes("t.co")` and `ref.includes("x.com")`, which is
 * true of pinterest.com, reddit.com, microsoft.com, dropbox.com and
 * netflix.com: every visit from Pinterest and Reddit was counted as X. And a
 * UTM source that named no network at all, `utm_source=google` or
 * `utm_source=chatgpt.com`, fell through to "social".
 *
 * Categories are the stored strings: direct, organic_search, paid_search,
 * paid, email, affiliate, referral, social_<network>, or plain social.
 */
import { isOnePageHost } from "@/lib/onepage/address"

function normalizeStr(v?: string | null): string {
  return (v || "").trim()
}

function normalizeLower(v?: string | null): string {
  return normalizeStr(v).toLowerCase()
}

/** "www.l.instagram.com" is on instagram.com; "notinstagram.com" is not. */
export function hostIs(host: string, ...domains: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  return domains.some((d) => h === d || h.endsWith(`.${d}`))
}

/**
 * Social networks and messaging apps, by the domains a visit from them comes
 * through: the site, its link shortener and its outbound redirector.
 */
const SOCIAL_HOSTS: Array<[network: string, domains: string[]]> = [
  ["instagram", ["instagram.com", "ig.me"]],
  ["facebook", ["facebook.com", "fb.com", "fb.me", "fb.watch", "messenger.com", "m.me"]],
  ["threads", ["threads.net", "threads.com"]],
  ["tiktok", ["tiktok.com"]],
  ["x", ["x.com", "twitter.com", "t.co"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["pinterest", ["pinterest.com", "pin.it"]],
  ["linkedin", ["linkedin.com", "lnkd.in"]],
  ["snapchat", ["snapchat.com"]],
  ["reddit", ["reddit.com", "redd.it"]],
  ["whatsapp", ["whatsapp.com", "wa.me"]],
  ["telegram", ["telegram.org", "telegram.me", "t.me"]],
  ["discord", ["discord.com", "discord.gg", "discordapp.com"]],
  ["twitch", ["twitch.tv"]],
  ["bluesky", ["bsky.app"]],
  ["tumblr", ["tumblr.com"]],
]

/** Pinterest has a site per country: pinterest.co.uk, pinterest.de. */
function pinterestCountry(host: string): boolean {
  return /(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)
}

export function socialNetworkOfHost(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "")
  if (!h) return null
  for (const [network, domains] of SOCIAL_HOSTS) if (hostIs(h, ...domains)) return network
  if (pinterestCountry(h)) return "pinterest"
  return null
}

const EMAIL_HOSTS = [
  "mail.google.com",
  "gmail.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
  "mail.yahoo.com",
  "mail.proton.me",
  "mail.aol.com",
]

function isEmailHost(host: string): boolean {
  return hostIs(host, ...EMAIL_HOSTS)
}

/** Google has a site per country, so it is matched by its name, not its suffix. */
function isGoogle(host: string): boolean {
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)
}

export function isSearchHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  if (isGoogle(h) && !isEmailHost(h)) return true
  return hostIs(
    h,
    "bing.com",
    "duckduckgo.com",
    "search.yahoo.com",
    "yahoo.com",
    "baidu.com",
    "yandex.ru",
    "yandex.com",
    "ecosia.org",
    "search.brave.com",
    "startpage.com",
    "qwant.com",
    "naver.com",
    "seznam.cz",
  )
}

/**
 * ✅ Server-side client app detection using User-Agent.
 * This is crucial when referrer is empty and clientApp isn't sent / is unreliable.
 *
 * Notes:
 * - Instagram/TikTok/FB/Threads/Snapchat/Telegram are usually detectable here.
 * - WhatsApp is inconsistent across devices; UTMs are the only guaranteed solution.
 */
export function detectClientAppFromUA(uaRaw: string | null): string | null {
  if (!uaRaw) return null
  const ua = uaRaw.toLowerCase()

  if (ua.includes("instagram")) return "instagram"
  if (ua.includes("barcelona")) return "threads"
  if (/tiktok|musical_ly|bytedancewebview/.test(ua)) return "tiktok"
  if (ua.includes("fbav") || ua.includes("fban") || ua.includes("fb_iab") || ua.includes("messengerforios")) return "facebook"
  if (ua.includes("threads")) return "threads"
  if (ua.includes("snapchat")) return "snapchat"
  if (ua.includes("telegram")) return "telegram"
  if (ua.includes("whatsapp")) return "whatsapp"
  if (ua.includes("linkedinapp")) return "linkedin"
  if (ua.includes("pinterest")) return "pinterest"

  return null
}

/**
 * A UTM source, to the network it names. Matched as a word, not a
 * substring: "ig" is Instagram, "digital" is not; "x" is X, "box" is not.
 */
function networkOfUtmSource(source: string): string | null {
  const s = source.toLowerCase()
  const words = s.split(/[^a-z0-9]+/).filter(Boolean)
  const has = (...names: string[]) => names.some((n) => words.includes(n))
  if (has("instagram", "ig", "insta")) return "instagram"
  if (has("facebook", "fb", "meta", "messenger")) return "facebook"
  if (has("threads")) return "threads"
  if (has("tiktok")) return "tiktok"
  if (has("twitter", "x")) return "x"
  if (has("youtube", "yt")) return "youtube"
  if (has("pinterest")) return "pinterest"
  if (has("linkedin")) return "linkedin"
  if (has("snapchat", "snap")) return "snapchat"
  if (has("reddit")) return "reddit"
  if (has("whatsapp", "wa")) return "whatsapp"
  if (has("telegram")) return "telegram"
  if (has("discord")) return "discord"
  if (has("twitch")) return "twitch"
  if (has("bluesky", "bsky")) return "bluesky"
  /* A domain given as the source, "l.instagram.com", "t.co". */
  if (s.includes(".")) return socialNetworkOfHost(s)
  return null
}

const SEARCH_UTM = ["google", "bing", "duckduckgo", "yahoo", "baidu", "yandex", "ecosia", "brave"]

export function categorizeServerSource(
  referrerDomain?: string | null,
  utmSource?: string | null,
  utmMedium?: string | null,
  clientApp?: string | null,
): string {
  const ref = normalizeLower(referrerDomain).replace(/^www\./, "")
  const source = normalizeLower(utmSource)
  const medium = normalizeLower(utmMedium)
  const app = normalizeLower(clientApp)

  // 1) UTMs always win
  if (source || medium) {
    const paid = /(^|[^a-z])(cpc|ppc|cpm|paid|ads?|display|paidsocial|paid_social|paid-social)([^a-z]|$)/.test(medium)
    const network = networkOfUtmSource(source)
    const searchEngine = SEARCH_UTM.some((n) => source.split(/[^a-z0-9]+/).includes(n)) || isSearchHost(source)

    if (paid) return searchEngine ? "paid_search" : "paid"
    if (/e-?mail|newsletter/.test(medium) || /e-?mail|newsletter|mailchimp|klaviyo|convertkit|beehiiv|substack|brevo/.test(source)) return "email"
    if (medium.includes("affiliate") || source.includes("affiliate")) return "affiliate"
    if (network) return `social_${network}`
    if (medium === "organic" && searchEngine) return "organic_search"
    if (searchEngine) return "organic_search"
    if (medium.includes("social")) return "social"
    return "referral"
  }

  // 2) In-app browsers when referrer is blank
  if (!ref || ref === "direct") {
    if (app) {
      const known = SOCIAL_HOSTS.some(([n]) => n === app)
      if (known) return `social_${app}`
    }
    return "direct"
  }

  // 3) Email referrers, before Google: mail.google.com is Gmail, not a search.
  if (isEmailHost(ref)) return "email"

  // 4) Social referrers and their redirectors
  const network = socialNetworkOfHost(ref)
  if (network) return `social_${network}`

  // 5) Search engines
  if (isSearchHost(ref)) return "organic_search"

  return "referral"
}

/**
 * NOT A SOURCE AT ALL. A referrer that is Storelib itself, the creator's own
 * site on a Storelib subdomain, or the payment page a buyer returns from
 * says where the visitor was a moment ago, not where the visit came from.
 * Counted as a referral, a buyer coming back from Stripe was a "visit from
 * checkout.stripe.com". Treated as direct here; the browser keeps the
 * visit's first source for the rest of the visit (lib/analytics-utils).
 */
export function isInternalReferrer(host: string, mainDomain: string, pageHost?: string | null): boolean {
  const h = normalizeLower(host).replace(/^www\./, "")
  if (!h || h === "direct") return false
  const main = normalizeLower(mainDomain).replace(/^www\./, "")
  if (main && hostIs(h, main)) return true
  /* A OnePage on storelib.me is Storelib too: a visitor it sent on was already on the creator's page. */
  if (isOnePageHost(h)) return true
  if (pageHost && h === normalizeLower(pageHost).replace(/^www\./, "")) return true
  return hostIs(h, "checkout.stripe.com", "stripe.com", "paypal.com", "localhost") || h.endsWith(".vercel.app")
}

/** The host of a referrer address, without www, or "" for none. */
export function referrerHost(referrer: string | null | undefined): string {
  const r = normalizeStr(referrer)
  if (!r) return ""
  try {
    return new URL(r.includes("://") ? r : `https://${r}`).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}
