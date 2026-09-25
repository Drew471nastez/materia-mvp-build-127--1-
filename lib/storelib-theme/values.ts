/**
 * ===========================================================================
 *  WHAT A VALUE MAY BE, CHECKED WHERE IT IS USED
 * ===========================================================================
 * The control registry says what shape a stored value has. This file says
 * whether a particular value is safe to put on a page, for the kinds of
 * value where "the right shape" is not enough:
 *
 *   a link           a string, but `javascript:` is also a string
 *   a background     a string, but `red; background: url(//x)` is too
 *   a focal point    a string that ends up inside `object-position`
 *   inline rich text a string that is printed as markup
 *   a video link     a string that becomes a player frame
 *   a date           a string a countdown reads
 *
 * Every function is pure and dependency free, because the engine runs in
 * three places (the server rendering a published page, the browser drawing
 * the builder's canvas, and the tests) and all three must agree to the
 * character. Nothing here throws: a value that fails is answered with the
 * empty string, which every template already treats as "not set".
 */

/* ── links ───────────────────────────────────────────────────────────────── */

/**
 * A link a page may carry: one of this site's paths, a web address, an email
 * or a phone number, or a fragment.
 *
 * `/` has to be followed by something other than a second slash OR A
 * BACKSLASH. Browsers read `/\example.com` as `//example.com`, which is
 * another website, and the older pattern let it through as "one of ours".
 */
export const SAFE_HREF = /^(\/(?![/\\])|https?:\/\/|mailto:|tel:|#)/i

/** Characters no address needs and some parsers skip: controls and whitespace inside the scheme. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g

export function safeHref(value: unknown): string {
  if (typeof value !== "string") return ""
  const s = value.replace(CONTROL_CHARS, "").trim()
  if (s === "") return ""
  return SAFE_HREF.test(s) ? s : "#"
}

export function isSafeHref(value: unknown): boolean {
  if (typeof value !== "string") return false
  const s = value.replace(CONTROL_CHARS, "").trim()
  return s === "" || SAFE_HREF.test(s)
}

/**
 * An address an `<img>` or `<video>` may load: a web address, one of this
 * site's paths, an `asset://` reference (turned into a URL before a template
 * sees it), or an inline picture. Anything else is not a picture.
 */
const SAFE_MEDIA = /^(https?:\/\/|\/(?![/\\])|asset:\/\/|data:image\/(?:png|jpe?g|gif|webp|avif);)/i

export function safeMediaUrl(value: unknown): string {
  if (typeof value !== "string") return ""
  const s = value.replace(CONTROL_CHARS, "").trim()
  if (s === "") return ""
  return SAFE_MEDIA.test(s) ? s : ""
}

/* ── a value that points at something ────────────────────────────────────── */

/**
 * ===========================================================================
 *  A PRODUCT PICKER THAT KNOWS THE PRODUCT
 * ===========================================================================
 * A `product_picker` has always held an address, and sections print it as
 * one: `href="{{ settings.product | url }}"`. It can also be the product
 * itself, with its live title and price, which is what makes a Featured
 * Product section show the product rather than whatever was typed beside
 * the picker.
 *
 * Both, without breaking the first: a Linked value PRINTS as its address,
 * compares as its address and is truthy when there is one, and a path into
 * it reads the product (`settings.product.title`). Only the template
 * language knows the difference; everything a section already wrote keeps
 * meaning what it meant.
 */
export class Linked {
  readonly href: string
  readonly fields: Readonly<Record<string, unknown>>
  constructor(href: string, fields: Record<string, unknown>) {
    this.href = href
    this.fields = Object.freeze({ ...fields, url: href })
  }
  toString(): string {
    return this.href
  }
  toJSON(): Record<string, unknown> {
    return { ...this.fields }
  }
}

/* ── colours and backgrounds ─────────────────────────────────────────────── */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const COLOR_FN = /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+%?\s*(?:,\s*|\s+)[0-9.]+%?\s*(?:,\s*|\s+)[0-9.]+%?\s*(?:(?:,|\/)\s*[0-9.]+%?\s*)?\)$/i

/** A single colour: hex, rgb(), hsl() or `transparent`. */
export function isColor(value: unknown): boolean {
  if (typeof value !== "string") return false
  const s = value.trim()
  return HEX.test(s) || COLOR_FN.test(s) || s.toLowerCase() === "transparent"
}

const BACKGROUND_FNS = new Set([
  "linear-gradient", "radial-gradient", "conic-gradient",
  "repeating-linear-gradient", "repeating-radial-gradient",
  "rgb", "rgba", "hsl", "hsla",
])
const BACKGROUND_WORDS = new Set([
  "to", "top", "bottom", "left", "right", "center", "at", "circle", "ellipse",
  "closest-side", "closest-corner", "farthest-side", "farthest-corner", "from", "in",
  "srgb", "oklab", "oklch", "transparent",
])

/**
 * A `color_background`: one colour, or one CSS gradient.
 *
 * It lands in a `style` attribute and in a stylesheet, where a value that
 * is allowed to contain `;`, `:`, `{`, a quote or `url(` can end the
 * declaration it is in and start another. So this is an allow list at two
 * levels: the characters (letters, digits, `#`, `%`, `.`, `,`, `-`,
 * brackets and spaces, and nothing else), and then every word and every
 * function name. `url(` cannot be spelled with those characters, and a name
 * not on the list is refused.
 *
 * Returns the value tidied, or "" when it is not a background.
 */
export function cleanBackground(value: unknown): string {
  if (typeof value !== "string") return ""
  const s = value.trim().replace(/\s+/g, " ")
  if (s === "") return ""
  if (s.length > 600) return ""
  if (isColor(s)) return s
  if (!/^[a-z0-9#%.,()\s-]+$/i.test(s)) return ""
  let depth = 0
  for (const ch of s) {
    if (ch === "(") depth++
    else if (ch === ")") { depth--; if (depth < 0) return "" }
  }
  if (depth !== 0) return ""
  /* Every function is one we know, and the outermost is a gradient. */
  const fns = [...s.matchAll(/([a-z-]+)\s*\(/gi)].map((m) => m[1].toLowerCase())
  if (fns.length === 0 || !fns.every((f) => BACKGROUND_FNS.has(f))) return ""
  if (!/^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i.test(s)) return ""
  /*
    Every bare word is a hex colour, a number with a unit, a gradient
    keyword or a colour name. The character list above is what makes this
    safe; this is what makes it a gradient rather than any words at all.
  */
  const words = s
    .replace(/([a-z-]+)\s*\(/gi, " ")
    .split(/[\s,()]+/)
    .filter(Boolean)
  for (const w of words) {
    if (HEX.test(w)) continue
    if (/^-?[0-9.]+(?:%|deg|turn|rad|grad|px|em|rem)?$/i.test(w)) continue
    if (BACKGROUND_WORDS.has(w.toLowerCase())) continue
    if (/^[a-z]{3,20}$/i.test(w)) continue
    return ""
  }
  return s
}

/* ── focal points ────────────────────────────────────────────────────────── */

/**
 * Where the important part of a picture is, as `object-position` reads it:
 * "30% 70%" is thirty percent in from the left and seventy down. Both parts
 * are clamped to 0 to 100 and kept to one decimal place, so the same point
 * is always stored the same way.
 */
export function cleanFocalPoint(value: unknown): string {
  if (typeof value !== "string") return ""
  const m = value.trim().match(/^(-?\d{1,3}(?:\.\d+)?)%\s+(-?\d{1,3}(?:\.\d+)?)%$/)
  if (!m) return ""
  const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10
  return `${clamp(Number(m[1]))}% ${clamp(Number(m[2]))}%`
}

/* ── inline rich text ────────────────────────────────────────────────────── */

/** The tags a single line of formatted text may carry. */
export const INLINE_TAGS = ["strong", "b", "em", "i", "u", "s", "code", "mark", "sub", "sup", "br", "a"] as const
const INLINE_ALLOWED = new Set<string>(INLINE_TAGS)
const VOID = new Set(["br"])
/** Tags whose contents are code or chrome, never words: dropped whole. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "textarea", "title", "svg", "math", "select", "option"])

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" }

/** Entities decoded, so a scheme spelled `jav&#97;script:` is seen for what it is. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ""
      try { return String.fromCodePoint(code) } catch { return "" }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()]
    return named ?? whole
  })
}

function escapeText(s: string): string {
  return s.replace(/&(?!(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function attr(raw: string, name: string): string | null {
  const m = raw.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"))
  if (!m) return null
  return m[1] ?? m[2] ?? m[3] ?? ""
}

/**
 * ONE LINE OF FORMATTED TEXT, REBUILT RATHER THAN FILTERED.
 *
 * An `inline_richtext` value is printed as markup, so what comes out of here
 * is written from an allow list and never copied from what went in: each
 * allowed tag is emitted in its canonical form with no attribute but a
 * checked `href` (and `target`, with the `rel` that has to go with it), every
 * other tag is dropped and its words kept, and text is escaped. A link's
 * address is checked after its entities are decoded, which is the step a
 * hand-written filter usually forgets and a browser always performs.
 *
 * Unclosed tags are closed at the end and stray closing tags are ignored, so
 * a half-typed `<strong>` cannot turn the rest of the page bold.
 */
export function sanitizeInlineHtml(value: unknown, maxLength = 4000): string {
  if (typeof value !== "string" || value === "") return ""
  const src = value.length > maxLength * 2 ? value.slice(0, maxLength * 2) : value
  const out: string[] = []
  const open: string[] = []
  let dropping: string | null = null
  const re = /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|<|[^<]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const token = m[0]
    if (token.startsWith("<!--")) continue
    const tag = m[1]?.toLowerCase()
    if (dropping) {
      if (tag === dropping && token.startsWith("</")) dropping = null
      continue
    }
    if (!tag) {
      out.push(escapeText(token === "<" ? "<" : token.replace(/[\r\n]+/g, " ")))
      continue
    }
    const closing = token.startsWith("</")
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !/\/>$/.test(token)) dropping = tag
      continue
    }
    if (!INLINE_ALLOWED.has(tag)) continue
    if (closing) {
      const at = open.lastIndexOf(tag)
      if (at < 0) continue
      while (open.length > at) out.push(`</${open.pop()}>`)
      continue
    }
    if (VOID.has(tag)) { out.push(`<${tag}>`); continue }
    if (tag === "a") {
      if (open.includes("a")) continue
      const rawHref = attr(m[2] ?? "", "href")
      const href = rawHref === null ? "" : decodeEntities(rawHref).replace(CONTROL_CHARS, "").trim()
      if (!href || !SAFE_HREF.test(href)) {
        // A link to nowhere keeps its words and loses its link.
        continue
      }
      const blank = (attr(m[2] ?? "", "target") ?? "").toLowerCase() === "_blank"
      out.push(`<a href="${escapeAttr(href)}"${blank ? ' target="_blank" rel="noopener noreferrer"' : ""}>`)
      open.push("a")
      continue
    }
    out.push(`<${tag}>`)
    open.push(tag)
  }
  while (open.length) out.push(`</${open.pop()}>`)
  const html = out.join("").replace(/\s+/g, " ").trim()
  return html.length > maxLength ? sanitizeInlineHtml(html.slice(0, maxLength), maxLength) : html
}

/** The words of some markup, entities decoded, one line. */
export function plainText(html: unknown): string {
  if (typeof html !== "string" || html === "") return ""
  return decodeEntities(
    html
      .replace(/<(script|style|template)[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim()
}

/* ── video links ─────────────────────────────────────────────────────────── */

export const VIDEO_HOSTS = ["youtube", "vimeo"] as const
export type VideoHost = (typeof VIDEO_HOSTS)[number]

export interface VideoLink {
  /** The address as it was pasted, tidied. */
  url: string
  host: VideoHost
  /** The video's id on that host. */
  id: string
  /** The privacy-respecting player address. */
  embed: string
}

/**
 * A YouTube or Vimeo link, in any of the shapes people paste: a watch page,
 * a short link, a shorts link, an embed link, a Vimeo page or a player
 * address. Null for anything else, which a `video_url` setting then refuses.
 */
export function parseVideoUrl(value: unknown, accept: readonly string[] = VIDEO_HOSTS): VideoLink | null {
  if (typeof value !== "string") return null
  const url = value.replace(CONTROL_CHARS, "").trim()
  if (!/^https?:\/\//i.test(url) || url.length > 500) return null
  const yt =
    url.match(/^https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)([\w-]{6,20})/i) ??
    url.match(/^https?:\/\/youtu\.be\/([\w-]{6,20})/i)
  if (yt && accept.includes("youtube")) {
    return { url, host: "youtube", id: yt[1], embed: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  }
  const vm = url.match(/^https?:\/\/(?:www\.)?(?:player\.)?vimeo\.com\/(?:video\/)?(\d{5,12})/i)
  if (vm && accept.includes("vimeo")) {
    return { url, host: "vimeo", id: vm[1], embed: `https://player.vimeo.com/video/${vm[1]}` }
  }
  return null
}

/* ── dates ───────────────────────────────────────────────────────────────── */

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?)?$/

export interface DateParts {
  year: number
  month: number
  day: number
  hour: number | null
  minute: number | null
  /** "Z", "+02:00", or null when the value names no zone. */
  zone: string | null
}

/**
 * A `datetime` value, taken apart as it was written.
 *
 * NOT through `Date`. A server in one time zone and a browser in another
 * would print the same instant as two different days, and what a creator
 * typed as "Sunday 11pm" is the time they meant, wherever it is read.
 */
export function parseDatetime(value: unknown): DateParts | null {
  if (typeof value !== "string") return null
  const m = value.trim().match(DATETIME)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > days) return null
  const hour = m[4] !== undefined ? Number(m[4]) : null
  const minute = m[5] !== undefined ? Number(m[5]) : null
  if (hour !== null && (hour > 23 || (minute ?? 0) > 59 || Number(m[6] ?? 0) > 59)) return null
  return { year, month, day, hour, minute, zone: m[7] ?? null }
}

export function cleanDatetime(value: unknown): string {
  const p = parseDatetime(value)
  if (!p) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`
  if (p.hour === null) return date
  return `${date}T${pad(p.hour)}:${pad(p.minute ?? 0)}${p.zone ?? ""}`
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/**
 * A date for people to read, from its parts. English month names; the site's
 * language decides nothing here yet, and saying so is better than printing
 * a format that changes with the server.
 */
export function formatDatetime(value: unknown, style: unknown = "long"): string {
  const p = parseDatetime(value)
  if (!p) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  const time = p.hour === null ? "" : `${pad(p.hour)}:${pad(p.minute ?? 0)}`
  switch (style) {
    case "short":
      return `${p.day} ${MONTHS[p.month - 1].slice(0, 3)} ${p.year}`
    case "time":
      return time
    case "iso":
      return cleanDatetime(value)
    case "long_time":
      return time ? `${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${time}` : `${p.day} ${MONTHS[p.month - 1]} ${p.year}`
    case "long":
    default:
      return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`
  }
}

/* ── menus ───────────────────────────────────────────────────────────────── */

/** One link of a menu, and the links under it. */
export interface MenuLink {
  title: string
  url: string
  links?: MenuLink[]
}

export interface Menu {
  title: string
  links: MenuLink[]
}

export const MENU_LIMITS = {
  menus: 12,
  /** Links on one level of one menu. */
  links: 40,
  /** Top level, and two levels under it: a dropdown, and a column in it. */
  depth: 3,
  titleLength: 80,
} as const

export const MENU_HANDLE = /^[a-z0-9][a-z0-9-]{0,39}$/

/**
 * A menu as a template may be given it: titles cut to length, every address
 * made safe, empty links dropped, and nothing deeper than three levels.
 * Pure, so the editor, the save and the render all agree about one menu.
 */
export function cleanMenu(value: unknown, depth = 1): MenuLink[] {
  if (!Array.isArray(value)) return []
  const out: MenuLink[] = []
  for (const raw of value.slice(0, MENU_LIMITS.links)) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, MENU_LIMITS.titleLength) : ""
    if (!title) continue
    const url = safeHref(typeof r.url === "string" ? r.url : "") || "#"
    const link: MenuLink = { title, url }
    if (depth < MENU_LIMITS.depth) {
      const kids = cleanMenu(r.links, depth + 1)
      if (kids.length) link.links = kids
    }
    out.push(link)
  }
  return out
}

/** Every menu a theme's settings hold, by handle, cleaned. Unknown shapes are dropped, never guessed at. */
export function cleanMenus(value: unknown): Record<string, Menu> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, Menu> = {}
  for (const [handle, raw] of Object.entries(value as Record<string, unknown>).slice(0, MENU_LIMITS.menus)) {
    if (!MENU_HANDLE.test(handle) || !raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, MENU_LIMITS.titleLength) : handle
    out[handle] = { title, links: cleanMenu(r.links) }
  }
  return out
}
