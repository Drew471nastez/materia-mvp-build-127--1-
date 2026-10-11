/**
 * The filters of the compatible profile: Liquid's own, and the ones Shopify
 * themes write (money, images, assets, translations, colours, fonts, tags),
 * each answered by Storelib from Storelib's own data. Nothing here calls a
 * Shopify service: an asset is the theme's file on Storelib, an image is
 * sized by Storelib's image optimizer, a font is served from a public font
 * library, money is formatted from the shop's own format.
 *
 * Every filter takes what it is given and never throws on a value of the
 * wrong kind: a theme that pipes a nil into `money` prints nothing, as on
 * Shopify, rather than taking the page down.
 */
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { LFloat, OUTPUT, isBlank, prop, toList, toOutput, truthy, type Ctx, type FilterFn } from "./runtime"
import { shopifyGlobalAssetUrl } from "./shopify-global-assets"

// ── Helpers ──────────────────────────────────────────────────────────────────

/*
  The hash filters. Themes use md5 and sha256 to make an element id unique
  ("{{ section.id | md5 }}"), never to protect anything, and the same code
  runs in the builder's canvas, where no crypto module is loaded. So these
  are stable digests of the right length, not the named algorithms.
*/
function digest(s: string, hexLength: number): string {
  let out = ""
  let seed = 0
  while (out.length < hexLength) {
    let h = (2166136261 ^ seed) >>> 0
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
    out += h.toString(16).padStart(8, "0")
    seed++
  }
  return out.slice(0, hexLength)
}

function b64encode(s: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  const out = typeof btoa === "function" ? btoa(bin) : ""
  return urlSafe ? out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : out
}
function b64decode(s: string, urlSafe = false): string {
  try {
    let t = s
    if (urlSafe) { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "=" }
    const bin = typeof atob === "function" ? atob(t) : ""
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch { return "" }
}

const str = (v: unknown) => toOutput(v)
const num = (v: unknown): number => {
  if (typeof v === "number") return v
  if (v instanceof LFloat) return v.v
  if (v && typeof v === "object" && (v as Record<string, unknown>)[OUTPUT] !== undefined) return num((v as Record<string, unknown>)[OUTPUT])
  const n = Number(String(v ?? "").trim())
  return Number.isFinite(n) ? n : 0
}
const isInt = (v: unknown) => v instanceof LFloat ? false : typeof v === "number" ? Number.isInteger(v) : /^-?\d+$/.test(String(v ?? "").trim())
/** A float result stays a float, whole or not. */
const flt = (n: number) => (Number.isInteger(n) ? new LFloat(n) : n)
const arith = (a: unknown, b: unknown, f: (x: number, y: number) => number) => {
  const r = f(num(a), num(b))
  return isInt(a) && isInt(b) ? Math.trunc(r) : flt(r)
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}
function escapeOnce(s: string): string {
  return escapeHtml(s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" })[e as string] ?? m))
}
const attr = (s: unknown) => escapeHtml(str(s))

export function handleize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** What a registered helper the theme adds to the draw (assets, money, translations) looks like. */
export interface CompatRegisters {
  /** An asset's public address by its file name in assets/, or null when the theme has none. */
  assetUrl?: (name: string) => string | null
  /** An asset's text (an SVG, a stylesheet) for inline_asset_content. */
  assetText?: (name: string) => string | null
  /** The shop's money format: "${{amount}}". */
  moneyFormat?: string
  moneyWithCurrencyFormat?: string
  currency?: string
  /** A translation by key, or null. Plural forms are keys under it: one, other. */
  translate?: (key: string) => unknown
  /** The URL of a file in Storelib's media library by name (file_url). */
  fileUrl?: (name: string) => string
}

const reg = (ctx: Ctx) => (ctx.registers.compat ?? {}) as CompatRegisters

// ── Images ───────────────────────────────────────────────────────────────────

/** The address of whatever names a picture: a URL, an image, a media item, a product, a variant. */
export function imageSrc(v: unknown): string {
  if (!v) return ""
  if (typeof v === "string") return v
  if (typeof v !== "object") return ""
  const o = v as Record<string, unknown>
  for (const k of ["src", "url"]) if (typeof o[k] === "string" && o[k]) return o[k] as string
  for (const k of ["preview_image", "featured_image", "featured_media", "image"]) {
    const inner = o[k]
    if (inner && inner !== v) {
      const s = imageSrc(inner)
      if (s) return s
    }
  }
  if (typeof o[OUTPUT] === "string") return o[OUTPUT] as string
  return ""
}

function sized(src: string, width: unknown, height?: unknown): string {
  if (!src) return ""
  const w = Math.trunc(num(width))
  const h = Math.trunc(num(height))
  const want = w || h
  if (!want) return src
  /* An SVG or a GIF goes as it is: the optimizer refuses the one and stills the other. */
  if (/\.(svg|gif)(?:[?#]|$)/i.test(src)) return src
  /* Storelib's optimizer sizes by width; a height alone asks for that many pixels across, at most.
     75 is a quality next.config.mjs serves: any other is a 400, not a picture. */
  try {
    return optimizedImageUrl(src, Math.min(3840, Math.max(16, w || h)), 75)
  } catch {
    return src
  }
}

function imageAttrs(v: unknown): { width?: number; height?: number; alt?: string } {
  if (!v || typeof v !== "object") return {}
  const o = v as Record<string, unknown>
  const img = (o.preview_image as Record<string, unknown>) ?? (o.featured_image as Record<string, unknown>) ?? o
  return { width: typeof img.width === "number" ? img.width : undefined, height: typeof img.height === "number" ? img.height : undefined, alt: typeof img.alt === "string" ? img.alt : undefined }
}

const IMAGE_TAG_KEYS = new Set(["widths", "sizes", "preload", "alt", "class", "loading", "fetchpriority", "decoding", "width", "height", "style", "id", "role", "srcset", "data"])

function imageTag(input: unknown, kwargs: Record<string, unknown>): string {
  const src = typeof input === "string" ? input : imageSrc(input)
  if (!src) return ""
  const meta = imageAttrs(input)
  const widthsRaw = kwargs.widths !== undefined ? str(kwargs.widths) : ""
  const widths = widthsRaw ? widthsRaw.split(",").map((x) => Math.trunc(Number(x.trim()))).filter((x) => x > 0) : [352, 832, 1200, 1600, 2400]
  const base = src
  const srcset = kwargs.srcset === null ? "" : widths.map((w) => `${sized(base, w)} ${w}w`).join(", ")
  const parts = [`src="${attr(src)}"`]
  if (srcset) parts.push(`srcset="${attr(srcset)}"`)
  const alt = kwargs.alt !== undefined ? str(kwargs.alt) : meta.alt ?? ""
  parts.push(`alt="${attr(alt)}"`)
  const w = kwargs.width !== undefined ? kwargs.width : meta.width
  const h = kwargs.height !== undefined ? kwargs.height : meta.height
  if (w !== undefined && w !== null && str(w) !== "") parts.push(`width="${attr(w)}"`)
  if (h !== undefined && h !== null && str(h) !== "") parts.push(`height="${attr(h)}"`)
  if (kwargs.preload === true) parts.push(`fetchpriority="high"`)
  for (const [k, v] of Object.entries(kwargs)) {
    if (["widths", "preload", "alt", "width", "height", "srcset"].includes(k)) continue
    if (v === null || v === undefined || v === false) continue
    const name = k.replace(/_/g, "-")
    if (!/^[a-z][a-z0-9-]*$/i.test(name) || /^on/i.test(name)) continue
    parts.push(v === true ? name : `${name}="${attr(v)}"`)
    void IMAGE_TAG_KEYS
  }
  if (kwargs.loading === undefined && kwargs.preload !== true) parts.push(`loading="lazy"`)
  return `<img ${parts.join(" ")}>`
}

// ── Money ────────────────────────────────────────────────────────────────────

function cents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const t = v.trim()
    if (/^-?\d+$/.test(t)) return Number(t)
    /* A formatted price ("$48.00") read back into cents. */
    const m = t.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "")
    const n = Number(m.replace(",", "."))
    return Number.isFinite(n) ? Math.round(n * 100) : null
  }
  if (typeof v === "object" && (v as Record<string, unknown>)[OUTPUT] !== undefined) return cents((v as Record<string, unknown>)[OUTPUT])
  return null
}

function delimit(n: string, thousands: string): string {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, thousands)
}

export function formatMoney(amountCents: number, format: string): string {
  const value = amountCents / 100
  const fixed = (d: number) => value.toFixed(d)
  return format.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    switch (key) {
      case "amount": { const [i, f] = fixed(2).split("."); return `${delimit(i, ",")}.${f}` }
      case "amount_no_decimals": return delimit(fixed(0), ",")
      case "amount_with_comma_separator": { const [i, f] = fixed(2).split("."); return `${delimit(i, ".")},${f}` }
      case "amount_no_decimals_with_comma_separator": return delimit(fixed(0), ".")
      case "amount_with_apostrophe_separator": { const [i, f] = fixed(2).split("."); return `${delimit(i, "'")}.${f}` }
      case "amount_no_decimals_with_space_separator": return delimit(fixed(0), " ")
      case "amount_with_space_separator": { const [i, f] = fixed(2).split("."); return `${delimit(i, " ")},${f}` }
      case "amount_with_period_and_space_separator": { const [i, f] = fixed(2).split("."); return `${delimit(i, " ")}.${f}` }
      default: return ""
    }
  })
}

// ── Colours ──────────────────────────────────────────────────────────────────

type RGBA = { r: number; g: number; b: number; a: number }

export function parseColor(v: unknown): RGBA | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.red === "number") return { r: o.red as number, g: o.green as number, b: o.blue as number, a: typeof o.alpha === "number" ? (o.alpha as number) : 1 }
    return parseColor(o[OUTPUT])
  }
  const s = str(v).trim().toLowerCase()
  if (!s) return null
  let m = s.match(/^#?([0-9a-f]{3,8})$/)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("")
    if (h.length !== 6 && h.length !== 8) return null
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1 }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    const { r, g, b } = hslToRgb(+m[1], +m[2], +m[3])
    return { r, g, b, a: m[4] ? (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : +m[4]) : 1 }
  }
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
  return null
}

function rgbToHsl({ r, g, b }: RGBA): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  h *= 60
  return { h, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const S = s / 100, L = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = S * Math.min(L, 1 - L)
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) }
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")
export const toHex = (c: RGBA) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`
const toRgbString = (c: RGBA) => (c.a < 1 ? `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(2)})` : `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`)
const brightness = (c: RGBA) => (c.r * 299 + c.g * 587 + c.b * 114) / 1000

/** Answer a colour the way it came in: hex in, hex out; rgb in, rgb out. */
function sameForm(input: unknown, c: RGBA): string {
  const s = str(input).trim().toLowerCase()
  if (s.startsWith("rgb")) return toRgbString(c)
  if (s.startsWith("hsl")) { const { h, s: S, l } = rgbToHsl(c); return c.a < 1 ? `hsla(${Math.round(h)}, ${Math.round(S)}%, ${Math.round(l)}%, ${+c.a.toFixed(2)})` : `hsl(${Math.round(h)}, ${Math.round(S)}%, ${Math.round(l)}%)` }
  return c.a < 1 ? toRgbString(c) : toHex(c)
}

function adjustL(input: unknown, by: number): string {
  const c = parseColor(input)
  if (!c) return str(input)
  const { h, s, l } = rgbToHsl(c)
  const rgb = hslToRgb(h, s, Math.max(0, Math.min(100, l + by)))
  return sameForm(input, { ...rgb, a: c.a })
}
function adjustS(input: unknown, by: number): string {
  const c = parseColor(input)
  if (!c) return str(input)
  const { h, s, l } = rgbToHsl(c)
  const rgb = hslToRgb(h, Math.max(0, Math.min(100, s + by)), l)
  return sameForm(input, { ...rgb, a: c.a })
}
function luminance(c: RGBA): number {
  const ch = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b)
}

// ── Fonts ────────────────────────────────────────────────────────────────────

/** A font object, as a font_picker setting holds it: built by ./objects.ts fontObject. */
function fontOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && typeof (v as Record<string, unknown>).family === "string" ? (v as Record<string, unknown>) : null
}

function googleFontUrl(family: string, weight: string, style: string): string {
  const ital = style === "italic" ? 1 : 0
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${ital},${weight || 400}&display=swap`
}

// ── Dates ────────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  const s = str(v).trim()
  if (!s) return null
  if (s === "now" || s === "today") return new Date()
  if (/^\d+$/.test(s)) return new Date(Number(s) * 1000)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function strftime(d: Date, fmt: string): string {
  const pad = (n: number, w = 2, c = "0") => String(n).padStart(w, c)
  return fmt.replace(/%([-_0^#]?)([a-zA-Z%])/g, (_, flag: string, code: string) => {
    const nopad = flag === "-"
    const p = (n: number, w = 2) => (nopad ? String(n) : pad(n, w))
    switch (code) {
      case "Y": return String(d.getUTCFullYear())
      case "y": return p(d.getUTCFullYear() % 100)
      case "m": return p(d.getUTCMonth() + 1)
      case "d": return p(d.getUTCDate())
      case "e": return nopad ? String(d.getUTCDate()) : pad(d.getUTCDate(), 2, " ")
      case "H": return p(d.getUTCHours())
      case "I": return p(d.getUTCHours() % 12 || 12)
      case "l": return String(d.getUTCHours() % 12 || 12)
      case "M": return p(d.getUTCMinutes())
      case "S": return p(d.getUTCSeconds())
      case "p": return d.getUTCHours() < 12 ? "AM" : "PM"
      case "P": return d.getUTCHours() < 12 ? "am" : "pm"
      case "A": return DAYS[d.getUTCDay()]
      case "a": return DAYS[d.getUTCDay()].slice(0, 3)
      case "B": return MONTHS[d.getUTCMonth()]
      case "b": case "h": return MONTHS[d.getUTCMonth()].slice(0, 3)
      case "j": { const start = Date.UTC(d.getUTCFullYear(), 0, 1); return p(Math.floor((d.getTime() - start) / 86400000) + 1, 3) }
      case "u": return String(d.getUTCDay() || 7)
      case "w": return String(d.getUTCDay())
      case "Z": return "UTC"
      case "z": return "+0000"
      case "s": return String(Math.floor(d.getTime() / 1000))
      case "F": return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
      case "T": return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
      case "D": case "x": return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCFullYear() % 100)}`
      case "c": return d.toUTCString()
      case "%": return "%"
      default: return `%${code}`
    }
  })
}

// ── Translations ─────────────────────────────────────────────────────────────

function translate(ctx: Ctx, key: string, vars: Record<string, unknown>): string {
  const t = reg(ctx).translate
  let v = t ? t(key) : null
  if (v && typeof v === "object") {
    const count = num(vars.count)
    const forms = v as Record<string, unknown>
    v = (count === 0 && forms.zero) || (count === 1 && forms.one) || forms.other || forms.one || ""
  }
  if (typeof v !== "string") {
    /* A missing key prints its last part made readable, never "translation missing". */
    const last = key.split(".").pop() ?? key
    return last.replace(/_html$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  }
  /* A name the call does not pass stays as written, as on Shopify: a theme's script fills `{{ amount }}` in later. */
  const out = v.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, name: string) => (name in vars ? str(vars[name]) : all))
  /*
    AS SHOPIFY DOES: a translation is HTML escaped unless its key ends in
    _html. A theme that writes markup into a plain key and prints it into an
    attribute (data-text="{{ 'cart.free_shipping' | t }}", read back by its
    script) relies on it; unescaped, the key's own quotes ended the attribute
    and the rest of the tag showed on the page as text.
  */
  return /_html$/.test(key) ? out : out.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// ── Lists ────────────────────────────────────────────────────────────────────

function byPath(item: unknown, path: string): unknown {
  let v = item
  for (const k of path.split(".")) v = prop(v, k)
  return v
}

function sortValues(a: unknown, b: unknown, natural: boolean): number {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  const x = natural ? str(a).toLowerCase() : str(a)
  const y = natural ? str(b).toLowerCase() : str(b)
  return x < y ? -1 : x > y ? 1 : 0
}

// ── The filters ──────────────────────────────────────────────────────────────

const F: Record<string, FilterFn> = {
  /* Strings */
  append: (v, [a]) => str(v) + str(a),
  prepend: (v, [a]) => str(a) + str(v),
  capitalize: (v) => { const s = str(v); return s.charAt(0).toUpperCase() + s.slice(1) },
  downcase: (v) => str(v).toLowerCase(),
  upcase: (v) => str(v).toUpperCase(),
  strip: (v) => str(v).trim(),
  lstrip: (v) => str(v).replace(/^\s+/, ""),
  rstrip: (v) => str(v).replace(/\s+$/, ""),
  strip_html: (v) => str(v).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, "").replace(/<[^>]*>/g, ""),
  strip_newlines: (v) => str(v).replace(/\r?\n/g, ""),
  newline_to_br: (v) => str(v).replace(/\r?\n/g, "<br />\n"),
  escape: (v) => (v === null || v === undefined ? "" : escapeHtml(str(v))),
  escape_once: (v) => escapeOnce(str(v)),
  url_encode: (v) => encodeURIComponent(str(v)).replace(/%20/g, "+"),
  url_decode: (v) => { try { return decodeURIComponent(str(v).replace(/\+/g, " ")) } catch { return str(v) } },
  url_escape: (v) => encodeURI(str(v)),
  url_param_escape: (v) => encodeURIComponent(str(v)),
  remove: (v, [a]) => str(v).split(str(a)).join(""),
  remove_first: (v, [a]) => str(v).replace(str(a), ""),
  remove_last: (v, [a]) => { const s = str(v), x = str(a), i = s.lastIndexOf(x); return i < 0 || !x ? s : s.slice(0, i) + s.slice(i + x.length) },
  replace: (v, [a, b]) => str(v).split(str(a)).join(str(b)),
  replace_first: (v, [a, b]) => str(v).replace(str(a), () => str(b)),
  replace_last: (v, [a, b]) => { const s = str(v), x = str(a), i = s.lastIndexOf(x); return i < 0 || !x ? s : s.slice(0, i) + str(b) + s.slice(i + x.length) },
  split: (v, [a]) => { const s = str(v); if (!s) return []; const parts = s.split(str(a)); while (parts.length && parts[parts.length - 1] === "") parts.pop(); return parts },
  slice: (v, [start, len]) => {
    const s = Math.trunc(num(start))
    const l = len === undefined ? 1 : Math.trunc(num(len))
    if (Array.isArray(v)) { const i = s < 0 ? v.length + s : s; return v.slice(i, i + l) }
    const t = str(v); const i = s < 0 ? t.length + s : s; return t.slice(i, i + l)
  },
  truncate: (v, [n, end]) => {
    const s = str(v), max = n === undefined ? 50 : Math.trunc(num(n)), e = end === undefined ? "..." : str(end)
    if (s.length <= max) return s
    return s.slice(0, Math.max(0, max - e.length)) + e
  },
  truncatewords: (v, [n, end]) => {
    const words = str(v).split(/\s+/).filter(Boolean), max = Math.max(1, n === undefined ? 15 : Math.trunc(num(n))), e = end === undefined ? "..." : str(end)
    return words.length <= max ? words.join(" ") : words.slice(0, max).join(" ") + e
  },
  handle: (v) => handleize(str(v)),
  handleize: (v) => handleize(str(v)),
  camelize: (v) => str(v).replace(/[-_\s]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toUpperCase()),
  pluralize: (v, [one, many]) => (num(v) === 1 ? str(one) : str(many)),
  md5: (v) => digest(str(v), 32),
  sha1: (v) => digest(str(v), 40),
  sha256: (v) => digest(str(v), 64),
  hmac_sha1: (v, [k]) => digest(str(k) + "\u0000" + str(v), 40),
  hmac_sha256: (v, [k]) => digest(str(k) + "\u0000" + str(v), 64),
  base64_encode: (v) => b64encode(str(v)),
  base64_decode: (v) => b64decode(str(v)),
  base64_url_safe_encode: (v) => b64encode(str(v), true),
  base64_url_safe_decode: (v) => b64decode(str(v), true),
  json: (v) => JSON.stringify(jsonSafe(v)).replace(/<\//g, "<\\/"),
  t: (v, _a, kw, ctx) => translate(ctx, str(v), kw),
  translate: (v, _a, kw, ctx) => translate(ctx, str(v), kw),
  highlight: (v, [terms]) => { const t = str(terms).trim(); if (!t) return str(v); const re = new RegExp(`(${t.split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi"); return str(v).replace(re, '<strong class="highlight">$1</strong>') },
  default: (v, [d], kw) => (kw.allow_false === true && v === false ? v : isBlank(v) ? d : v),

  /* Numbers */
  plus: (a, [b]) => arith(a, b, (x, y) => x + y),
  minus: (a, [b]) => arith(a, b, (x, y) => x - y),
  times: (a, [b]) => arith(a, b, (x, y) => x * y),
  divided_by: (a, [b]) => { const y = num(b); if (y === 0) return 0; return isInt(a) && isInt(b) ? Math.floor(num(a) / y) : flt(num(a) / y) },
  modulo: (a, [b]) => { const y = num(b); return y === 0 ? 0 : arith(a, b, (x, z) => x % z) },
  abs: (v) => Math.abs(num(v)),
  ceil: (v) => Math.ceil(num(v)),
  floor: (v) => Math.floor(num(v)),
  round: (v, [d]) => { const p = Math.pow(10, Math.trunc(num(d ?? 0))); const r = Math.round(num(v) * p) / p; return d === undefined ? Math.round(num(v)) : r },
  at_least: (v, [m]) => Math.max(num(v), num(m)),
  at_most: (v, [m]) => Math.min(num(v), num(m)),

  /* Lists */
  size: (v) => (typeof v === "string" || Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0),
  first: (v) => (Array.isArray(v) ? v[0] : typeof v === "string" ? v[0] : undefined),
  last: (v) => (Array.isArray(v) ? v[v.length - 1] : typeof v === "string" ? v[v.length - 1] : undefined),
  join: (v, [sep]) => toList(v).map(str).join(sep === undefined ? " " : str(sep)),
  reverse: (v) => [...toList(v)].reverse(),
  sort: (v, [key]) => [...toList(v)].sort((a, b) => sortValues(key === undefined ? a : byPath(a, str(key)), key === undefined ? b : byPath(b, str(key)), false)),
  sort_natural: (v, [key]) => [...toList(v)].sort((a, b) => sortValues(key === undefined ? a : byPath(a, str(key)), key === undefined ? b : byPath(b, str(key)), true)),
  uniq: (v, [key]) => { const seen = new Set<string>(); return toList(v).filter((x) => { const k = JSON.stringify(jsonSafe(key === undefined ? x : byPath(x, str(key)))); if (seen.has(k)) return false; seen.add(k); return true }) },
  compact: (v, [key]) => toList(v).filter((x) => (key === undefined ? x : byPath(x, str(key))) !== null && (key === undefined ? x : byPath(x, str(key))) !== undefined),
  concat: (v, [b]) => [...toList(v), ...toList(b)],
  map: (v, [key]) => toList(v).map((x) => byPath(x, str(key))).flatMap((x) => (Array.isArray(x) ? x : [x])),
  where: (v, [key, value]) => toList(v).filter((x) => { const got = byPath(x, str(key)); return value === undefined ? truthy(got) : got === value || str(got) === str(value) }),
  reject: (v, [key, value]) => toList(v).filter((x) => { const got = byPath(x, str(key)); return value === undefined ? !truthy(got) : !(got === value || str(got) === str(value)) }),
  find: (v, [key, value]) => toList(v).find((x) => { const got = byPath(x, str(key)); return got === value || str(got) === str(value) }),
  find_index: (v, [key, value]) => { const i = toList(v).findIndex((x) => { const got = byPath(x, str(key)); return got === value || str(got) === str(value) }); return i < 0 ? null : i },
  has: (v, [key, value]) => toList(v).some((x) => { const got = byPath(x, str(key)); return value === undefined ? truthy(got) : got === value || str(got) === str(value) }),
  sum: (v, [key]) => toList(v).reduce<number>((s, x) => s + num(key === undefined ? x : byPath(x, str(key))), 0),

  /* Dates */
  date: (v, [fmt], kw) => {
    const d = toDate(v)
    if (!d) return str(v)
    const f = fmt !== undefined ? str(fmt) : kw.format !== undefined ? ({ abbreviated_date: "%b %d, %Y", basic: "%m/%d/%Y", date: "%B %d, %Y", on_date: "on %B %d, %Y", month_day_year: "%B %d, %Y" } as Record<string, string>)[str(kw.format)] ?? "%B %d, %Y" : "%B %d, %Y"
    return strftime(d, f)
  },

  /* Money: amounts are cents, as on Shopify. */
  money: (v, _a, _k, ctx) => { const c = cents(v); return c === null ? "" : formatMoney(c, reg(ctx).moneyFormat ?? "${{amount}}") },
  money_with_currency: (v, _a, _k, ctx) => { const c = cents(v); const r = reg(ctx); return c === null ? "" : formatMoney(c, r.moneyWithCurrencyFormat ?? `${r.moneyFormat ?? "${{amount}}"} ${r.currency ?? "USD"}`) },
  money_without_currency: (v) => { const c = cents(v); return c === null ? "" : formatMoney(c, "{{amount}}") },
  money_without_trailing_zeros: (v, _a, _k, ctx) => { const c = cents(v); return c === null ? "" : formatMoney(c, reg(ctx).moneyFormat ?? "${{amount}}").replace(/[.,]00(?=\D*$)/, "") },
  money_amount: (v) => { const c = cents(v); return c === null ? "" : formatMoney(c, "{{amount}}") },
  /* "$4.00/100g": a unit price and what it is measured in. */
  unit_price_with_measurement: (v, [m], _k, ctx) => {
    const c = cents(v)
    if (c === null) return ""
    const price = formatMoney(c, reg(ctx).moneyFormat ?? "${{amount}}")
    const u = (m ?? {}) as Record<string, unknown>
    const value = Number(u.reference_value ?? 1)
    const unit = str(u.reference_unit ?? "")
    return unit ? `${price}/${value === 1 ? "" : value}${unit}` : price
  },
  /* A gift card code in groups of four. */
  format_code: (v) => str(v).replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 "),
  /* Instalment offers are Shopify Payments'; a Storelib checkout shows its own. */
  payment_terms: () => "",
  /* The deprecated currency picker an older theme's `{% form 'currency' %}` draws: the store's one currency, chosen. */
  currency_selector: (_v, _a, kw, ctx) => {
    const code = attr(reg(ctx).currency ?? "USD")
    const cls = kw.class ? ` class="${attr(str(kw.class))}"` : ""
    const id = kw.id ? ` id="${attr(str(kw.id))}"` : ""
    return `<select name="currency"${cls}${id}><option value="${code}" selected="selected">${code}</option></select>`
  },
  /* A theme block's style settings (Shopify's style.* panels) become classes there; a Storelib site has none to add. */
  class_list: () => "",
  /* The payload a theme hands its own analytics events, as JSON. */
  standard_event_data: (v, [_event], kw, ctx) => JSON.stringify(eventData(v, str(kw.context ?? ""), reg(ctx).currency ?? "USD")),

  /* Assets and URLs */
  asset_url: (v, _a, _k, ctx) => reg(ctx).assetUrl?.(str(v)) ?? `/theme-assets/${encodeURIComponent(str(v))}`,
  asset_img_url: (v, [size], _k, ctx) => sized(reg(ctx).assetUrl?.(str(v)) ?? "", String(size ?? "").split("x")[0]),
  /* Shopify's own helper scripts (option_selection.js, api.jquery.js...) are Storelib's (shopify-global-assets.ts). */
  global_asset_url: (v, _a, _k, ctx) => shopifyGlobalAssetUrl(str(v)) ?? reg(ctx).assetUrl?.(str(v)) ?? "",
  shopify_asset_url: (v, _a, _k, ctx) => shopifyGlobalAssetUrl(str(v)) ?? reg(ctx).assetUrl?.(str(v)) ?? "",
  file_url: (v, _a, _k, ctx) => reg(ctx).fileUrl?.(str(v)) ?? "",
  file_img_url: (v, [size], _k, ctx) => sized(reg(ctx).fileUrl?.(str(v)) ?? "", String(size ?? "").split("x")[0]),
  image_url: (v, _a, kw) => sized(imageSrc(v), kw.width, kw.height),
  img_url: (v, [size]) => { const s = str(size); const w = s === "master" ? 0 : Number(s.split("x")[0]) || (s.startsWith("x") ? Number(s.slice(1)) : 0); return sized(imageSrc(v), w) },
  product_img_url: (v, [size]) => sized(imageSrc(v), String(size ?? "").split("x")[0]),
  collection_img_url: (v, [size]) => sized(imageSrc(v), String(size ?? "").split("x")[0]),
  article_img_url: (v, [size]) => sized(imageSrc(v), String(size ?? "").split("x")[0]),
  within: (v, [collection]) => { const c = collection as Record<string, unknown> | undefined; const u = str(v); return c && typeof c.url === "string" && u.startsWith("/products/") ? `${c.url}${u}` : u },
  url_for_type: (v) => `/collections/types?q=${encodeURIComponent(str(v))}`,
  url_for_vendor: (v) => `/collections/vendors?q=${encodeURIComponent(str(v))}`,
  link_to: (v, [url, title]) => `<a href="${attr(url)}"${title ? ` title="${attr(title)}"` : ""}>${str(v)}</a>`,
  link_to_type: (v) => `<a href="/collections/types?q=${encodeURIComponent(str(v))}" title="${attr(v)}">${str(v)}</a>`,
  link_to_vendor: (v) => `<a href="/collections/vendors?q=${encodeURIComponent(str(v))}" title="${attr(v)}">${str(v)}</a>`,
  sort_by: (v, [sort]) => { const u = str(v); const sep = u.includes("?") ? "&" : "?"; return `${u}${sep}sort_by=${encodeURIComponent(str(sort))}` },
  customer_login_link: (v) => `<a href="/account/login" id="customer_login_link">${str(v)}</a>`,
  customer_logout_link: (v) => `<a href="/account/logout" id="customer_logout_link">${str(v)}</a>`,
  customer_register_link: (v) => `<a href="/account/register" id="customer_register_link">${str(v)}</a>`,

  /* HTML */
  image_tag: (v, _a, kw) => imageTag(v, kw),
  img_tag: (v, [alt, cls]) => { const s = imageSrc(v); return s ? `<img src="${attr(s)}" alt="${attr(alt ?? "")}"${cls ? ` class="${attr(cls)}"` : ""}>` : "" },
  stylesheet_tag: (v, _a, kw) => `<link href="${attr(v)}" rel="stylesheet" type="text/css" media="${attr(kw.media ?? "all")}"${kw.preload ? ` fetchpriority="high"` : ""}>`,
  script_tag: (v) => `<script src="${attr(v)}" type="text/javascript"></script>`,
  preload_tag: (v, _a, kw) => `<link href="${attr(v)}" rel="preload" as="${attr(kw.as ?? "script")}"${kw.type ? ` type="${attr(kw.type)}"` : ""}${kw.crossorigin ? " crossorigin" : ""}>`,
  inline_asset_content: (v, _a, _k, ctx) => reg(ctx).assetText?.(str(v)) ?? "",
  placeholder_svg_tag: (v, [cls]) => placeholderSvg(str(v), cls === undefined ? "" : str(cls)),
  time_tag: (v, [fmt], kw) => { const d = toDate(v); if (!d) return ""; const f = fmt !== undefined ? str(fmt) : "%B %d, %Y"; return `<time datetime="${d.toISOString().replace(/\.\d{3}Z$/, "Z")}">${strftime(d, f)}</time>`; void kw },
  video_tag: (v, _a, kw) => videoTag(v, kw),
  media_tag: (v, _a, kw) => { const o = v as Record<string, unknown> | null; const type = str(o?.media_type); if (type === "video") return videoTag(v, kw); if (type === "external_video") return externalVideo(v, kw); return imageTag(o?.preview_image ?? v, kw) },
  external_video_tag: (v, _a, kw) => externalVideo(v, kw),
  external_video_url: (v) => externalVideoUrl(v),
  model_viewer_tag: (v, _a, kw) => imageTag((v as Record<string, unknown>)?.preview_image ?? v, kw),
  structured_data: () => "",
  default_errors: (v) => { const messages = v && typeof v === "object" && (v as Record<string, unknown>).messages && typeof (v as Record<string, unknown>).messages === "object" ? ((v as Record<string, unknown>).messages as Record<string, unknown>) : null; const msgs = toList(v).map((x) => (messages && messages[str(x)] !== undefined ? str(messages[str(x)]) : str(x))).filter(Boolean); return msgs.length ? `<div class="errors"><ul>${msgs.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul></div>` : "" },
  default_pagination: (v) => defaultPagination(v),
  /* A card's mark as a picture (paymentMark below), for themes that use an <img> rather than inline SVG. */
  payment_type_img_url: (v) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(paymentMark(str(v), ""))}`,
  payment_type_svg_tag: (v, _args, named) => paymentMark(str(v), str((named as Record<string, unknown> | undefined)?.class) || "icon icon--full-color"),
  /*
    Shopify's "Buy it now", unbranded, as a store without express wallets
    shows it. It buys this item alone, straight to checkout, and leaves the
    cart as it was (the page's handler: shims.ts BUY_NOW; the site's:
    site.ts, a cart/add with `checkout`).
  */
  /*
    BUY IT NOW AS SHOPIFY DRAWS IT. Shopify puts its own few rules on the
    page with this button: the button is a block as wide as the row, the
    unbranded one with its padding. Themes are written on top of those, so
    without them the button shrank to its words (a narrow box under the
    quantity). They come with it here, in :where() so they weigh nothing and
    every rule the theme writes for the button still wins.
  */
  payment_button: () =>
    `<style data-storelib-payment-button>:where(.shopify-payment-button){display:block;width:100%;flex:1 1 100%;grid-column:1/-1}:where(.shopify-payment-button__button){display:block;width:100%;box-sizing:border-box;cursor:pointer;line-height:1;text-align:center;border-radius:4px}:where(.shopify-payment-button__button--unbranded){padding:1em 2em;font-weight:500}</style><div class="shopify-payment-button" data-shopify="payment-button"><button type="submit" name="checkout" value="1" formnovalidate class="shopify-payment-button__button shopify-payment-button__button--unbranded" data-storelib-buy-now>Buy it now</button></div>`,
  login_button: () => "",
  avatar: () => "",
  format_address: (v) => { const o = (v ?? {}) as Record<string, unknown>; return ["name", "company", "address1", "address2", "city", "province", "zip", "country"].map((k) => str(o[k])).filter(Boolean).map(escapeHtml).join("<br>") },
  metafield_tag: (v) => escapeHtml(str((v as Record<string, unknown>)?.value ?? v)),
  metafield_text: (v) => str((v as Record<string, unknown>)?.value ?? v),
  weight_with_unit: (v, [unit]) => `${num(v)} ${str(unit) || "kg"}`,
  item_count_for_variant: (v, [id]) => { const items = toList((v as Record<string, unknown>)?.items); return items.filter((i) => str((i as Record<string, unknown>).variant_id) === str(id)).reduce<number>((s, i) => s + num((i as Record<string, unknown>).quantity), 0) },
  line_items_for: (v, [obj]) => { const items = toList((v as Record<string, unknown>)?.items); const id = str((obj as Record<string, unknown>)?.id); return items.filter((i) => str((i as Record<string, unknown>).product_id) === id || str((i as Record<string, unknown>).variant_id) === id) },
  link_to_tag: (v, [tag]) => `<a href="?tag=${encodeURIComponent(str(tag))}" title="${attr(tag)}">${str(v)}</a>`,
  link_to_add_tag: (v, [tag]) => `<a href="?tag=${encodeURIComponent(str(tag))}">${str(v)}</a>`,
  link_to_remove_tag: (v) => `<a href="?">${str(v)}</a>`,
  highlight_active_tag: (v) => str(v),

  /* Colours */
  color_to_rgb: (v) => { const c = parseColor(v); return c ? toRgbString(c) : str(v) },
  color_to_hex: (v) => { const c = parseColor(v); return c ? toHex(c) : str(v) },
  color_to_hsl: (v) => { const c = parseColor(v); if (!c) return str(v); const { h, s, l } = rgbToHsl(c); return c.a < 1 ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${+c.a.toFixed(2)})` : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)` },
  color_to_oklch: (v) => { const c = parseColor(v); return c ? toRgbString(c) : str(v) },
  color_extract: (v, [component]) => { const c = parseColor(v); if (!c) return 0; const k = str(component); if (k === "red") return c.r; if (k === "green") return c.g; if (k === "blue") return c.b; if (k === "alpha") return c.a; const hsl = rgbToHsl(c); if (k === "hue") return Math.round(hsl.h); if (k === "saturation") return Math.round(hsl.s); if (k === "lightness") return Math.round(hsl.l); return 0 },
  color_brightness: (v) => { const c = parseColor(v); return c ? Math.round(brightness(c) * 100) / 100 : 0 },
  color_lighten: (v, [p]) => adjustL(v, num(p)),
  color_darken: (v, [p]) => adjustL(v, -num(p)),
  color_saturate: (v, [p]) => adjustS(v, num(p)),
  color_desaturate: (v, [p]) => adjustS(v, -num(p)),
  color_modify: (v, [k, val]) => {
    const c = parseColor(v)
    if (!c) return str(v)
    const key = str(k)
    if (key === "alpha") return toRgbString({ ...c, a: Math.max(0, Math.min(1, num(val))) })
    if (key === "red" || key === "green" || key === "blue") return sameForm(v, { ...c, [key[0]]: Math.max(0, Math.min(255, num(val))) } as RGBA)
    const hsl = rgbToHsl(c)
    const next = { ...hsl, ...(key === "hue" ? { h: num(val) } : key === "saturation" ? { s: num(val) } : key === "lightness" ? { l: num(val) } : {}) }
    return sameForm(v, { ...hslToRgb(next.h, next.s, next.l), a: c.a })
  },
  color_mix: (v, [other, weight]) => {
    const a = parseColor(v), b = parseColor(other)
    if (!a || !b) return str(v)
    const w = Math.max(0, Math.min(100, num(weight ?? 50))) / 100
    return sameForm(v, { r: a.r * w + b.r * (1 - w), g: a.g * w + b.g * (1 - w), b: a.b * w + b.b * (1 - w), a: a.a * w + b.a * (1 - w) })
  },
  color_contrast: (v, [other]) => { const a = parseColor(v), b = parseColor(other); if (!a || !b) return 0; const la = luminance(a), lb = luminance(b); return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 10) / 10 },
  color_difference: (v, [other]) => { const a = parseColor(v), b = parseColor(other); if (!a || !b) return 0; return Math.round(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) },
  brightness_difference: (v, [other]) => { const a = parseColor(v), b = parseColor(other); if (!a || !b) return 0; return Math.round(Math.abs(brightness(a) - brightness(b))) },
  hex_to_rgba: (v, [alpha]) => { const c = parseColor(v); return c ? toRgbString({ ...c, a: alpha === undefined ? c.a : num(alpha) }) : str(v) },

  /* Fonts: from a public font library, by family; the face rules are written once for the page (./objects.ts). */
  font_face: (v, _a, kw) => {
    const f = fontOf(v)
    if (!f || f.system === true) return ""
    /* The page's head loads every font the theme's settings name (fontLinks); a face rule here would load it twice. */
    void kw
    return ""
  },
  font_url: (v) => { const f = fontOf(v); return f && f.system !== true ? googleFontUrl(str(f.family), str(f.weight), str(f.style)) : "" },
  font_modify: (v, [k, val]) => {
    const f = fontOf(v)
    if (!f) return v
    const key = str(k), want = str(val)
    if (key === "weight") {
      const cur = Number(f.weight) || 400
      const w = want === "bold" ? 700 : want === "normal" ? 400 : want === "bolder" ? Math.min(900, cur + 300) : want === "lighter" ? Math.max(100, cur - 300) : /^[+-]\d+$/.test(want) ? Math.max(100, Math.min(900, cur + Number(want))) : Number(want) || cur
      return { ...f, weight: String(w) }
    }
    if (key === "style") return { ...f, style: want === "oblique" ? "italic" : want }
    return f
  },
}

/** Values that can go to JSON: drops are plain objects already; functions and symbols fall away. */
function jsonSafe(v: unknown, depth = 0): unknown {
  if (depth > 8) return null
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.slice(0, 500).map((x) => jsonSafe(x, depth + 1))
  if (typeof v === "object") {
    const o: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k === OUTPUT || k.startsWith("__") || typeof val === "function") continue
      o[k] = jsonSafe(val, depth + 1)
    }
    return o
  }
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v
  return null
}

function videoTag(v: unknown, kw: Record<string, unknown>): string {
  const o = (v ?? {}) as Record<string, unknown>
  const sources = toList(o.sources)
  const src = sources.length ? str((sources[0] as Record<string, unknown>).url) : str(o.src ?? o.url ?? v)
  if (!src) return ""
  const flags = ["autoplay", "loop", "muted", "controls", "playsinline"].filter((k) => kw[k] === true).join(" ")
  const poster = imageSrc(o.preview_image)
  const extra = Object.entries(kw).filter(([k, val]) => !["autoplay", "loop", "muted", "controls", "playsinline", "image_size"].includes(k) && val !== null && val !== undefined && val !== false && /^[a-z][a-z0-9_-]*$/i.test(k) && !/^on/i.test(k)).map(([k, val]) => (val === true ? k.replace(/_/g, "-") : `${k.replace(/_/g, "-")}="${attr(val)}"`)).join(" ")
  return `<video ${flags}${poster ? ` poster="${attr(poster)}"` : ""}${extra ? ` ${extra}` : ""} preload="metadata"><source src="${attr(src)}" type="video/mp4"></video>`
}

function externalVideoUrl(v: unknown): string {
  const o = (v ?? {}) as Record<string, unknown>
  const host = str(o.host)
  const id = str(o.external_id ?? o.id)
  if (host === "youtube") return `https://www.youtube.com/embed/${encodeURIComponent(id)}`
  if (host === "vimeo") return `https://player.vimeo.com/video/${encodeURIComponent(id)}`
  return str(o.url ?? v)
}

function externalVideo(v: unknown, kw: Record<string, unknown>): string {
  const url = externalVideoUrl(v)
  if (!url) return ""
  const cls = kw.class ? ` class="${attr(kw.class)}"` : ""
  return `<iframe src="${attr(url)}"${cls} allow="autoplay; encrypted-media" allowfullscreen loading="lazy" title="${attr((v as Record<string, unknown>)?.alt ?? "Video")}"></iframe>`
}

function defaultPagination(v: unknown): string {
  const p = (v ?? {}) as Record<string, unknown>
  const parts = toList(p.parts)
  if (parts.length === 0) return ""
  const prev = p.previous as Record<string, unknown> | undefined
  const next = p.next as Record<string, unknown> | undefined
  const out: string[] = []
  if (prev?.url) out.push(`<span class="prev"><a href="${attr(prev.url)}">${escapeHtml(str(prev.title || "« Previous"))}</a></span>`)
  for (const part of parts) {
    const q = part as Record<string, unknown>
    if (q.is_link) out.push(`<span class="page"><a href="${attr(q.url)}">${escapeHtml(str(q.title))}</a></span>`)
    else out.push(`<span class="${str(q.title) === "…" ? "deco" : "page current"}">${escapeHtml(str(q.title))}</span>`)
  }
  if (next?.url) out.push(`<span class="next"><a href="${attr(next.url)}">${escapeHtml(str(next.title || "Next »"))}</a></span>`)
  return out.join(" ")
}

/** Shopify's placeholder pictures, drawn as simple outlines in the current colour. */
function placeholderSvg(name: string, cls: string): string {
  const c = cls ? ` class="${attr(cls)}"` : ""
  const label = escapeHtml(name.replace(/[-_]/g, " ").replace(/\d+$/, "").trim() || "image")
  if (/product|apparel|collection|image|lifestyle|hero|detailed/i.test(name) || true) {
    return `<svg${c} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 525.5 525.5" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label}"><rect width="525.5" height="525.5" fill="currentColor" opacity=".06"/><path d="M175 200h175v125H175z M200 300l35-45 30 35 25-25 35 35z" fill="none" stroke="currentColor" stroke-width="6" opacity=".35"/><circle cx="305" cy="235" r="14" fill="currentColor" opacity=".25"/></svg>`
  }
  return ""
}

/**
 * What `standard_event_data` describes: a product (with the variant chosen),
 * a collection or the cart, in the shape a theme's scripts read back from
 * `view-event-payload` (`payload.product.selectedVariant`).
 */
function eventData(v: unknown, context: string, currency: string): Record<string, unknown> {
  /* A string or a number (a theme's own guess at what to pass) is no event data, not an error. */
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const money = (c: unknown) => ({ amount: (Number(c) || 0) / 100, currencyCode: currency })
  const image = (x: unknown) => { const src = imageSrc(x); return src ? { url: src } : null }
  if (Array.isArray(o.items) && "item_count" in o) {
    return {
      cart: {
        totalQuantity: Number(o.item_count) || 0,
        cost: { totalAmount: money(o.total_price), subtotalAmount: money(o.items_subtotal_price ?? o.total_price) },
        lines: (o.items as Record<string, unknown>[]).map((l) => ({ id: str(l.key), quantity: Number(l.quantity) || 0, cost: { totalAmount: money(l.final_line_price) }, merchandise: { id: str(l.variant_id), title: str(l.variant_title), product: { id: str(l.product_id), title: str(l.product_title) } } })),
      },
      context,
    }
  }
  if ("products_count" in o || o.object_type === "collection") {
    return { collection: { id: str(o.id), title: str(o.title), handle: str(o.handle) }, context }
  }
  const variant = (o.selected_or_first_available_variant ?? null) as Record<string, unknown> | null
  return {
    product: {
      id: str(o.id),
      title: str(o.title),
      handle: str(o.handle),
      vendor: str(o.vendor),
      type: str(o.type),
      url: str(o.url),
      selectedVariant: variant
        ? { id: str(variant.id), title: str(variant.title), sku: str(variant.sku), available: variant.available === true, price: money(variant.price), image: image(variant.featured_image ?? o.featured_image) }
        : null,
    },
    context,
  }
}

/** Every filter the profile has, Liquid's and Shopify's. */
export const COMPAT_FILTERS: Readonly<Record<string, FilterFn>> = F

export function compatFilter(name: string): FilterFn | undefined {
  return Object.prototype.hasOwnProperty.call(F, name) ? F[name] : undefined
}

/**
 * A payment method's mark, the way a footer's row of card logos shows it:
 * a 38 by 24 card with a hairline and the brand's own colours, drawn here so
 * nothing is fetched from Shopify. The common ones are drawn; anything else
 * is its name on the same card.
 */
/*
 * Each mark fits its 38 by 24 card whatever font the visitor has: words are
 * held to a width (textLength), so "Apple Pay" never runs out of its box.
 */
const word = (x: number, y: number, size: number, width: number, fill: string, text: string, extra = "") =>
  `<text x="${x}" y="${y}" font-family="Helvetica,Arial,sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="${fill}"${extra}>${text}</text>`
const APPLE = '<path transform="translate(5.2 5.6) scale(.5)" fill="#000" d="M15.6 13.2c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.7-1-2.7-4.1zM13.1 5.6c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.2 1.2.1 2.3-.6 3-1.5z"/>'
const PAYMENT_MARKS: Record<string, string> = {
  visa: word(19, 15.8, 10, 25, "#1A1F71", "VISA", ' font-style="italic"'),
  master: '<circle cx="15.5" cy="12" r="6.5" fill="#EB001B"/><circle cx="22.5" cy="12" r="6.5" fill="#F79E1B"/><path d="M19 6.5a6.5 6.5 0 0 1 0 11a6.5 6.5 0 0 1 0-11z" fill="#FF5F00"/>',
  american_express: `<rect x="1" y="1" width="36" height="22" rx="2" fill="#2E77BC"/>${word(19, 15.4, 8, 26, "#fff", "AMEX")}`,
  apple_pay: `${APPLE}${word(23.5, 15.6, 9, 15, "#000", "Pay", ' font-weight="600"')}`,
  google_pay: `<text x="19" y="15.6" font-family="Helvetica,Arial,sans-serif" font-size="9" font-weight="600" text-anchor="middle" textLength="25" lengthAdjust="spacingAndGlyphs"><tspan fill="#4285F4">G</tspan><tspan fill="#5F6368"> Pay</tspan></text>`,
  paypal: `<text x="19" y="15.6" font-family="Helvetica,Arial,sans-serif" font-size="9" font-weight="700" font-style="italic" text-anchor="middle" textLength="28" lengthAdjust="spacingAndGlyphs"><tspan fill="#003087">Pay</tspan><tspan fill="#009CDE">Pal</tspan></text>`,
  shopify_pay: `<rect x="1" y="1" width="36" height="22" rx="2" fill="#5A31F4"/>${word(19, 15.4, 8.5, 26, "#fff", "shop Pay")}`,
  discover: `${word(16.5, 14.8, 6.5, 24, "#231F20", "DISCOVER")}<circle cx="32" cy="12" r="2.6" fill="#F48120"/>`,
  maestro: '<circle cx="15.5" cy="12" r="6.5" fill="#0099DF"/><circle cx="22.5" cy="12" r="6.5" fill="#EB001B"/><path d="M19 6.5a6.5 6.5 0 0 1 0 11a6.5 6.5 0 0 1 0-11z" fill="#6C6BBD"/>',
  diners_club: `<circle cx="19" cy="12" r="7.5" fill="none" stroke="#0079BE" stroke-width="2"/>${word(19, 14.4, 6, 9, "#0079BE", "DC")}`,
  jcb: `<rect x="7" y="5" width="7.5" height="14" rx="2" fill="#0E4C96"/><rect x="15.25" y="5" width="7.5" height="14" rx="2" fill="#E21836"/><rect x="23.5" y="5" width="7.5" height="14" rx="2" fill="#00A651"/>${word(19, 14.6, 6.5, 20, "#fff", "JCB")}`,
  unionpay: `<rect x="5" y="4" width="10" height="16" rx="1.5" fill="#E21836"/><rect x="14" y="4" width="10" height="16" rx="1.5" fill="#00447C"/><rect x="23" y="4" width="10" height="16" rx="1.5" fill="#007B84"/>${word(19, 14.4, 5.5, 24, "#fff", "UnionPay")}`,
  klarna: `<rect x="1" y="1" width="36" height="22" rx="2" fill="#FFB3C7"/>${word(19, 15.4, 8.5, 26, "#0A0B09", "Klarna.")}`,
  afterpay: `<rect x="1" y="1" width="36" height="22" rx="2" fill="#B2FCE4"/>${word(19, 15, 7, 28, "#000", "afterpay")}`,
  venmo: word(19, 15.6, 9, 26, "#3D95CE", "venmo", ' font-style="italic"'),
  amazon: word(19, 15, 8.5, 26, "#000", "amazon"),
  meta_pay: word(19, 15.6, 8.5, 26, "#0866FF", "Meta Pay"),
  ideal: word(19, 15.6, 8.5, 22, "#CC0066", "iDEAL"),
  bancontact: word(19, 15, 6, 28, "#005498", "Bancontact"),
}

function paymentMark(type: string, cls: string): string {
  const raw = type.toLowerCase().replace(/[\s-]+/g, "_")
  /* Shopify's other names for the same marks. */
  const key = ({ shop_pay: "shopify_pay", mastercard: "master", amex: "american_express", union_pay: "unionpay", diners: "diners_club", googlepay: "google_pay", applepay: "apple_pay", facebook_pay: "meta_pay" } as Record<string, string>)[raw] ?? raw
  const label = key.replace(/_/g, " ")
  const inner = PAYMENT_MARKS[key] ?? word(19, 15, 6.5, Math.min(30, 3.2 * Math.min(12, label.length)), "#333", escapeHtml(label.slice(0, 12)))
  return `<svg${cls ? ` class="${attr(cls)}"` : ""} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 38 24" width="38" height="24" role="img" aria-label="${attr(label)}"><rect x="0.5" y="0.5" width="37" height="23" rx="3" fill="#fff" stroke="#000" stroke-opacity=".07"/>${inner}</svg>`
}
