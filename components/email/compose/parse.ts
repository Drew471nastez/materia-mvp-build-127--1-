/**
 * ===========================================================================
 *  HTML BACK INTO BLOCKS, IN THE BROWSER
 * ===========================================================================
 * Three things arrive as HTML and have to become blocks:
 *
 *   a draft saved by this editor    every block carries data-sl-block and,
 *                                   where it has settings, data-sl-props,
 *                                   so it comes back exactly
 *   a draft from the old editor     plain paragraphs, headings, lists, an
 *                                   <img>, a centred link styled as a button
 *   a paste from anywhere           a web page, a doc, another email
 *
 * Uses the browser's own parser (DOMParser), which does not run scripts or
 * load images for a document it only parses. Inline HTML is cut down to
 * b, i, u, s, a and br: everything else keeps its words and loses its tags.
 */
import { blockId, newBlock, safeColor, safeImageSrc, safeUrl, type Align, type Block, type TextStyle } from "@/lib/email-campaigns/blocks"

const INLINE_KEEP: Record<string, string> = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", DEL: "s", A: "a", BR: "br" }
const BLOCKY = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "UL", "OL", "LI", "TABLE", "TBODY", "TR", "TD", "TH", "SECTION", "ARTICLE", "HEADER", "FOOTER", "CENTER", "HR", "IMG", "FIGURE"])

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string)
}

function inlineOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return esc((node.textContent ?? "").replace(/\s+/g, " "))
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const el = node as HTMLElement
  const tag = INLINE_KEEP[el.tagName]
  const inner = Array.from(el.childNodes).map(inlineOf).join("")
  if (el.tagName === "BR") return "<br>"
  if (tag === "a") {
    const href = safeUrl(el.getAttribute("href") ?? "")
    return href ? `<a href="${esc(href)}">${inner}</a>` : inner
  }
  if (tag) return inner ? `<${tag}>${inner}</${tag}>` : ""
  /* A span styled bold or italic, as Google Docs pastes it. */
  const style = el.getAttribute("style") ?? ""
  let out = inner
  if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) out = `<b>${out}</b>`
  if (/font-style\s*:\s*italic/i.test(style)) out = `<i>${out}</i>`
  if (/text-decoration[^;]*underline/i.test(style)) out = `<u>${out}</u>`
  if (/text-decoration[^;]*line-through/i.test(style)) out = `<s>${out}</s>`
  return BLOCKY.has(el.tagName) ? `${out}<br>` : out
}

/** Inline HTML, cleaned: what a text block or a list item may hold. */
export function cleanInline(html: string): string {
  if (typeof document === "undefined") return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  return Array.from(doc.body.childNodes)
    .map(inlineOf)
    .join("")
    .replace(/(<br>)+$/, "")
    .replace(/^\s+|\s+$/g, (m) => (m.includes("\n") ? "" : m))
}

function alignOf(el: Element): Align {
  const a = ((el as HTMLElement).style?.textAlign || el.getAttribute("align") || "").toLowerCase()
  return a === "center" || a === "right" ? a : "left"
}

function propsOf(el: Element): Record<string, unknown> {
  try {
    const raw = el.getAttribute("data-sl-props")
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}

/** A block this editor wrote, read back from its markers. */
function fromMarked(el: Element): Block | null {
  const type = el.getAttribute("data-sl-block")
  const p = propsOf(el)
  switch (type) {
    case "text": {
      const style = (el.getAttribute("data-sl-style") as TextStyle) || "p"
      return { id: blockId(), type: "text", style: ["p", "h1", "h2", "h3", "quote"].includes(style) ? style : "p", html: cleanInline(el.innerHTML), align: alignOf(el) }
    }
    case "list":
      return { id: blockId(), type: "list", ordered: el.tagName === "OL", items: Array.from(el.querySelectorAll(":scope > li")).map((li) => cleanInline(li.innerHTML)) }
    case "button":
      return { ...(newBlock("button") as Block & Record<string, unknown>), label: String(p.label ?? ""), url: String(p.url ?? ""), align: (p.align as Align) || "center", color: safeColor(p.color) } as Block
    case "image":
      return { ...(newBlock("image") as Block & Record<string, unknown>), src: safeImageSrc(p.src), alt: String(p.alt ?? ""), width: Number(p.width) || 100, align: (p.align as Align) || "center", href: String(p.href ?? "") } as Block
    case "product":
      return {
        ...(newBlock("product") as Block & Record<string, unknown>),
        productId: String(p.productId ?? ""),
        title: String(p.title ?? ""),
        price: String(p.price ?? ""),
        imageUrl: safeImageSrc(p.imageUrl),
        url: String(p.url ?? ""),
        cta: String(p.cta ?? "View product"),
        color: safeColor(p.color),
      } as Block
    case "divider":
      return newBlock("divider")
    case "spacer":
      return newBlock("spacer", { size: Number(p.size) || 32 } as Partial<Block>)
    default:
      return null
  }
}

function isButtonish(el: HTMLElement): HTMLAnchorElement | null {
  if (el.classList.contains("email-button-wrapper")) return el.querySelector("a")
  const links = el.querySelectorAll("a")
  if (links.length !== 1) return null
  const a = links[0] as HTMLAnchorElement
  const text = (el.textContent ?? "").trim()
  const styled = /inline-block/.test(a.getAttribute("style") ?? "") && /background/.test(a.getAttribute("style") ?? "")
  return styled && text === (a.textContent ?? "").trim() ? a : null
}

/** Blocks from any HTML. */
export function parseHtmlToBlocks(html: string): Block[] {
  if (typeof document === "undefined" || !html.trim()) return []
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  const out: Block[] = []
  let pending = ""

  const flush = () => {
    const clean = pending.replace(/^(<br>|\s)+|(<br>|\s)+$/g, "")
    if (clean) out.push({ id: blockId(), type: "text", style: "p", html: clean, align: "left" })
    pending = ""
  }

  const walk = (parent: Element) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? "").trim()) pending += esc((node.textContent ?? "").replace(/\s+/g, " "))
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const el = node as HTMLElement
      const tag = el.tagName
      if (["SCRIPT", "STYLE", "HEAD", "TITLE", "META", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "SVG"].includes(tag)) continue

      if (el.hasAttribute("data-sl-block")) {
        flush()
        const b = fromMarked(el)
        if (b) out.push(b)
        continue
      }
      if (!BLOCKY.has(tag)) {
        pending += inlineOf(el)
        continue
      }
      flush()
      if (/^H[1-6]$/.test(tag)) {
        const style: TextStyle = tag === "H1" ? "h1" : tag === "H2" ? "h2" : "h3"
        const inner = cleanInline(el.innerHTML)
        if (inner) out.push({ id: blockId(), type: "text", style, html: inner, align: alignOf(el) })
      } else if (tag === "BLOCKQUOTE") {
        const inner = cleanInline(el.innerHTML)
        if (inner) out.push({ id: blockId(), type: "text", style: "quote", html: inner, align: "left" })
      } else if (tag === "UL" || tag === "OL") {
        const items = Array.from(el.querySelectorAll(":scope > li")).map((li) => cleanInline(li.innerHTML)).filter(Boolean)
        if (items.length) out.push({ id: blockId(), type: "list", ordered: tag === "OL", items })
      } else if (tag === "HR") {
        out.push(newBlock("divider"))
      } else if (tag === "IMG") {
        const src = safeImageSrc(el.getAttribute("src"))
        if (src) out.push({ ...(newBlock("image") as Block & Record<string, unknown>), src, alt: el.getAttribute("alt") ?? "" } as Block)
      } else {
        const button = isButtonish(el)
        if (button) {
          out.push({
            ...(newBlock("button") as Block & Record<string, unknown>),
            label: (button.textContent ?? "").trim(),
            url: safeUrl(button.getAttribute("href") ?? ""),
            align: alignOf(el),
            color: safeColor(rgbToHex(button.style.backgroundColor) || undefined),
          } as Block)
          continue
        }
        const hasBlockChild = Array.from(el.children).some((c) => BLOCKY.has(c.tagName))
        if (hasBlockChild) walk(el)
        else {
          const inner = cleanInline(el.innerHTML)
          if (inner) out.push({ id: blockId(), type: "text", style: "p", html: inner, align: alignOf(el) })
        }
      }
    }
  }
  walk(doc.body)
  flush()
  return out
}

function rgbToHex(rgb: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || "")
  if (!m) return /^#[0-9a-f]{3,6}$/i.test(rgb) ? rgb : ""
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`
}

/** Plain text as blocks: a blank line starts a new paragraph, a single break stays a break. */
export function textToBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ id: blockId(), type: "text", style: "p", html: esc(p).replace(/\n/g, "<br>"), align: "left" }) as Block)
}

/** Blocks as they are saved and sent: inline HTML cleaned once more. */
export function cleanBlocks(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type === "text") return { ...b, html: cleanInline(b.html) }
    if (b.type === "list") return { ...b, items: b.items.map(cleanInline) }
    return b
  })
}
