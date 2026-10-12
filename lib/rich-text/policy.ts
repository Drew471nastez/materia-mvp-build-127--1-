/**
 * ===========================================================================
 *  WHAT A PRODUCT DESCRIPTION MAY CONTAIN
 * ===========================================================================
 * One list, read by two engines:
 *
 *   lib/rich-text/html.ts      the browser's side and the renderer's: the
 *                              editor loads through it, a paste is cleaned
 *                              by it, and RichDescriptionContent renders
 *                              through it on the server and again on
 *                              hydration, with the same output both times.
 *   lib/rich-text/sanitize.ts  the server's side: sanitize-html, configured
 *                              from these same constants, on every save and
 *                              on every read of a published product.
 *
 * WHY THE LIST IS WIDER THAN THE TOOLBAR. The toolbar writes paragraphs,
 * two heading levels, bold, italic, underline, strike, two kinds of list, a
 * quote, a link and a rule. The editor this one replaced also wrote images
 * (inline, as data: URLs), YouTube and X embeds, coloured buttons and
 * aligned text, and descriptions saved with those still have to render the
 * way they did. So those shapes are allowed, narrowly: an iframe only from
 * YouTube or Vimeo, a style only with the declarations those shapes used.
 * Nothing on the list can run code, fetch through CSS, or move itself on top
 * of the page.
 */
import { msg, tt, type Vars } from "@/lib/i18n/text"

/** Tags a stored description keeps. Everything else is unwrapped or dropped. */
export const STORED_TAGS = new Set([
  "p", "br", "hr", "div", "span",
  "h1", "h2", "h3", "h4",
  "strong", "b", "em", "i", "u", "s",
  "sub", "sup", "small", "mark", "code", "pre",
  "blockquote", "ul", "ol", "li", "dl", "dt", "dd",
  "a", "img", "figure", "figcaption", "iframe",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
])

/** Renamed on the way through, so the list above stays short. */
export const TAG_ALIASES: Record<string, string> = {
  h5: "h4",
  h6: "h4",
  strike: "s",
  del: "s",
  ins: "u",
}

/**
 * Removed WITH their content. Everything else that is not allowed is
 * unwrapped, so its text survives; these have text that is code (script,
 * style), chrome (button, select) or nothing a reader should see (head).
 */
export const DROPPED_TAGS = new Set([
  "script", "style", "title", "head", "meta", "link", "base", "template", "noscript",
  "object", "embed", "applet", "param", "frame", "frameset", "noframes",
  "svg", "math", "canvas", "video", "audio", "source", "track", "picture",
  "button", "input", "select", "option", "optgroup", "textarea", "datalist", "output", "progress", "meter",
  "dialog", "portal", "xml",
])

/** Tags that never have content. */
export const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "keygen"])

/** Attributes per tag. `style` is filtered declaration by declaration below. */
export const STORED_ATTRIBUTES: Record<string, string[]> = {
  a: ["href", "title", "style"],
  /* `style` survives only on an old editor's picture; see safeImageSrc. */
  img: ["src", "alt", "width", "height", "loading", "style", "data-align"],
  iframe: ["src", "title", "allow", "allowfullscreen", "loading", "frameborder", "width", "height"],
  div: ["data-embed-type", "data-image-size", "data-x-url", "class", "style", "dir"],
  span: ["style"],
  blockquote: ["class", "data-dnt", "data-theme", "style", "dir"],
  p: ["style", "dir"],
  h1: ["style", "dir"],
  h2: ["style", "dir"],
  h3: ["style", "dir"],
  h4: ["style", "dir"],
  li: ["style", "dir"],
  ul: ["dir"],
  ol: ["start", "dir"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  col: ["span"],
}

/** The only classes kept: the legacy embed wrappers and the X embed's own. */
export const STORED_CLASSES: Record<string, string[]> = {
  div: ["embed-container", "x-embed-container"],
  blockquote: ["twitter-tweet"],
}

/** Attribute values that are a fixed vocabulary. */
export const ATTRIBUTE_VALUES: Record<string, RegExp> = {
  "data-embed-type": /^(image|youtube|youtube-thumbnail|x-post)$/,
  "data-image-size": /^(cover|contain|wide|portrait|square|standard)$/,
  "data-x-url": /^https:\/\/(www\.)?(twitter\.com|x\.com)\/[\w/?=&.-]{1,300}$/,
  "data-dnt": /^(true|false)$/,
  /* Where a picture sits in the text: see pictureStyle below. */
  "data-align": /^(left|center|right)$/,
  "data-theme": /^(light|dark)$/,
  dir: /^(ltr|rtl|auto)$/,
  start: /^\d{1,5}$/,
  colspan: /^\d{1,3}$/,
  rowspan: /^\d{1,3}$/,
  span: /^\d{1,3}$/,
  scope: /^(row|col|rowgroup|colgroup)$/,
  width: /^\d{1,4}%?$/,
  height: /^\d{1,4}%?$/,
  loading: /^(lazy|eager)$/,
  frameborder: /^\d$/,
  allowfullscreen: /^(|true|allowfullscreen)$/,
  allow: /^[a-z\- ;]{1,200}$/,
}

// ---------------------------------------------------------------------------
//  STYLE, ONE DECLARATION AT A TIME
// ---------------------------------------------------------------------------

const LENGTH = /^(0|\d{1,4}(\.\d{1,3})?(px|em|rem|%))$/
const LENGTHS = /^(0|\d{1,4}(\.\d{1,3})?(px|em|rem|%))(\s+(0|\d{1,4}(\.\d{1,3})?(px|em|rem|%))){0,3}$/
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d{1,3}))?\s*\)|[a-z]{3,20})$/i
const ALIGN = /^(left|right|center|justify|start|end)$/

const ALIGN_ONLY: Record<string, RegExp> = { "text-align": ALIGN }

/**
 * The declarations each tag may keep. `a` and `span` keep theirs only when
 * they are drawn as a button (see isButtonShaped); a colour on ordinary text
 * is dropped, because it was the editor's colour, not the creator's, and it
 * reads wrong on a page with its own scheme.
 */
export const STYLE_RULES: Record<string, Record<string, RegExp>> = {
  p: ALIGN_ONLY,
  h1: ALIGN_ONLY,
  h2: ALIGN_ONLY,
  h3: ALIGN_ONLY,
  h4: ALIGN_ONLY,
  li: ALIGN_ONLY,
  div: ALIGN_ONLY,
  blockquote: ALIGN_ONLY,
  a: BUTTON_RULES(),
  span: BUTTON_RULES(),
  img: {
    "max-width": LENGTH,
    width: LENGTH,
    height: /^(auto|0|\d{1,4}(\.\d{1,3})?(px|em|rem|%))$/,
    "aspect-ratio": /^(auto|\d{1,2}\s*\/\s*\d{1,2})$/,
    "object-fit": /^(cover|contain)$/,
    "border-radius": LENGTHS,
    display: /^(block|inline-block)$/,
  },
}

function BUTTON_RULES(): Record<string, RegExp> {
  return {
    display: /^(inline-block|block)$/,
    padding: LENGTHS,
    "background-color": COLOR,
    color: COLOR,
    "border-radius": LENGTHS,
    "font-weight": /^(normal|bold|[1-9]00)$/,
    "text-decoration": /^(none|underline)$/,
  }
}

/**
 * A PICTURE'S OWN SIZE AND SHAPE, as the description field sets them: how
 * wide it is (a share of the text's width, 10% to 100%), the shape it is cut
 * to (an aspect ratio, filled with object-fit: cover) and nothing else. Its
 * place (left, centre, right) is `data-align`, drawn by .storelib-prose.
 *
 * Rebuilt from the numbers, never passed through: whatever else a style
 * says is dropped, and a value outside these shapes is dropped too. Used by
 * the browser's cleaner (lib/rich-text/html.ts) and the server's
 * (lib/rich-text/sanitize.ts), so both keep exactly the same thing.
 */
export function pictureStyle(style: string): string {
  const decls = new Map(parseStyle(style))
  const out: string[] = []
  const width = /^(\d{1,3})(\.\d+)?%$/.exec(decls.get("width") ?? "")
  if (width) {
    const pct = Math.round(Number(width[1] + (width[2] ?? "")))
    if (pct >= 10 && pct < 100) out.push(`width: ${pct}%`)
  }
  const ratio = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(decls.get("aspect-ratio") ?? "")
  if (ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0) {
    out.push(`aspect-ratio: ${Number(ratio[1])} / ${Number(ratio[2])}`)
    out.push("object-fit: cover")
  }
  return out.join("; ")
}

/** `prop: value; prop: value` as pairs, lower-cased names, values trimmed. */
export function parseStyle(style: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const part of style.split(";")) {
    const colon = part.indexOf(":")
    if (colon < 1) continue
    const prop = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).replace(/!important/gi, "").trim()
    if (prop && value) out.push([prop, value])
  }
  return out
}

/** A legacy button: an inline block with padding and a fill. */
export function isButtonShaped(style: string): boolean {
  const decls = new Map(parseStyle(style))
  return /^inline-block$/i.test(decls.get("display") ?? "") && decls.has("padding") && decls.has("background-color")
}

/** The declarations of `style` that `tag` may keep, joined back up; "" when none. */
export function filterStyle(tag: string, style: string): string {
  const rules = STYLE_RULES[tag]
  if (!rules || !style) return ""
  if ((tag === "a" || tag === "span") && !isButtonShaped(style)) return ""
  const kept: string[] = []
  for (const [prop, value] of parseStyle(style)) {
    const rule = rules[prop]
    if (!rule) continue
    /* A backslash is a CSS escape and a comment can hide anything; neither
       is ever needed by the values above. */
    if (/[\\/*]/.test(value) && prop !== "aspect-ratio") continue
    if (/url\s*\(|expression|javascript/i.test(value)) continue
    if (rule.test(value)) kept.push(`${prop}: ${value}`)
  }
  return kept.join("; ")
}

// ---------------------------------------------------------------------------
//  ADDRESSES
// ---------------------------------------------------------------------------

/** What a browser ignores inside a URL, and so what an attacker hides a scheme with. */
const INVISIBLE = /[\u0000- \u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g

/**
 * A link a description may carry: http(s), mailto, tel, or a path on the
 * same site. Anything with another scheme (javascript:, data:, vbscript:,
 * file:) and anything protocol-relative (//evil.example) is refused.
 * Returns the address as it should be written, or null.
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > 2048) return null
  const probe = value.replace(INVISIBLE, "").toLowerCase()
  if (probe.startsWith("//") || probe.startsWith("\\\\") || probe.startsWith("/\\")) return null
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe)
  if (scheme) {
    if (scheme[1] === "http" || scheme[1] === "https") {
      try {
        const url = new URL(value)
        return url.hostname ? value : null
      } catch {
        return null
      }
    }
    if (scheme[1] === "mailto") return /^mailto:[^\s<>"]+@[^\s<>"]+$/i.test(value) ? value : null
    if (scheme[1] === "tel") return /^tel:\+?[\d\s().-]{3,32}$/i.test(value) ? value : null
    return null
  }
  /* No scheme: a path, a query or a fragment on this site. A colon before
     the first slash would be read by a browser as a scheme, so it is not
     allowed through as "relative". */
  const beforePath = probe.split(/[/?#]/)[0]
  if (beforePath.includes(":")) return null
  return /^[/?#.]/.test(value) ? value : null
}

/**
 * What somebody typed into the link field, as an address or null. The
 * field is forgiving where it is unambiguous: `example.com/page` gets
 * https://, `name@example.com` gets mailto:, `+44 20 7946 0000` gets tel:.
 */
export function normaliseTypedHref(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const direct = safeHref(value)
  if (direct) return direct
  if (/^[^\s@/:]+@[^\s@/:]+\.[a-z]{2,}$/i.test(value)) return `mailto:${value}`
  if (/^\+?[\d][\d\s().-]{5,30}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{2,5})?([/?#]\S*)?$/i.test(value)) return safeHref(`https://${value}`)
  return null
}

const IFRAME_HOSTS = new Set([
  "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com",
])

export const IFRAME_HOSTNAMES = [...IFRAME_HOSTS]

/** An embed the old editor wrote: https, YouTube or Vimeo. */
export function safeIframeSrc(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  try {
    const url = new URL(value)
    return url.protocol === "https:" && IFRAME_HOSTS.has(url.hostname) ? value : null
  } catch {
    return null
  }
}

/**
 * ---------------------------------------------------------------------------
 *  PICTURES
 * ---------------------------------------------------------------------------
 * A picture in a description is uploaded by the editor's photo button to
 * this project's own storage (lib/rich-text/upload-image.ts) and nothing
 * else is accepted: not a picture hot linked from another site, which can be
 * swapped for anything after it is approved or used to track who opened the
 * page, and not one written into the HTML as a data: URL, which is how the
 * old editor made rows megabytes long.
 *
 * THE ONE EXCEPTION IS WHAT IS ALREADY SAVED. The old editor wrote its
 * pictures inside `<div data-embed-type="image">` (and a video's thumbnail
 * inside `data-embed-type="youtube-thumbnail"`), as data: URLs or as any
 * https address somebody pasted. Inside those wrappers, and only there, those
 * still render as they did, with the sizing styles the old editor gave them.
 * Nothing the new editor or a paste produces can make one.
 */

/** This project's Supabase host, plus the one named in next.config's image patterns. */
const OWN_STORAGE_HOSTS = new Set(
  [
    (() => {
      try {
        return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname
      } catch {
        return ""
      }
    })(),
    "skgtqglupjcnfhfscink.supabase.co",
  ].filter(Boolean),
)

/** Where an uploaded picture lives: a public object in this project's storage. */
export function ownStorageImageSrc(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  try {
    const url = new URL(value)
    if (url.username || url.password || url.port || url.protocol !== "https:") return null
    /* Storelib's own address for an uploaded picture (lib/storage/media-url.ts). */
    if (url.hostname === (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com") && url.pathname.startsWith("/media/")) return value
    if (!OWN_STORAGE_HOSTS.has(url.hostname)) return null
    return url.pathname.startsWith("/storage/v1/object/public/") ? value : null
  } catch {
    return null
  }
}

/** Raster images the old editor stored inline. SVG is not one of them. */
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i

/** The old editor's wrappers, inside which its own pictures are still allowed. */
export const LEGACY_IMAGE_WRAPPERS = new Set(["image", "youtube-thumbnail"])

/**
 * A picture's address. Anywhere: this project's storage. Inside an old
 * picture wrapper as well: an inline raster, or an https address.
 */
export function safeImageSrc(raw: string | null | undefined, legacy = false): string | null {
  const own = ownStorageImageSrc(raw)
  if (own) return own
  if (!legacy || typeof raw !== "string") return null
  const value = raw.trim()
  if (DATA_IMAGE.test(value)) return value
  const probe = value.replace(INVISIBLE, "").toLowerCase()
  if (!/^https:/.test(probe)) return null
  try {
    return new URL(value).hostname ? value : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
//  HOW MUCH A SAVE MAY SEND
// ---------------------------------------------------------------------------

/**
 * The most HTML one save may hand the server to clean: far more than any
 * description anybody writes, far less than a request that costs the server
 * real time. An uploaded picture is a URL, so pictures hardly count; the old
 * editor's inline ones are the only way a real description gets near it.
 */
export const MAX_DESCRIPTION_BYTES = 200 * 1024

export function byteLength(value: string): number {
  return typeof TextEncoder === "undefined" ? value.length : new TextEncoder().encode(value).length
}

/** Why a description cannot be saved as it is, in words the editor shows; null when it can. */
export function descriptionTooLong(html: string, say: (source: string, vars?: Vars) => string = tt): string | null {
  const bytes = byteLength(html)
  if (bytes <= MAX_DESCRIPTION_BYTES) return null
  const kb = (n: number) => `${Math.ceil(n / 1024)} KB`
  const inline = /<img[^>]+src="data:/i.test(html)
  const vars = { size: kb(bytes), limit: kb(MAX_DESCRIPTION_BYTES) }
  return inline
    ? say(msg("The description is {size}, over the {limit} limit. Pictures saved inside the text by the old editor count toward it: remove them and add them again with the photo button."), vars)
    : say(msg("The description is {size}, over the {limit} limit. Shorten it, or remove formatting that came with a paste."), vars)
}

/** An absolute web link, which opens in a new tab and passes nothing on. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

export const EXTERNAL_REL = "noopener noreferrer nofollow"
