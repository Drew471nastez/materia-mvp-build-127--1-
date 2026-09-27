/**
 * ===========================================================================
 *  WHAT A ONEPAGE SAYS ABOUT ITSELF WHEN NOBODY WROTE IT A DESCRIPTION
 * ===========================================================================
 * "It should be their description, or something like that, and if they
 * don't have anything set up, display that." Linktree and Beacons do not send
 * one sentence for every page: they describe the page from what is on it. So
 * the description a search result and a shared link show is, in order:
 *
 *   1. the description the creator typed (lib/onepage/seo overrideOf)
 *   2. the bio, as plain text, cut at a word near 155 characters
 *   3. a sentence made from what a visitor can see on the page: its
 *      products, the platforms its social icons and links go to, and
 *      otherwise its link titles
 *        "Shop Riso Pack, Zine No. 4 and Tote from Mara. Also on Instagram,
 *         TikTok and YouTube."
 *   4. only when the page shows none of that, "Mara on Storelib."
 *
 * No pronouns (the name is used), no hype, no dashes.
 *
 * WHAT COUNTS is what the page draws: the same block rule the live page uses
 * (lib/onepage/extra-blocks isBlockShown: on, inside its schedule, with
 * something in it), in the page's order. The caller hands the blocks it
 * would draw: the published copy with its products read live for the public
 * page (lib/onepage/published-page), the draft for the editor's preview. A
 * block that is off, scheduled for later, or a product that is archived or
 * unpublished is not in them and so is never named.
 *
 * NOTHING PRIVATE: only names are used, never an address. An email address
 * anywhere in the text is taken out, and email, phone and WhatsApp links are
 * not listed. The work is bounded: at most 200 blocks, 50 inside a group.
 *
 * Pure: no React, no database, safe on the client and the server.
 */
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { canonicalSocialPlatform } from "@/lib/onepage/social-url"

/** Google shows about this much of a description; derived text is cut here. */
export const SEO_AUTO_DESCRIPTION_MAX = 155

const MAX_BLOCKS = 200
const MAX_CHILDREN = 50
const LIST_MAX = 3

/* ─────────────────────────────── Text ─────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }
const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi

/*
  Control characters, zero width and direction marks, line and paragraph
  separators, and the variation selectors that follow an emoji. Built from
  code points so the source holds none of them itself.
*/
const hex4 = (n: number) => `\\u${n.toString(16).padStart(4, "0")}`
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0xfe0e, 0xfe0f],
  [0xfeff, 0xfeff],
]
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([a, b]) => `${hex4(a)}-${hex4(b)}`).join("")}]`, "g")
const LINE_BREAK = new RegExp(`\\r\\n|\\r|\\n|${hex4(0x2028)}|${hex4(0x2029)}`)

/** One line of plain text: tags out, entities read once, control and invisible characters out, spaces collapsed. */
function plainLine(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[<>]/g, "")
    .replace(/\bmailto:/gi, "")
    .replace(EMAIL, " ")
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Plain text on one line, with no email address in it. */
export function plainPhrase(value: unknown): string {
  return typeof value === "string" ? plainLine(value) : ""
}

const TERMINAL = /[.!?…:;,)\]"'”’»]$/u
/* A mark somebody put at the start of a line to decorate it. */
const LEADER = /^(?:[-–—•·*|>→▪▸◦]+\s*)+/u

/**
 * A bio as one paragraph. Lines become sentences ("Photographer\nLondon" is
 * "Photographer. London"), a decoration at the start of a line is dropped,
 * and an email address is taken out.
 */
export function tidyBio(bio: unknown): string {
  if (typeof bio !== "string") return ""
  const lines = bio
    .slice(0, 4000)
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .split(LINE_BREAK)
    .map((line) => plainLine(line).replace(LEADER, "").replace(/[\s,;:|·•-]+$/u, "").trim())
    .filter((line) => line.length > 0)
  let out = ""
  for (const line of lines) {
    if (!out) out = line
    else out = `${out}${TERMINAL.test(out) ? "" : "."} ${line}`
  }
  return out
}

/* Words a cut should not end on: "Prints and" reads as a mistake. */
const DANGLING_WORDS = new Set(["a", "an", "and", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with", "&", "+", "|"])
const DANGLING_TAIL = /[\s,;:\-–—(/[{"'“‘«&+|·•]+$/u

function trimTail(text: string): string {
  let out = text.replace(DANGLING_TAIL, "")
  for (let i = 0; i < 4; i++) {
    const words = out.split(" ")
    if (words.length < 2 || !DANGLING_WORDS.has(words[words.length - 1].toLowerCase())) break
    out = words.slice(0, -1).join(" ").replace(DANGLING_TAIL, "")
  }
  return out
}

/**
 * Cut to `max` characters, counted as a person counts them (an emoji is
 * one). At the end of a sentence when one ends in the last 40 percent, with
 * nothing after it; otherwise at a word, with no comma, bracket or "and"
 * left hanging, and an ellipsis. Text that fits is left as it is.
 */
export function cutAtWord(value: string, max = SEO_AUTO_DESCRIPTION_MAX): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  const room = chars.slice(0, max).join("")
  const floor = Math.floor(max * 0.6)
  let sentence = -1
  for (const m of room.matchAll(/[.!?](?=\s|$)/g)) if ((m.index ?? 0) + 1 >= floor) sentence = (m.index ?? 0) + 1
  if (sentence > 0) return room.slice(0, sentence)
  const within = Array.from(room).slice(0, max - 1).join("")
  const space = within.lastIndexOf(" ")
  const cut = trimTail(space >= floor ? within.slice(0, space) : within)
  return `${cut || within.trim()}…`
}

/** "A", "A and B", "A, B and C". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/* ─────────────────────────── The page, read ─────────────────────────── */

/**
 * The platforms a page can point at, by the name a person reads. A link to
 * one of these hosts counts as that platform, as its icon would.
 */
const PLATFORMS: Record<string, { label: string; hosts?: readonly string[] }> = {
  instagram: { label: "Instagram", hosts: ["instagram.com", "instagr.am"] },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  twitter: { label: "X", hosts: ["x.com", "twitter.com"] },
  threads: { label: "Threads", hosts: ["threads.net", "threads.com"] },
  facebook: { label: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  snapchat: { label: "Snapchat", hosts: ["snapchat.com"] },
  pinterest: { label: "Pinterest", hosts: ["pinterest.com", "pin.it"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"] },
  twitch: { label: "Twitch", hosts: ["twitch.tv"] },
  kick: { label: "Kick", hosts: ["kick.com"] },
  discord: { label: "Discord", hosts: ["discord.gg", "discord.com"] },
  github: { label: "GitHub", hosts: ["github.com"] },
  patreon: { label: "Patreon", hosts: ["patreon.com"] },
  soundcloud: { label: "SoundCloud", hosts: ["soundcloud.com"] },
  spotify: { label: "Spotify", hosts: ["open.spotify.com", "spotify.com", "spotify.link"] },
  applemusic: { label: "Apple Music", hosts: ["music.apple.com"] },
  telegram: { label: "Telegram", hosts: ["t.me", "telegram.me"] },
  reddit: { label: "Reddit", hosts: ["reddit.com"] },
  bluesky: { label: "Bluesky", hosts: ["bsky.app"] },
  substack: { label: "Substack", hosts: ["substack.com"] },
  vimeo: { label: "Vimeo", hosts: ["vimeo.com"] },
}

/** Ways to reach a person, not places to follow them: never named. */
const NOT_A_PROFILE = new Set(["email", "whatsapp", "website", "calendly", "phone", "sms"])

/** The social platform a saved key names, or null for one that is a way to reach somebody. */
export function socialPlatformKey(platform: unknown): string | null {
  const key = canonicalSocialPlatform(typeof platform === "string" ? platform : "")
  if (!key || NOT_A_PROFILE.has(key)) return null
  return key
}

/** The platform a link goes to, by its host, or null. */
export function platformOfUrl(url: unknown): string | null {
  if (typeof url !== "string") return null
  const raw = url.trim()
  if (!raw || /^(?:mailto|tel|sms):/i.test(raw)) return null
  let host = ""
  try {
    host = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, "")
  } catch {
    return null
  }
  for (const [key, p] of Object.entries(PLATFORMS)) {
    if (p.hosts?.some((h) => host === h || host.endsWith(`.${h}`))) return key
  }
  if (host.endsWith(".substack.com")) return "substack"
  return null
}

export function platformLabel(key: string): string {
  const k = canonicalSocialPlatform(key)
  return PLATFORMS[k]?.label ?? (k ? k.charAt(0).toUpperCase() + k.slice(1) : "")
}

export interface PageSummary {
  /** Product titles in page order, one per product, at most three. */
  productTitles: string[]
  productCount: number
  /** Platform labels in page order, social icons first. */
  socials: string[]
  /** Link titles in page order, at most three; links to a platform are in `socials`. */
  linkTitles: string[]
  linkCount: number
  /** False only when the page's header is there and does not show the bio. */
  bioShown: boolean
}

type Block = { id?: unknown; type?: unknown; enabled?: unknown; sort_order?: unknown; data?: any; schedule?: any }

/** The page's blocks in the order the page draws them, the ones it draws only. */
function shownInOrder(list: unknown, now: number, limit: number): Block[] {
  if (!Array.isArray(list)) return []
  return list
    .slice(0, limit)
    .filter((b): b is Block => !!b && typeof b === "object" && isBlockShown(b, now))
    .map((b, i) => ({ b, i, o: Number(b.sort_order) || 0 }))
    .sort((x, y) => x.o - y.o || x.i - y.i)
    .map((x) => x.b)
}

/** Longer than this, a title is counted but not named: three cut titles in a row read as a mistake. */
const TITLE_MAX = 40

/** A title fit to name in the sentence, or "" for none, or for one too long to name. */
const titleOf = (value: unknown) => {
  const t = plainPhrase(typeof value === "string" ? value.slice(0, 400) : value)
  return t && Array.from(t).length <= TITLE_MAX ? t : ""
}

/** The profile social links the page falls back on for a social row with none of its own (components/onepage/public-onepage social_row). */
const ROW_FALLBACK = ["instagram", "tiktok", "youtube", "twitter", "spotify"]

/**
 * What a visitor sees on the page, counted: its products, the platforms it
 * links to, its other links, and whether its bio is shown.
 */
export function summarizePage({ blocks, socialLinks, now = Date.now() }: { blocks?: unknown; socialLinks?: unknown; now?: number }): PageSummary {
  const products = new Map<string, string>()
  const socials = new Map<string, string>()
  const links = new Map<string, string>()
  let linkCount = 0
  let headers = 0
  let bioHeaders = 0
  const profile = (socialLinks && typeof socialLinks === "object" ? socialLinks : {}) as Record<string, unknown>

  const addSocial = (key: string | null) => {
    if (key && !socials.has(key)) socials.set(key, platformLabel(key))
  }

  const visit = (block: Block) => {
    const data = (block.data && typeof block.data === "object" ? block.data : {}) as Record<string, any>
    switch (block.type) {
      case "header":
        headers++
        if (data.show_bio !== false) bioHeaders++
        return
      case "product": {
        if (!data.product_id && !data.product_title) return
        const key = typeof data.product_id === "string" && data.product_id ? `id:${data.product_id}` : `t:${plainPhrase(data.product_title).toLowerCase()}`
        if (!products.has(key)) products.set(key, titleOf(data.product_title))
        return
      }
      case "social_row": {
        const platforms = Array.isArray(data.platforms) ? data.platforms.slice(0, 40) : []
        if (platforms.length === 0) {
          for (const key of ROW_FALLBACK) if (typeof profile[key] === "string" && (profile[key] as string).trim()) addSocial(key)
          return
        }
        for (const entry of platforms) {
          if (entry && typeof entry.url === "string" && entry.url.trim()) addSocial(socialPlatformKey(entry.platform))
        }
        return
      }
      case "link_button": {
        const url = typeof data.url === "string" ? data.url.trim() : ""
        if (/^(?:mailto|tel|sms):/i.test(url)) return
        const platform = platformOfUrl(url)
        if (platform) return addSocial(platform)
        linkCount++
        const title = titleOf(data.label)
        /* A title that is only an address says nothing a reader can use. */
        if (title && !/^(?:https?:\/\/|www\.)/i.test(title) && !links.has(title.toLowerCase())) links.set(title.toLowerCase(), title)
        return
      }
      case "group": {
        const carousel = data.layout === "carousel"
        const children = Array.isArray(data.children) ? data.children.slice(0, MAX_CHILDREN) : []
        /* A group draws a carousel's children only when switched on, a stack's unless switched off. */
        const drawn = children
          .filter((c: any) => c && typeof c === "object" && c.type !== "group" && (carousel ? !!c.enabled : c.enabled !== false))
          .map((c: any) => ({ ...c, enabled: true }))
        for (const child of shownInOrder(drawn, now, MAX_CHILDREN)) visit(child)
        return
      }
      default:
        return
    }
  }

  for (const block of shownInOrder(blocks, now, MAX_BLOCKS)) visit(block)

  const titled = [...products.values()].filter(Boolean)
  return {
    productTitles: [...new Map(titled.map((t) => [t.toLowerCase(), t])).values()].slice(0, LIST_MAX),
    productCount: products.size,
    socials: [...socials.values()],
    linkTitles: [...links.values()].slice(0, LIST_MAX),
    linkCount,
    bioShown: headers === 0 || bioHeaders > 0,
  }
}

/* ─────────────────────────── The sentence ─────────────────────────── */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Instagram, TikTok and YouTube", or "Instagram, TikTok, YouTube and 2 more". */
function namesWithMore(names: readonly string[], shown = LIST_MAX): string {
  if (names.length <= shown) return listOf(names)
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`
}

/**
 * The sentence a page with no bio is described by, from what is on it, or
 * null for a page that shows nothing to describe. The longest reading that
 * fits in `max` wins: every product title, then fewer, then a count.
 */
export function pageSentence(name: string, page: PageSummary, max = SEO_AUTO_DESCRIPTION_MAX): string | null {
  const { productTitles: titles, productCount: n, socials, linkTitles, linkCount } = page
  const hasProducts = n > 0

  /* Each way to say the products, fullest first. */
  const productWays: string[] = []
  if (hasProducts) {
    const allTitled = titles.length === n
    if (n <= LIST_MAX && allTitled) productWays.push(`Shop ${listOf(titles)} from ${name}.`)
    for (let k = Math.min(titles.length, LIST_MAX); k >= 1; k--) {
      if (n > k) productWays.push(`Shop ${plural(n, "product", "products")} from ${name}, including ${listOf(titles.slice(0, k))}.`)
    }
    productWays.push(n === 1 ? `Shop 1 product from ${name}.` : `Shop ${n} products from ${name}.`)
  }

  /* The platforms, or, with none, the other links. */
  const restWays: string[] = []
  if (socials.length > 0) {
    for (const k of [LIST_MAX, 2, 1]) {
      const names = namesWithMore(socials, Math.min(k, socials.length))
      restWays.push(hasProducts ? `Also on ${names}.` : `Find ${name} on ${names}.`)
    }
  } else if (linkCount > 0) {
    for (let k = Math.min(linkTitles.length, LIST_MAX); k >= 1; k--) {
      const more = linkCount - k
      const names = more > 0 ? `${linkTitles.slice(0, k).join(", ")} and ${plural(more, "more link", "more links")}` : listOf(linkTitles.slice(0, k))
      restWays.push(hasProducts ? `Links to ${names}.` : `Links from ${name}: ${names}.`)
    }
    restWays.push(hasProducts ? `Plus ${plural(linkCount, "link", "links")}.` : `${plural(linkCount, "link", "links")} from ${name}.`)
  }

  if (!hasProducts && restWays.length === 0) return null
  const firsts = productWays.length ? productWays : [""]
  const rests = restWays.length ? restWays : [""]
  const fits = (s: string) => Array.from(s).length <= max
  /* Products first: a shorter link list before a shorter product list. */
  for (const first of firsts) {
    for (const rest of rests) {
      const s = [first, rest].filter(Boolean).join(" ")
      if (fits(s)) return s
    }
  }
  for (const first of firsts) if (first && fits(first)) return first
  return cutAtWord([firsts[firsts.length - 1], rests[rests.length - 1]].filter(Boolean).join(" "), max)
}

export type DescriptionSource =
  | { kind: "bio" }
  | { kind: "page"; products: number; socials: number; links: number }
  | { kind: "name" }

/**
 * The description a page gets when the creator has not written one, and
 * what it was made from.
 */
export function autoPageDescription(
  name: string,
  bio: unknown,
  page: PageSummary,
  max = SEO_AUTO_DESCRIPTION_MAX,
): { value: string; source: DescriptionSource } {
  const tidy = page.bioShown ? tidyBio(bio) : ""
  if (tidy) return { value: cutAtWord(tidy, max), source: { kind: "bio" } }
  const sentence = pageSentence(name, page, max)
  if (sentence) {
    return {
      value: sentence,
      source: { kind: "page", products: page.productCount, socials: page.socials.length, links: page.socials.length ? 0 : page.linkCount },
    }
  }
  return { value: cutAtWord(`${name} on Storelib.`, max), source: { kind: "name" } }
}

/**
 * The line under a field in the editor that says where its words come from
 * while it follows the page.
 */
export function descriptionSourceNote(source: DescriptionSource): string {
  if (source.kind === "bio") return "From your bio"
  if (source.kind === "name") return "From your page name. Add a bio, links or products to say more."
  const parts = [
    source.products ? plural(source.products, "product", "products") : "",
    source.socials ? plural(source.socials, "social", "socials") : "",
    source.links ? plural(source.links, "link", "links") : "",
  ].filter(Boolean)
  return `From your page: ${parts.join(", ")}`
}
