/**
 * ===========================================================================
 *  WHAT A BLOG POST MAY CARRY AS HTML
 * ===========================================================================
 * The article draws a block's `html` with dangerouslySetInnerHTML, so what
 * is stored there is what a reader's browser runs. The admin saves through
 * this on the server (app/api/admin/blog/posts), and the public renderer can
 * run it again on read: it is pure, has no DOM and no dependency, and the
 * same input always gives the same output.
 *
 *   KEPT      b i u s a code br (lib/blog/blocks.ts), with strong, em,
 *             strike and del folded into b, i and s.
 *   DROPPED   script, style, iframe and the like, with what is inside them.
 *   UNWRAPPED every other tag: its text stays, the tag goes.
 *   LINKS     http, https, mailto, tel, and addresses on this site. A
 *             javascript:, data: or any other scheme loses its link and keeps
 *             its words. target="_blank" always comes with
 *             rel="noopener noreferrer".
 *   OUTPUT    well formed: every tag closed, in order, and any stray < > &
 *             in the text escaped.
 *
 * tests/blog-admin-r45.test.ts runs it.
 */

import type { Block, BlockType } from "./blocks"
import { headingAnchor } from "./blocks"
import { detectEmbedProvider, youtubeIdFrom } from "./embed"

const ALLOWED = new Set(["b", "i", "u", "s", "a", "code", "br"])
const FOLD: Record<string, string> = { strong: "b", em: "i", strike: "s", del: "s", ins: "u" }
/** Their content is not text a reader should see either. */
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "textarea", "select", "title", "head", "frameset", "frame", "applet", "xml"])
const REL_KEEP = new Set(["nofollow", "sponsored", "ugc"])

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const ENTITY = /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", colon: ":", tab: "\t", newline: "\n" }

/** Entities decoded, for checking an address, never for output. */
function decodeEntities(s: string): string {
  return s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});?/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
    }
    return NAMED[body.toLowerCase()] ?? m
  })
}

/** Text as it may sit between tags: an & that starts no entity, and every < and >, escaped. */
function escapeText(s: string): string {
  let out = ""
  let last = 0
  for (const m of s.matchAll(ENTITY)) {
    out += s.slice(last, m.index).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    out += m[0]
    last = m.index! + m[0].length
  }
  return out + s.slice(last).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * A link's address when it is one a reader may follow: http(s), mailto, tel,
 * a path on this site, a #fragment or a ?query. Null for javascript:, data:,
 * vbscript: and anything else, however it was spelled (entities, tabs,
 * capitals and control characters are all undone before the check).
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const url = decodeEntities(raw).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "").trim()
  if (!url || url.length > 2048) return null
  if (/^(?:#|\?|\/(?!\/))/.test(url)) return url
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  if (!scheme) {
    /* "example.com/page" or "page": no scheme at all is a relative address, which the article would resolve under /blog. Only a bare host is sensible here. */
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url) ? `https://${url}` : null
  }
  const s = scheme[1].toLowerCase()
  if (s === "http" || s === "https") return /^https?:\/\/[^/\s]+/i.test(url) ? url : null
  if (s === "mailto" || s === "tel") return url
  return null
}

/** A picture's or a video's address: https, http, or a path on this site. */
export function safeMediaUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (!url || url.length > 2048) return null
  if (/^\/(?!\/)/.test(url)) return url
  return /^https?:\/\/[^/\s]+/i.test(url) && !/[\u0000-\u001f"<>\\]/.test(url) ? url : null
}

/** Plain text: tags and control characters out, at most `max` characters. */
export function plainText(raw: unknown, max = 2000): string {
  if (typeof raw !== "string") return ""
  return decodeEntities(raw.replace(/<[^>]*>/g, ""))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, max)
}

function linkAttrs(attrs: string): string | null {
  let href: string | null = null
  let target = ""
  const rel = new Set<string>()
  for (const m of attrs.matchAll(ATTR)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (name === "href") href = safeHref(value)
    else if (name === "target") target = value.trim().toLowerCase()
    else if (name === "rel") for (const r of value.toLowerCase().split(/\s+/)) if (REL_KEEP.has(r)) rel.add(r)
  }
  if (!href) return null
  let out = ` href="${escapeAttr(href)}"`
  if (target === "_blank") {
    rel.add("noopener")
    rel.add("noreferrer")
    out += ` target="_blank"`
  }
  if (rel.size) out += ` rel="${[...rel].join(" ")}"`
  return out
}

/**
 * Inline HTML kept to b, i, u, s, a, code and br. See the top of this file.
 * `max` bounds the input, so one pasted book cannot be one paragraph.
 */
export function sanitizeInlineHtml(input: unknown, max = 50_000): string {
  if (typeof input !== "string" || !input) return ""
  const src = input.length > max ? input.slice(0, max) : input
  const stack: string[] = []
  let out = ""
  let dropping: string | null = null
  let dropDepth = 0
  let last = 0

  for (const m of src.matchAll(TOKEN)) {
    const text = src.slice(last, m.index)
    last = m.index! + m[0].length
    if (!dropping && text) out += escapeText(text)
    const name = m[2]?.toLowerCase()
    if (!name) continue /* a comment, a doctype, CDATA: never output */
    const closing = m[1] === "/"
    if (dropping) {
      if (name === dropping) dropDepth += closing ? -1 : m[4] === "/" ? 0 : 1
      if (dropDepth <= 0) dropping = null
      continue
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && m[4] !== "/") {
        dropping = name
        dropDepth = 1
      }
      continue
    }
    const tag = FOLD[name] ?? name
    if (!ALLOWED.has(tag)) {
      /* A block-level tag inside a line becomes a space, so two words never run together. */
      if (/^(p|div|li|tr|td|th|h[1-6]|blockquote|section|article|header|footer)$/.test(name) && !out.endsWith(" ") && out) out += " "
      continue
    }
    if (tag === "br") {
      if (!closing) out += "<br>"
      continue
    }
    if (closing) {
      const at = tag === "a" ? Math.max(stack.lastIndexOf("a"), stack.lastIndexOf("a!")) : stack.lastIndexOf(tag)
      if (at < 0) continue
      while (stack.length > at) out += closeTag(stack.pop()!)
      continue
    }
    if (m[4] === "/") continue /* <b/> opens nothing */
    if (tag === "a") {
      if (stack.includes("a")) continue /* no link inside a link */
      const attrs = linkAttrs(m[3] ?? "")
      if (!attrs) {
        /* A link that may not be followed keeps its words: its opening and its closing are both skipped. */
        stack.push("a!")
        continue
      }
      out += `<a${attrs}>`
      stack.push("a")
      continue
    }
    if (stack.length >= 12) continue
    out += `<${tag}>`
    stack.push(tag)
  }
  if (!dropping) out += escapeText(src.slice(last))
  while (stack.length) out += closeTag(stack.pop()!)
  /* Nothing but tags and spaces is an empty line. */
  return /\S/.test(out.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ")) ? out : ""
}

/* "a!" marks a link that was refused: its words were kept, so it has no closing tag to write. */
const closeTag = (t: string) => (t === "a!" ? "" : `</${t}>`)

/* ── Blocks ──────────────────────────────────────────────────────────────── */

const TYPES = new Set<BlockType>(["p", "h2", "h3", "hr", "img", "youtube", "table", "quote", "ul", "ol", "code", "callout", "cta", "embed", "video", "snippet"])
const TONES = new Set(["note", "tip", "warning"])
const MAX_BLOCKS = 2000

const id = (raw: unknown, i: number) => (typeof raw === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : `b${i.toString(36)}${Math.random().toString(36).slice(2, 8)}`)
const str = (raw: unknown, max: number) => plainText(raw, max).trim()

/**
 * Every block made safe to store and to draw: unknown types dropped, inline
 * HTML through sanitizeInlineHtml, addresses through safeHref and
 * safeMediaUrl, plain fields stripped of tags and capped. An embed whose
 * address is not from its provider loses the provider, so the article shows
 * it as a link (lib/blog/embed.ts).
 */
export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return []
  const out: Block[] = []
  const seen = new Set<string>()
  for (let i = 0; i < input.length && out.length < MAX_BLOCKS; i++) {
    const raw = input[i] as Record<string, unknown> | null
    if (!raw || typeof raw !== "object") continue
    const type = raw.type as BlockType
    if (!TYPES.has(type)) continue
    let bid = id(raw.id, i)
    if (seen.has(bid)) bid = id(null, i)
    seen.add(bid)
    const b: Block = { id: bid, type }
    switch (type) {
      case "p":
      case "h2":
      case "h3":
      case "quote":
      case "callout": {
        b.html = sanitizeInlineHtml(raw.html)
        if (type === "h2" || type === "h3") {
          const anchor = typeof raw.anchor === "string" ? raw.anchor.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) : ""
          if (anchor) b.anchor = anchor
        }
        if (type === "callout") b.tone = TONES.has(raw.tone as string) ? (raw.tone as Block["tone"]) : "note"
        break
      }
      case "ul":
      case "ol":
        b.items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 500).map((it) => sanitizeInlineHtml(it, 5000))
        if (!b.items.length) b.items = [""]
        break
      case "code":
        b.lang = str(raw.lang, 30).toLowerCase().replace(/[^a-z0-9+#.-]/g, "")
        b.text = typeof raw.text === "string" ? raw.text.replace(/\u0000/g, "").slice(0, 100_000) : ""
        break
      case "table": {
        const headers = (Array.isArray(raw.headers) ? raw.headers : []).slice(0, 20).map((h) => str(h, 200))
        const cols = Math.max(1, headers.length)
        b.headers = headers.length ? headers : [""]
        b.rows = (Array.isArray(raw.rows) ? raw.rows : []).slice(0, 500).map((r) => {
          const cells = (Array.isArray(r) ? r : []).slice(0, cols).map((c) => str(c, 2000))
          while (cells.length < cols) cells.push("")
          return cells
        })
        const caption = str(raw.caption, 300)
        if (caption) b.caption = caption
        break
      }
      case "img":
      case "video": {
        b.url = safeMediaUrl(raw.url as string) ?? ""
        b.alt = str(raw.alt, 300)
        const caption = str(raw.caption, 300)
        if (caption) b.caption = caption
        break
      }
      case "youtube": {
        b.videoId = youtubeIdFrom(typeof raw.videoId === "string" ? raw.videoId : "") ?? ""
        const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 100)
        if (chapters.length) b.chapters = chapters
        const transcript = str(raw.transcript, 100_000)
        if (transcript) b.transcript = transcript
        const caption = str(raw.caption, 300)
        if (caption) b.caption = caption
        break
      }
      case "embed": {
        const href = safeHref(raw.url as string)
        b.url = href && /^https?:/i.test(href) ? href : ""
        const provider = b.url ? detectEmbedProvider(b.url) : null
        if (provider) b.provider = provider
        const caption = str(raw.caption, 300)
        if (caption) b.caption = caption
        break
      }
      case "cta": {
        b.title = str(raw.title, 120)
        b.body = str(raw.body, 300)
        b.label = str(raw.label, 40)
        b.url = safeHref(raw.url as string) ?? ""
        break
      }
      case "snippet":
        b.snippetId = typeof raw.snippetId === "string" && /^[0-9a-f-]{36}$/i.test(raw.snippetId) ? raw.snippetId.toLowerCase() : ""
        break
      case "hr":
        break
    }
    out.push(b)
  }
  return out
}

/** The headings' anchors made unique, in order, so the table of contents never has two links to one place. */
export function uniqueAnchors(blocks: Block[]): Block[] {
  const used = new Map<string, number>()
  return blocks.map((b) => {
    if (b.type !== "h2" && b.type !== "h3") return b
    const base = headingAnchor(b)
    const n = used.get(base) ?? 0
    used.set(base, n + 1)
    return n === 0 ? b : { ...b, anchor: `${base}-${n + 1}` }
  })
}
