/**
 * ===========================================================================
 *  PASTED TEXT INTO BLOCKS
 * ===========================================================================
 * What the editor does with a paste (components/admin/blog-editor.tsx).
 *
 * From Google Docs, Word or a web page: the structure is kept and the look
 * is not. Headings become h2 and h3, lists stay lists, paragraphs stay
 * paragraphs, tables and quotes and code stay what they are; inside a line
 * only bold, italic, underline, strike, code and links survive, read from
 * the tags or from the inline styles Google Docs uses for them (it writes
 * <span style="font-weight:700"> rather than <b>, and wraps the whole paste
 * in <b style="font-weight:normal" id="docs-internal-guid-…">, which is not
 * bold at all). Fonts, sizes, colours, classes and spacing are dropped.
 * Every line ends through lib/blog/sanitize.ts like anything else saved.
 *
 * Takes a parsed Document, so it runs in the browser on DOMParser's and in a
 * test on any DOM.
 */

import type { Block } from "./blocks"
import { safeMediaUrl, sanitizeInlineHtml } from "./sanitize"

type MakeId = () => string

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const SKIP = new Set(["script", "style", "meta", "link", "title", "head", "noscript", "template", "svg", "iframe", "object", "colgroup", "col"])
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "table", "thead", "tbody", "tr", "hr", "img", "section", "article", "header", "footer", "main", "aside", "figure", "figcaption", "dl", "dt", "dd"])

function styleOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const i = part.indexOf(":")
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim().toLowerCase()
  }
  return out
}

function isBoldWeight(w: string | undefined): boolean | null {
  if (!w) return null
  if (w === "bold" || w === "bolder") return true
  if (w === "normal" || w === "lighter") return false
  const n = Number.parseInt(w, 10)
  return Number.isFinite(n) ? n >= 600 : null
}

/** One element's inline content as limited HTML. */
export function inlineHtmlOf(node: Node): string {
  if (node.nodeType === 3) return escape((node.nodeValue ?? "").replace(/\u00a0/g, " "))
  if (node.nodeType !== 1) return ""
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  if (SKIP.has(tag)) return ""
  if (tag === "br") return "<br>"
  if (tag === "img") return ""
  let inner = ""
  el.childNodes.forEach((c) => (inner += inlineHtmlOf(c)))
  if (!inner) return ""
  const st = styleOf(el)
  let bold = isBoldWeight(st["font-weight"])
  if (bold === null) bold = tag === "b" || tag === "strong"
  const italic = tag === "i" || tag === "em" || st["font-style"] === "italic"
  const deco = `${st["text-decoration"] ?? ""} ${st["text-decoration-line"] ?? ""}`
  const underline = tag === "u" || tag === "ins" || /underline/.test(deco)
  const strike = tag === "s" || tag === "strike" || tag === "del" || /line-through/.test(deco)
  const code = tag === "code" || tag === "kbd" || tag === "samp" || tag === "tt" || /monospace|courier|consolas|menlo|monaco/.test(st["font-family"] ?? "")
  let out = inner
  if (code) out = `<code>${out}</code>`
  if (strike) out = `<s>${out}</s>`
  if (underline && tag !== "a") out = `<u>${out}</u>`
  if (italic) out = `<i>${out}</i>`
  if (bold) out = `<b>${out}</b>`
  if (tag === "a") {
    /* A link's underline is how the document drew links, not emphasis. */
    out = out.replace(/^<u>([\s\S]*)<\/u>$/, "$1")
    const href = el.getAttribute("href")
    if (href && !/^#/.test(href)) {
      /* Google Docs sends every link through google.com/url?q=; the real address is the q. */
      let real = href
      try {
        const u = new URL(href)
        if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === "/url" && u.searchParams.get("q")) real = u.searchParams.get("q")!
      } catch {}
      out = `<a href="${real.replace(/"/g, "&quot;")}">${out}</a>`
    }
  }
  return out
}

function text(el: Element): string {
  return (el.textContent ?? "").replace(/\u00a0/g, " ").trim()
}

/** A clipboard's HTML as blocks. Empty lines are dropped; a paste with no structure is one or more paragraphs. */
export function blocksFromHtmlDocument(doc: Document, makeId: MakeId): Block[] {
  const out: Block[] = []
  let run = ""
  const flush = () => {
    const html = sanitizeInlineHtml(run.trim())
    if (html) out.push({ id: makeId(), type: "p", html })
    run = ""
  }
  const listItems = (list: Element, into: string[]) => {
    for (const li of Array.from(list.children)) {
      if (li.tagName.toLowerCase() !== "li") continue
      let own = ""
      li.childNodes.forEach((c) => {
        const t = c.nodeType === 1 ? (c as Element).tagName.toLowerCase() : ""
        if (t === "ul" || t === "ol") return
        own += c.nodeType === 1 && t === "p" ? inlineHtmlOf(c) + " " : inlineHtmlOf(c)
      })
      const html = sanitizeInlineHtml(own.trim())
      if (html) into.push(html)
      for (const nested of Array.from(li.children)) if (/^(ul|ol)$/i.test(nested.tagName)) listItems(nested, into)
    }
  }
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      run += inlineHtmlOf(node)
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (SKIP.has(tag)) return
    if (!BLOCK_TAGS.has(tag)) {
      /* An inline element, unless it hides block content (Google Docs' outer <b>): then its children are walked. */
      if (Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()))) el.childNodes.forEach(walk)
      else run += inlineHtmlOf(el)
      return
    }
    flush()
    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        /* A heading's own bold is the heading's look, not emphasis. */
        const html = sanitizeInlineHtml(inlineHtmlOf(el).replace(/<\/?b>/g, ""))
        if (html) out.push({ id: makeId(), type: tag === "h1" || tag === "h2" ? "h2" : "h3", html })
        return
      }
      case "ul":
      case "ol": {
        const items: string[] = []
        listItems(el, items)
        if (items.length) out.push({ id: makeId(), type: tag, items })
        return
      }
      case "blockquote": {
        const html = sanitizeInlineHtml(Array.from(el.childNodes).map((c) => inlineHtmlOf(c)).join(" ").trim())
        if (html) out.push({ id: makeId(), type: "quote", html })
        return
      }
      case "pre": {
        const t = (el.textContent ?? "").replace(/\n$/, "")
        if (t.trim()) out.push({ id: makeId(), type: "code", lang: "", text: t })
        return
      }
      case "table": {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) => Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName)).map(text))
        const filled = rows.filter((r) => r.some(Boolean))
        if (filled.length) {
          const cols = Math.max(...filled.map((r) => r.length))
          const pad = (r: string[]) => [...r, ...Array(cols - r.length).fill("")]
          out.push({ id: makeId(), type: "table", headers: pad(filled[0]), rows: filled.slice(1).map(pad) })
        }
        return
      }
      case "hr":
        out.push({ id: makeId(), type: "hr" })
        return
      case "img": {
        const url = safeMediaUrl(el.getAttribute("src"))
        if (url) out.push({ id: makeId(), type: "img", url, alt: (el.getAttribute("alt") ?? "").trim(), caption: "" })
        return
      }
      case "p":
      case "li":
      case "dt":
      case "dd":
      case "figcaption": {
        if (Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) && c.tagName.toLowerCase() !== "br")) {
          el.childNodes.forEach(walk)
          flush()
          return
        }
        const html = sanitizeInlineHtml(inlineHtmlOf(el).trim())
        if (html) out.push({ id: makeId(), type: "p", html })
        return
      }
      default:
        el.childNodes.forEach(walk)
        flush()
    }
  }
  doc.body?.childNodes.forEach(walk)
  flush()
  return out
}

/** Plain text as paragraphs: a blank line starts a new one, a single line break stays a line break. */
export function blocksFromPlainText(raw: string, makeId: MakeId): Block[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => ({ id: makeId(), type: "p" as const, html: sanitizeInlineHtml(escape(para).replace(/\n/g, "<br>")) }))
    .filter((b) => b.html)
}

/** A paste that is one address and nothing else. */
export function pastedUrl(raw: string): string | null {
  const t = raw.trim()
  return /^https?:\/\/\S+$/i.test(t) && t.length < 2048 ? t : null
}

export function looksLikeImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(url)
}
