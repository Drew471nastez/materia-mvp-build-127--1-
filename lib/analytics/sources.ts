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
  const ref = canonicalReferrerHost(referrerDomain)
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
  /*
    The payment pages a buyer comes back from: Stripe's checkout, payment
    links, its card check and invoices, Link, PayPal. Stripe's own site and
    dashboard (stripe.com, dashboard.stripe.com) are a real referrer: a
    creator who links their shop from there sees Stripe in Referrers.
  */
  if (hostIs(h, "checkout.stripe.com", "buy.stripe.com", "hooks.stripe.com", "pay.stripe.com", "invoice.stripe.com", "js.stripe.com", "connect.stripe.com", "checkout.link.com", "link.com", "paypal.com", "localhost")) return true
  return h.endsWith(".vercel.app")
}

/**
 * AN ANDROID APP AS A REFERRER. Chrome on Android names the app a link was
 * opened from as android-app://<package> (Gmail is
 * android-app://com.google.android.gm), and its "host" is the package. Each
 * known app is the site it stands for, so a tap in the Gmail app is Gmail
 * and a tap in the Google app is Google search.
 */
const ANDROID_APPS: Record<string, string> = {
  "com.google.android.gm": "mail.google.com",
  "com.google.android.gm.lite": "mail.google.com",
  "com.google.android.googlequicksearchbox": "google.com",
  "com.google.android.apps.searchlite": "google.com",
  "com.google.android.youtube": "youtube.com",
  "com.google.android.apps.youtube.music": "youtube.com",
  "com.instagram.android": "instagram.com",
  "com.instagram.barcelona": "threads.net",
  "com.facebook.katana": "facebook.com",
  "com.facebook.lite": "facebook.com",
  "com.facebook.orca": "messenger.com",
  "com.twitter.android": "x.com",
  "com.zhiliaoapp.musically": "tiktok.com",
  "com.ss.android.ugc.trill": "tiktok.com",
  "com.pinterest": "pinterest.com",
  "com.reddit.frontpage": "reddit.com",
  "com.linkedin.android": "linkedin.com",
  "com.whatsapp": "whatsapp.com",
  "com.whatsapp.w4b": "whatsapp.com",
  "org.telegram.messenger": "telegram.org",
  "org.thunderdog.challegram": "telegram.org",
  "com.discord": "discord.com",
  "com.snapchat.android": "snapchat.com",
  "com.github.android": "github.com",
  "com.microsoft.office.outlook": "outlook.live.com",
  "com.yahoo.mobile.client.android.mail": "mail.yahoo.com",
  "com.microsoft.bing": "bing.com",
  "com.duckduckgo.mobile.android": "duckduckgo.com",
  "com.slack": "slack.com",
  "com.substack.app": "substack.com",
  "com.spotify.music": "open.spotify.com",
}

/** A referrer's host as a site: an Android app's package as the site it stands for, anything else as it is, without www. */
export function canonicalReferrerHost(host: string | null | undefined): string {
  const h = normalizeLower(host).replace(/^www\./, "")
  if (!h) return ""
  return ANDROID_APPS[h] ?? h
}

/**
 * THE COMPANY BEHIND A REFERRER, for the Referrers list: one row for Google
 * whatever country site or app it came through, one for Instagram whether
 * the visit came by instagram.com, l.instagram.com or the Android app, X for
 * x.com, twitter.com and t.co. The key is the mark the list draws
 * (components/analytics/source-icon). Null for a site that is no company
 * listed here: it is listed by its own host, with its own icon.
 */
const REFERRER_BRANDS: Array<[key: string, label: string, test: (h: string) => boolean]> = [
  ["gmail", "Gmail", (h) => hostIs(h, "mail.google.com", "gmail.com", "inbox.google.com")],
  ["gemini", "Gemini", (h) => hostIs(h, "gemini.google.com", "bard.google.com")],
  ["google", "Google", (h) => isGoogle(h) || hostIs(h, "news.google.com", "googleusercontent.com")],
  ["bing", "Bing", (h) => hostIs(h, "bing.com", "cn.bing.com")],
  ["duckduckgo", "DuckDuckGo", (h) => hostIs(h, "duckduckgo.com")],
  ["brave", "Brave Search", (h) => hostIs(h, "search.brave.com")],
  ["ecosia", "Ecosia", (h) => hostIs(h, "ecosia.org")],
  ["baidu", "Baidu", (h) => hostIs(h, "baidu.com")],
  ["chatgpt", "ChatGPT", (h) => hostIs(h, "chatgpt.com", "chat.openai.com")],
  ["perplexity", "Perplexity", (h) => hostIs(h, "perplexity.ai")],
  ["messenger", "Messenger", (h) => hostIs(h, "messenger.com", "m.me")],
  ["github", "GitHub", (h) => hostIs(h, "github.com", "github.io", "gist.github.com")],
  ["stripe", "Stripe", (h) => hostIs(h, "stripe.com")],
  ["apple", "Apple", (h) => hostIs(h, "apple.com", "icloud.com", "apple.news")],
  ["linktree", "Linktree", (h) => hostIs(h, "linktr.ee")],
  ["substack", "Substack", (h) => hostIs(h, "substack.com")],
  ["spotify", "Spotify", (h) => hostIs(h, "spotify.com")],
]

const NETWORK_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  reddit: "Reddit",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  twitch: "Twitch",
  bluesky: "Bluesky",
  tumblr: "Tumblr",
}

export function referrerBrand(host: string | null | undefined): { key: string; label: string } | null {
  const h = canonicalReferrerHost(host)
  if (!h) return null
  for (const [key, label, test] of REFERRER_BRANDS) if (test(h)) return { key, label }
  const network = socialNetworkOfHost(h)
  if (network) return { key: network, label: NETWORK_LABEL[network] ?? network }
  return null
}

/** Every key referrerBrand can give: a stored referrer is never one of these, since a host always has a dot. */
export const REFERRER_BRAND_KEYS: ReadonlySet<string> = new Set([...REFERRER_BRANDS.map(([k]) => k), ...Object.keys(NETWORK_LABEL)])

/**
 * A SOURCE NAMED IN THE ADDRESS WITHOUT UTM TAGS: ?ref=producthunt,
 * ?source=newsletter, ?via=instagram. Many sites and link tools tag links
 * this way, and the visit was counted as Direct when the referrer was
 * empty. Used as utm_source only when there is no utm_source.
 */
export function sourceParamOf(search: URLSearchParams): string | null {
  for (const key of ["ref", "source", "via", "src"]) {
    const v = (search.get(key) || "").trim()
    /* A word or a host, not an id: a referral code like ref=8F3K2 says nothing about where the visit came from. */
    if (v && v.length <= 60 && /^[a-z][a-z0-9._-]*$/i.test(v) && !/^\d+$/.test(v)) return v.toLowerCase()
  }
  return null
}

/** The host of a referrer address, without www, or "" for none. */
export function referrerHost(referrer: string | null | undefined): string {
  const r = normalizeStr(referrer)
  if (!r) return ""
  try {
    return canonicalReferrerHost(new URL(r.includes("://") ? r : `https://${r}`).hostname)
  } catch {
    return ""
  }
}
