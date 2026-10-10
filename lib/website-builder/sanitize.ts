/**
 * ===========================================================================
 *  CREATOR HTML, MADE SAFE TO PUT ON A PAGE
 * ===========================================================================
 * Several sections put a setting straight into the DOM: a rich text body, an
 * FAQ answer, a tab's content, a pasted map embed. The control registry has
 * always said a `richtext` value is "stored as sanitised HTML", the template
 * language's `raw` filter says it is "only for values that were sanitised on
 * the way in", and tests/storelib-security.test.ts had a line admitting the
 * sanitising "has to happen on save".
 *
 * Nothing sanitised anything. There was no sanitiser in the repository at
 * all, and the rich text control is a plain textarea, so the field was
 * literally a box somebody types HTML into.
 *
 * WHY THAT IS NOT SELF-INFLICTED. A published storefront is served from the
 * platform's own origin: storelib.com/<username> and /w/<username>. Script in
 * a creator's rich text therefore runs on storelib.com, in the session of any
 * signed-in visitor who opens that store, with access to whatever that origin
 * can reach. "It is their own store" is not an argument, because the victim
 * is the visitor.
 *
 * So: an allow list, applied on the way in and again on the way out.
 *
 *   ON SAVE   the authority. Nothing unsafe reaches the database.
 *   ON READ   because the database already holds content saved before this
 *             existed, and rows written by an import or by hand.
 *
 * Both run on the server. The section renderers are client components, but
 * what they are handed has been through this first, so nothing has to be
 * bundled to the browser.
 */
import sanitizeHtml from "sanitize-html"

import { sanitizeInlineHtml } from "@/lib/storelib-theme/values"

/**
 * What a rich text body may contain. Everything here is markup somebody
 * writing a paragraph would reach for, and nothing here can execute.
 */
const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
    "strong", "b", "em", "i", "u", "s", "small", "mark", "sub", "sup",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "dl", "dt", "dd",
    "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    col: ["span"],
    "*": ["class", "id", "dir", "lang"],
  },
  /**
   * No `style`. A style attribute carries `url(...)`, and historically
   * `expression(...)`, and a section's own stylesheet is the right place for
   * appearance anyway. A rich text body that needs a colour has a setting.
   */
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // A relative or root-relative link stays, which is how a body links to
  // another page of the same site.
  allowProtocolRelative: false,
  /** A new tab without this is a window.opener handle back to the page. */
  transformTags: {
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      if (out.target === "_blank") out.rel = "noopener noreferrer"
      return { tagName, attribs: out }
    },
  },
  // `script` and `style` are not on the list; drop what was inside them too,
  // or the code shows up as text on the page.
  nonTextTags: ["script", "style", "textarea", "noscript", "option"],
}

/** A creator's own HTML block. Wider, and still unable to execute. */
const CUSTOM_HTML: sanitizeHtml.IOptions = {
  ...RICH_TEXT,
  allowedTags: [
    ...(RICH_TEXT.allowedTags as string[]),
    "section", "article", "aside", "header", "footer", "main", "nav",
    "video", "audio", "source", "picture", "iframe", "button", "label",
  ],
  allowedAttributes: {
    ...(RICH_TEXT.allowedAttributes as Record<string, string[]>),
    video: ["src", "poster", "controls", "muted", "loop", "playsinline", "width", "height", "preload"],
    audio: ["src", "controls", "loop", "preload"],
    source: ["src", "srcset", "type", "media"],
    iframe: ["src", "title", "width", "height", "loading", "allow", "allowfullscreen", "frameborder"],
    button: ["type", "disabled"],
    label: ["for"],
  },
  allowedIframeHostnames: [
    "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "youtu.be",
    "player.vimeo.com", "vimeo.com",
    "open.spotify.com", "w.soundcloud.com",
    "www.google.com", "maps.google.com",
    "www.openstreetmap.org", "maps.apple.com",
  ],
  allowIframeRelativeUrls: false,
}

/**
 * A pasted embed: one iframe from a host we recognise, and nothing else.
 * The map section takes this from a plain textarea, so what arrives is
 * whatever somebody copied out of another site.
 */
const EMBED: sanitizeHtml.IOptions = {
  allowedTags: ["iframe", "div", "p", "br"],
  allowedAttributes: {
    iframe: ["src", "title", "width", "height", "style", "loading", "allow", "allowfullscreen", "frameborder", "scrolling", "referrerpolicy"],
    div: ["class"],
  },
  allowedSchemes: ["https"],
  allowedSchemesAppliedToAttributes: ["src"],
  allowedIframeHostnames: [
    "www.google.com", "maps.google.com", "www.openstreetmap.org", "maps.apple.com",
    "www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com",
    "open.spotify.com", "w.soundcloud.com",
  ],
  allowIframeRelativeUrls: false,
  nonTextTags: ["script", "style", "noscript"],
  /**
   * An embed's iframe is the one place a `style` attribute survives, because
   * every provider's copy-paste snippet carries `style="border:0"`. It is
   * filtered to declarations that cannot fetch or position anything.
   */
  transformTags: {
    iframe: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs }
      if (out.style) {
        const safe = out.style
          .split(";")
          .map((d) => d.trim())
          .filter((d) => /^(border|width|height|max-width|min-height|border-radius|display)\s*:/i.test(d))
          .filter((d) => !/url\s*\(|expression|javascript:/i.test(d))
        if (safe.length) out.style = safe.join("; ")
        else delete out.style
      }
      return { tagName, attribs: out }
    },
  },
}

export function sanitizeRichText(html: unknown): string {
  return typeof html === "string" && html ? sanitizeHtml(html, RICH_TEXT) : ""
}

export function sanitizeCustomHtml(html: unknown): string {
  return typeof html === "string" && html ? sanitizeHtml(html, CUSTOM_HTML) : ""
}

export function sanitizeEmbedCode(html: unknown): string {
  return typeof html === "string" && html ? sanitizeHtml(html, EMBED) : ""
}

/**
 * WHICH SETTINGS HOLD HTML.
 *
 * The schema's `richtext` type is the general answer and is looked up first.
 * These are the ids that carry HTML on a section whose schema calls them
 * something else, which is how `embed_code` arrived as a `textarea`. A name
 * here is cleaned whatever its declared type, because the question is what
 * reaches the DOM rather than what the schema claims.
 */
const HTML_SETTING_IDS: Record<string, "rich" | "custom" | "embed" | "inline"> = {
  html_content: "custom",
  custom_html: "custom",
  embed_code: "embed",
  map_embed: "embed",
  body: "rich",
  answer: "rich",
  content: "rich",
  preview_text: "rich",
  description: "rich",
}

function cleanBy(kind: "rich" | "custom" | "embed" | "inline", value: unknown): string {
  if (kind === "custom") return sanitizeCustomHtml(value)
  if (kind === "embed") return sanitizeEmbedCode(value)
  /* One line of formatted text: the engine's own allow list, the same one
     that runs again as the section is drawn. */
  if (kind === "inline") return sanitizeInlineHtml(value)
  return sanitizeRichText(value)
}

/** The schema's own view: `{ id -> "rich" }` for every richtext setting. */
export type HtmlFieldMap = Record<string, "rich" | "custom" | "embed" | "inline">

/**
 * Which of a schema's settings hold markup, and which allow list cleans each.
 * By type first, because the type is what the template prints raw: a
 * `richtext` is rich text, an `html` is a creator's own markup, an
 * `inline_richtext` is one formatted line. The id list above covers the
 * settings that hold markup under another type.
 */
export function htmlFieldsOf(fields: { id: string; type?: string }[] | undefined): HtmlFieldMap {
  const out: HtmlFieldMap = {}
  for (const f of fields ?? []) {
    if (f.type === "richtext") out[f.id] = HTML_SETTING_IDS[f.id] ?? "rich"
    else if (f.type === "html") out[f.id] = "custom"
    else if (f.type === "inline_richtext") out[f.id] = "inline"
    else if (HTML_SETTING_IDS[f.id]) out[f.id] = HTML_SETTING_IDS[f.id]
  }
  return out
}

/**
 * AN IMPORTED SHOPIFY THEME'S SETTINGS, by type alone. Shopify draws an
 * `html` or `liquid` setting as written (an SVG icon, a <style>, a custom
 * element, an embed), and a `text` called `description` is just text; the
 * id list above, made for Storelib's own sections, took the SVG and the
 * style out of them, so an imported section lost its icons and its look
 * the moment it was saved. Only rich text is cleaned: it is what a visitor
 * never writes but a theme prints raw. The theme's own scripts already run
 * on the creator's site, so markup they wrote into a setting is no wider.
 */
export function compatHtmlFieldsOf(fields: { id: string; type?: string }[] | undefined): HtmlFieldMap {
  const out: HtmlFieldMap = {}
  for (const f of fields ?? []) {
    if (f.type === "richtext") out[f.id] = "rich"
    else if (f.type === "inline_richtext") out[f.id] = "inline"
  }
  return out
}

/**
 * One instance's settings and blocks, cleaned. Unknown keys are left alone:
 * this only touches what a schema calls HTML or what a renderer is known to
 * inject, and anything else is data the engine has no business rewriting.
 */
export function sanitizeSettings(
  settings: Record<string, unknown> | undefined,
  fields: HtmlFieldMap,
  opts?: { byId?: boolean },
): Record<string, unknown> {
  if (!settings) return {}
  let changed = false
  const out: Record<string, unknown> = { ...settings }
  for (const [id, kind] of Object.entries(fields)) {
    const value = settings[id]
    if (typeof value !== "string" || !value) continue
    const clean = cleanBy(kind, value)
    if (clean !== value) { out[id] = clean; changed = true }
  }
  // Also clean by id alone, for a section whose schema is not to hand.
  if (opts?.byId !== false) for (const [id, kind] of Object.entries(HTML_SETTING_IDS)) {
    if (fields[id]) continue
    const value = settings[id]
    if (typeof value !== "string" || !value) continue
    const clean = cleanBy(kind, value)
    if (clean !== value) { out[id] = clean; changed = true }
  }
  return changed ? out : settings
}
