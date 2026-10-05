/**
 * ===========================================================================
 *  IS THIS LINK SAFE TO SHOW MEMBERS
 * ===========================================================================
 * Every link in a post, a comment, a chat message or a direct message is
 * read out of the text (and out of a post's link card) and given one of
 * four verdicts:
 *
 *   ok       an ordinary link.
 *   expand   a known shortener (lib/communities/link-blocklist.ts): the
 *            server asks where it leads and checks the destination instead.
 *   hold     worth a moderator's look before members see it: an address
 *            written in another alphabet that imitates Latin letters
 *            (punycode, "xn--"), a name made to read as a brand it is not
 *            (paypa1, rnicrosoft, apple-support), a bare IP address, a
 *            domain that reads like a file (.zip, .mov).
 *   block    never shown: a domain on the blocklist (address grabbers,
 *            phishing kits), or a name and password hidden in front of the
 *            real host ("https://paypal.com@evil.example").
 *
 * Nothing here asks the network or any outside service: the lists are a
 * file in the repository, and the only lookup is the server following a
 * shortener (lib/communities/server/safety.ts). Pure and browser safe, so
 * the suite runs it directly.
 *
 * FALSE POSITIVES COST LESS THAN THEY LOOK. A held link waits for a
 * moderator, it is not lost; that is why the doubtful cases hold and only
 * the certain ones block.
 */
import { BLOCKED_DOMAINS, FILE_LIKE_TLDS, PROTECTED_BRANDS, SHORTENER_DOMAINS } from "./link-blocklist"

export type LinkVerdict = "ok" | "expand" | "hold" | "block"

export type LinkReason = "blocklist" | "credentials" | "shortener" | "punycode" | "lookalike" | "ip_address" | "file_like" | "unreadable"

export interface LinkCheck {
  url: string
  host: string
  verdict: LinkVerdict
  reason?: LinkReason
  /** For a lookalike: the name it imitates. */
  imitates?: string
}

/* ── Reading links out of text ──────────────────────────────────────────── */

/** The endings a bare "example.com" is recognised by. Not .zip or .mov: "report.zip" in a sentence is a file name. */
const BARE_TLDS = "com|net|org|io|co|me|ly|gg|link|xyz|top|ru|su|info|biz|app|site|online|shop|store|club|live|icu|to|cc|in|us|uk|de|fr|ro|es|it|nl|eu|tk|ml|ga|cf|gq|pw|ws|vip|win|bid|loan|click|work|fun|space|website|tech|page|dev|ai|tv|be|sh|gl|gd|at|id|ae|im|tt|ink"

const SCHEME_URL = /https?:\/\/[^\s<>"'`]+/giu
const WWW_URL = /(?<![\p{L}\p{N}@./-])www\.[^\s<>"'`]+/giu
const BARE_HOST = new RegExp(`(?<![\\p{L}\\p{N}@./:_-])((?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+(?:${BARE_TLDS}))(?![\\p{L}\\p{N}-])(/[^\\s<>"'\`]*)?`, "giu")

/** What a sentence ends a link with is not part of it. */
function trimTail(raw: string): string {
  return raw.replace(/[.,;:!?)\]}'"»”’]+$/u, "")
}

/**
 * Every link written in the text, as absolute addresses, once each: with a
 * scheme, starting with www., or a bare domain with a common ending. An
 * email address is not a link.
 */
export function linksInText(text: string, limit = 50): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (raw: string) => {
    if (out.length >= limit) return
    const url = normalizeUrl(raw)
    if (!url || seen.has(url)) return
    seen.add(url)
    out.push(url)
  }
  const value = String(text ?? "")
  let rest = value
  for (const m of value.matchAll(SCHEME_URL)) {
    add(trimTail(m[0]))
    rest = rest.replace(m[0], " ")
  }
  for (const m of rest.matchAll(WWW_URL)) {
    add(`http://${trimTail(m[0])}`)
    rest = rest.replace(m[0], " ")
  }
  for (const m of rest.matchAll(BARE_HOST)) {
    /* "I did.It was" is a missing space, not a domain: a label after the first that starts in capitals is a sentence. */
    if (m[1].split(".").slice(1).some((label) => /^\p{Lu}/u.test(label))) continue
    add(`http://${trimTail(m[0])}`)
  }
  return out
}

/** An address as the browser would read it, or null when it is not an http(s) one. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    if (!u.hostname) return null
    return u.toString()
  } catch {
    return null
  }
}

/* ── Punycode, decoded here so the module needs no Node built in ──────── */

/** RFC 3492 decode of one label's part after "xn--"; null when it is not valid punycode. */
export function decodePunycode(input: string): string | null {
  const base = 36
  const tMin = 1
  const tMax = 26
  const skew = 38
  const damp = 700
  let n = 128
  let i = 0
  let bias = 72
  const output: number[] = []
  const basic = input.lastIndexOf("-")
  for (let j = 0; j < (basic > 0 ? basic : 0); j++) {
    const c = input.charCodeAt(j)
    if (c >= 0x80) return null
    output.push(c)
  }
  const digit = (c: number) => (c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base)
  const adapt = (delta: number, points: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1
    delta += Math.floor(delta / points)
    let k = 0
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin))
      k += base
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew))
  }
  for (let index = basic > 0 ? basic + 1 : 0; index < input.length; ) {
    const old = i
    for (let w = 1, k = base; ; k += base) {
      if (index >= input.length) return null
      const d = digit(input.charCodeAt(index++))
      if (d >= base) return null
      i += d * w
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (d < t) break
      w *= base - t
      if (w > 0x7fffffff) return null
    }
    const len = output.length + 1
    bias = adapt(i - old, len, old === 0)
    n += Math.floor(i / len)
    i %= len
    if (n > 0x10ffff) return null
    output.splice(i++, 0, n)
  }
  return String.fromCodePoint(...output)
}

/** A hostname's labels as a person reads them (punycode decoded). */
export function unicodeHost(host: string): string {
  return host
    .split(".")
    .map((label) => (label.startsWith("xn--") ? (decodePunycode(label.slice(4)) ?? label) : label))
    .join(".")
}

/* ── Lookalikes ─────────────────────────────────────────────────────────── */

/**
 * Letters from other alphabets that are drawn like Latin ones, and the
 * digit and pair tricks ("0" for o, "rn" for m). Mapped to what they
 * imitate, so "раураl" (Cyrillic) and "paypa1" both read as paypal.
 */
const CONFUSABLE: Record<string, string> = {
  /* Cyrillic */
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "ѕ": "s", "і": "i", "ї": "i", "ј": "j", "ԁ": "d", "ԛ": "q", "ԝ": "w", "һ": "h", "ӏ": "l", "ɡ": "g", "ь": "b", "п": "n", "г": "r",
  /* Greek */
  "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "γ": "y", "η": "n", "ω": "w",
  /* Latin look-alikes and digits */
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "$": "s", "@": "a", "ı": "i", "ł": "l", "ⅼ": "l",
}

/** Whether a character is one of the non Latin letters drawn like a Latin one. */
function isConfusableForeign(ch: string): boolean {
  return /[\u0370-\u03ff\u0400-\u04ff\u0500-\u052f]/u.test(ch) && ch in CONFUSABLE
}

/**
 * The shape of a name: confusables mapped, accents dropped, "rn" read as m
 * and "vv" as w, i and l treated as one letter, repeated letters once.
 * Two names with one shape look the same at a glance.
 */
export function skeleton(label: string): string {
  let s = ""
  for (const ch of label.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")) s += CONFUSABLE[ch] ?? ch
  return s
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/i/g, "l")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1")
}

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

function listed(host: string, list: readonly string[]): boolean {
  return list.some((d) => hostIs(host, d))
}

/** The labels of a host that carry its name: everything but a "www" and the top level domain. */
function nameLabels(unicode: string): string[] {
  const labels = unicode.split(".").filter(Boolean)
  return labels.slice(0, -1).filter((l) => l !== "www")
}

/**
 * The names each brand is known by: its own, and the first label of each of
 * its real domains that carries the name (microsoftonline, amazonaws). Not
 * the generic ones (live, office, outlook), which would hold every
 * "live.example.com".
 */
const BRAND_SHAPES: { brand: string; shapes: Set<string>; domains: readonly string[] }[] = PROTECTED_BRANDS.map((b) => ({
  brand: b.name,
  domains: b.domains,
  shapes: new Set([b.name, ...b.domains.map((d) => d.split(".")[0]).filter((label) => label.includes(b.name))].filter((n) => n.length >= 4).map(skeleton)),
}))

/** Words a phishing name puts beside a brand: "paypal-login", "secure-apple-id", "discord-gift". */
const LURE_WORDS = new Set(["account", "auth", "billing", "bonus", "claim", "confirm", "free", "gift", "giveaway", "help", "id", "login", "nitro", "pay", "payment", "promo", "recover", "reset", "secure", "security", "service", "signin", "support", "update", "verify", "wallet"].map(skeleton))

/**
 * The brand a host imitates, or null. A host on the brand's own domains
 * never imitates it. A label imitates when its shape is a brand's shape
 * (paypa1, rnicrosoft, раураl), or when the brand is one word of a
 * hyphenated name beside a lure word (paypal-login, secure-apple-id);
 * "apple-pie-recipes" is left alone.
 */
export function imitatedBrand(host: string): string | null {
  const unicode = unicodeHost(host.toLowerCase())
  for (const b of BRAND_SHAPES) {
    if (b.domains.some((d) => hostIs(host, d))) continue
    for (const label of nameLabels(unicode)) {
      if (b.shapes.has(skeleton(label))) return b.brand
      const words = label.split(/[-_]+/).filter(Boolean)
      if (words.length > 1 && words.some((w) => b.shapes.has(skeleton(w))) && words.some((w) => LURE_WORDS.has(skeleton(w)))) return b.brand
    }
  }
  return null
}

/** A label written in punycode that mixes alphabets or uses letters drawn like Latin ones. */
function deceptiveUnicode(host: string): boolean {
  for (const label of host.split(".")) {
    if (!label.startsWith("xn--")) continue
    const text = decodePunycode(label.slice(4))
    if (text === null) return true
    const chars = [...text]
    const latin = chars.some((c) => /[a-z]/i.test(c))
    const foreign = chars.filter((c) => /[\u0370-\u03ff\u0400-\u04ff\u0500-\u052f]/u.test(c))
    if (latin && foreign.length) return true
    /* Every letter is a foreign one that passes for Latin: "аре" spelled in Cyrillic. */
    if (foreign.length && foreign.length === chars.filter((c) => /\p{L}/u.test(c)).length && foreign.every(isConfusableForeign)) return true
  }
  return false
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/* ── The verdict ────────────────────────────────────────────────────────── */

/** Storelib's own addresses are always fine. */
function ownHost(host: string): boolean {
  return hostIs(host, "storelib.com")
}

/** One link's verdict. */
export function checkLink(raw: string): LinkCheck {
  const url = normalizeUrl(raw)
  if (!url) return { url: raw, host: "", verdict: "ok" }
  const u = new URL(url)
  const host = u.hostname.toLowerCase().replace(/\.$/, "")
  if (u.username || u.password) return { url, host, verdict: "block", reason: "credentials" }
  if (ownHost(host)) return { url, host, verdict: "ok" }
  if (listed(host, BLOCKED_DOMAINS)) return { url, host, verdict: "block", reason: "blocklist" }
  if (IPV4.test(host) || host.startsWith("[")) return { url, host, verdict: "hold", reason: "ip_address" }
  const brand = imitatedBrand(host)
  if (brand) return { url, host, verdict: "hold", reason: "lookalike", imitates: brand }
  if (deceptiveUnicode(host)) return { url, host, verdict: "hold", reason: "punycode" }
  if (listed(host, SHORTENER_DOMAINS)) return { url, host, verdict: "expand", reason: "shortener" }
  const tld = host.split(".").pop() ?? ""
  if (FILE_LIKE_TLDS.includes(tld)) return { url, host, verdict: "hold", reason: "file_like" }
  return { url, host, verdict: "ok" }
}

const RANK: Record<LinkVerdict, number> = { ok: 0, expand: 1, hold: 2, block: 3 }

/** The strictest verdict among several checks. */
export function worstOf(checks: readonly LinkCheck[]): LinkCheck | null {
  let worst: LinkCheck | null = null
  for (const c of checks) if (!worst || RANK[c.verdict] > RANK[worst.verdict]) worst = c
  return worst
}

/** Plain words for the moderators' queue. */
export const LINK_REASON_WORDS: Record<LinkReason, string> = {
  blocklist: "a link on Storelib's blocklist",
  credentials: "a link that hides its real address",
  shortener: "a short link that could not be followed",
  punycode: "a link written in letters that imitate another address",
  lookalike: "a link that imitates a known brand",
  ip_address: "a link to a bare IP address",
  file_like: "a link that reads like a file name",
  unreadable: "a link that could not be read",
}
