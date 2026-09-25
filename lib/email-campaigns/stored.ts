/**
 * ===========================================================================
 *  A SAVED EMAIL, READ BACK INTO BLOCKS
 * ===========================================================================
 * The same reader in the browser (a draft reopens in the composer) and on
 * the server (every send renders the blocks again, in the brand as it is
 * now). It reads three shapes:
 *
 *   the composer's own     <div data-sl-block="..."> around each block, a
 *                          text block's HTML as the rich text field wrote it,
 *                          any other block's settings in data-sl-props
 *   the first composer's   data-sl-block on the rendered element itself,
 *                          with text, list and data-sl-style
 *   the old editor's       plain HTML: paragraphs, headings, lists, pictures
 *                          and a link styled as a button. Pictures and lone
 *                          buttons become blocks, the rest is text.
 *
 * lib/rich-text/html.ts parseHtml reads it, so there is no DOM and nothing
 * runs; every value that comes out is checked again where it is drawn.
 */
import { cleanStoredHtml, escapeAttr, escapeText, parseHtml, type HElement, type HNode } from "@/lib/rich-text/html"
import { isButtonShaped, parseStyle } from "@/lib/rich-text/policy"
import { decodeHtmlEntities } from "@/lib/html-entities"
import { BRAND_COLOR, IMAGE_WIDTHS, SPACER_SIZES, blockId, legacyToRich, newBlock, safeColor, safeImageSrc, safeUrl, type Align, type Block, type TextStyle } from "./blocks"

const VOID = new Set(["br", "hr", "img", "wbr", "col", "area", "input", "meta", "link", "source", "track", "embed", "param", "base"])

/** Nodes back to HTML text, only for handing to cleanStoredHtml, which decides what stays. */
export function nodesToHtml(nodes: HNode[]): string {
  let out = ""
  for (const n of nodes) {
    if (n.type === "text") {
      out += escapeText(decodeHtmlEntities(n.value))
      continue
    }
    if (!/^[a-z][a-z0-9-]*$/.test(n.name)) continue
    const attrs = Object.entries(n.attrs)
      .filter(([k]) => /^[a-z][a-z0-9-]*$/.test(k))
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join("")
    out += VOID.has(n.name) ? `<${n.name}${attrs}>` : `<${n.name}${attrs}>${nodesToHtml(n.children)}</${n.name}>`
  }
  return out
}

/** Text for the rich text field: the description allow list, tidied as the editor writes it. */
function richOf(nodes: HNode[]): string {
  return cleanStoredHtml(nodesToHtml(nodes), { blocks: true })
}

function propsOf(el: HElement): Record<string, unknown> {
  try {
    const raw = el.attrs["data-sl-props"]
    const v = raw ? JSON.parse(decodeHtmlEntities(raw)) : {}
    return v && typeof v === "object" && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "")
const align = (v: unknown): Align => (v === "left" || v === "right" || v === "center" ? v : "center")
/** A colour a block chose, or "" for the brand's. */
const color = (v: unknown) => (typeof v === "string" && v.trim() ? safeColor(v, "") : BRAND_COLOR)

function alignOf(el: HElement): Align {
  const a = (new Map(parseStyle(el.attrs.style ?? "")).get("text-align") ?? el.attrs.align ?? "").toLowerCase()
  return a === "center" || a === "right" ? a : "left"
}

/** Inline HTML of a first-composer text block or list item. */
function inlineOf(nodes: HNode[]): string {
  return nodesToHtml(nodes)
}

function fromMarked(el: HElement): Block | null {
  const type = el.attrs["data-sl-block"]
  const p = propsOf(el)
  switch (type) {
    case "rich": {
      const html = richOf(el.children)
      return { id: blockId(), type: "rich", html }
    }
    case "text": {
      const s = el.attrs["data-sl-style"] as TextStyle
      const style: TextStyle = ["p", "h1", "h2", "h3", "quote"].includes(s) ? s : "p"
      const rich = legacyToRich({ id: "", type: "text", style, html: inlineOf(el.children), align: alignOf(el) })
      return { id: blockId(), type: "rich", html: cleanStoredHtml(rich, { blocks: true }) }
    }
    case "list": {
      const items = el.children.filter((c): c is HElement => c.type === "el" && c.name === "li").map((li) => inlineOf(li.children))
      const rich = legacyToRich({ id: "", type: "list", ordered: el.name === "ol", items })
      return { id: blockId(), type: "rich", html: cleanStoredHtml(rich, { blocks: true }) }
    }
    case "button":
      return { ...(newBlock("button") as Block), label: str(p.label, 80), url: str(p.url, 2048), align: align(p.align), color: color(p.color) } as Block
    case "image": {
      const width = Number(p.width)
      return {
        ...(newBlock("image") as Block),
        src: safeImageSrc(p.src),
        alt: str(p.alt, 300),
        width: (IMAGE_WIDTHS as readonly number[]).includes(width) ? width : 100,
        align: align(p.align),
        href: str(p.href, 2048),
      } as Block
    }
    case "product":
      return {
        ...(newBlock("product") as Block),
        productId: str(p.productId, 64),
        title: str(p.title, 200),
        price: str(p.price, 40),
        imageUrl: safeImageSrc(p.imageUrl),
        url: str(p.url, 2048),
        cta: str(p.cta, 60) || "View product",
        color: color(p.color),
      } as Block
    case "divider":
      return newBlock("divider")
    case "spacer": {
      const size = Number(p.size)
      return newBlock("spacer", { size: (SPACER_SIZES as readonly number[]).includes(size) ? size : 32 } as Partial<Block>)
    }
    default:
      return null
  }
}

/* ─── The old editor's plain HTML ────────────────────────────────────── */

const BLOCKISH = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "table", "center", "section", "hr", "img", "figure"])

/** An element that is only a picture, maybe inside a link. */
function pictureOf(el: HElement): { src: string; alt: string; href: string } | null {
  const kids = el.children.filter((c) => !(c.type === "text" && !c.value.trim()) && !(c.type === "el" && c.name === "br"))
  if (el.name === "img") {
    const src = safeImageSrc(el.attrs.src)
    return src ? { src, alt: str(el.attrs.alt, 300), href: "" } : null
  }
  if (kids.length !== 1 || kids[0].type !== "el") return null
  const k = kids[0]
  if (k.name === "img") {
    const src = safeImageSrc(k.attrs.src)
    return src ? { src, alt: str(k.attrs.alt, 300), href: el.name === "a" ? safeUrl(el.attrs.href) : "" } : null
  }
  if (k.name === "a" || k.name === "div" || k.name === "p" || k.name === "figure") {
    const inner = pictureOf(k)
    return inner ? { ...inner, href: inner.href || (k.name === "a" ? safeUrl(k.attrs.href) : "") } : null
  }
  return null
}

/** An element that is only a link drawn as a button. */
function buttonOf(el: HElement): { label: string; url: string; color: string } | null {
  const kids = el.children.filter((c) => !(c.type === "text" && !c.value.trim()) && !(c.type === "el" && c.name === "br"))
  if (kids.length !== 1 || kids[0].type !== "el") return null
  const k = kids[0]
  if (k.name === "a" && isButtonShaped(k.attrs.style ?? "")) {
    const label = decodeHtmlEntities(nodesToHtml(k.children).replace(/<[^>]*>/g, "")).trim()
    const bg = new Map(parseStyle(k.attrs.style ?? "")).get("background-color") ?? ""
    return label ? { label: label.slice(0, 80), url: safeUrl(k.attrs.href), color: safeColor(bg, "") } : null
  }
  if (["span", "div", "p", "center", "td", "tr", "tbody", "table"].includes(k.name)) return buttonOf(k)
  return null
}

function fromPlain(nodes: HNode[]): Block[] {
  const out: Block[] = []
  let run: HNode[] = []
  const flush = () => {
    if (!run.length) return
    const html = richOf(run)
    if (html && html !== "<p><br></p>") out.push({ id: blockId(), type: "rich", html })
    run = []
  }
  for (const node of nodes) {
    if (node.type === "el" && BLOCKISH.has(node.name)) {
      const pic = pictureOf(node)
      if (pic) {
        flush()
        out.push({ ...(newBlock("image") as Block), src: pic.src, alt: pic.alt, href: pic.href } as Block)
        continue
      }
      const button = buttonOf(node)
      if (button) {
        flush()
        out.push({ ...(newBlock("button") as Block), label: button.label, url: button.url, align: alignOf(node) === "left" ? "left" : alignOf(node), color: button.color } as Block)
        continue
      }
      if (node.name === "hr") {
        flush()
        out.push(newBlock("divider"))
        continue
      }
      /* A wrapper the old editor put around everything: look inside it. */
      if ((node.name === "div" || node.name === "table" || node.name === "center" || node.name === "section") && node.children.some((c) => c.type === "el" && BLOCKISH.has(c.name))) {
        flush()
        out.push(...fromPlain(tableless(node)))
        continue
      }
    }
    run.push(node)
  }
  flush()
  return out
}

/** A layout table's cells, in reading order, as plain children. */
function tableless(el: HElement): HNode[] {
  if (!["table", "thead", "tbody", "tfoot", "tr", "td", "th"].includes(el.name)) return el.children
  return el.children.flatMap((c) => (c.type === "el" && ["thead", "tbody", "tfoot", "tr", "td", "th"].includes(c.name) ? tableless(c) : [c]))
}

function markedIn(nodes: HNode[]): boolean {
  return nodes.some((n) => n.type === "el" && (n.attrs["data-sl-block"] !== undefined || markedIn(n.children)))
}

export interface StoredBody {
  blocks: Block[]
  /** Written by the old editor: no block markers anywhere. */
  legacy: boolean
}

/** The blocks a saved body holds. An empty body is one empty text block. */
export function readStoredBody(html: string | null | undefined): StoredBody {
  const root = parseHtml(String(html ?? ""))
  if (!markedIn(root.children)) {
    const blocks = fromPlain(root.children)
    return { blocks: blocks.length ? blocks : [newBlock("rich")], legacy: true }
  }
  const out: Block[] = []
  const walk = (nodes: HNode[]) => {
    for (const n of nodes) {
      if (n.type !== "el") continue
      if (n.attrs["data-sl-block"] !== undefined) {
        const b = fromMarked(n)
        if (b) out.push(b)
      } else walk(n.children)
    }
  }
  walk(root.children)
  return { blocks: out.length ? out : [newBlock("rich")], legacy: false }
}
