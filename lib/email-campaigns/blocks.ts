/**
 * ===========================================================================
 *  AN EMAIL AS BLOCKS, AND THE HTML AN INBOX CAN READ
 * ===========================================================================
 * The compose page edits a list of blocks: text, headings, lists, a button,
 * an image, a product, a divider, a spacer. What goes out is HTML that mail
 * clients render the same way: tables for anything laid out, every style
 * written inline, widths in pixels with a percentage fallback.
 *
 * The same function renders the preview and the send, so what the creator
 * sees on the right of the editor is the email. Each block's wrapper carries
 * `data-sl-block` and, for the blocks that are not free text, its settings
 * as JSON in `data-sl-props`, so a saved draft opens back into exactly the
 * blocks it was written as without a second copy in another column. The
 * send strips those attributes (lib/email-campaigns/sanitize.ts).
 *
 * Pure and browser-safe: the editor, the preview and the server import it.
 */

export type Align = "left" | "center" | "right"
export type TextStyle = "p" | "h1" | "h2" | "h3" | "quote"

interface Base {
  id: string
}

export interface TextBlock extends Base {
  type: "text"
  style: TextStyle
  /** Inline HTML only: b, i, u, s, a, br. */
  html: string
  align: Align
}

export interface ListBlock extends Base {
  type: "list"
  ordered: boolean
  /** One entry per item, inline HTML. */
  items: string[]
}

export interface ButtonBlock extends Base {
  type: "button"
  label: string
  url: string
  align: Align
  color: string
}

export interface ImageBlock extends Base {
  type: "image"
  src: string
  alt: string
  /** Percent of the content width. */
  width: number
  align: Align
  href: string
}

export interface ProductBlock extends Base {
  type: "product"
  productId: string
  title: string
  price: string
  imageUrl: string
  url: string
  cta: string
  color: string
}

export interface DividerBlock extends Base {
  type: "divider"
}

export interface SpacerBlock extends Base {
  type: "spacer"
  size: number
}

export type Block = TextBlock | ListBlock | ButtonBlock | ImageBlock | ProductBlock | DividerBlock | SpacerBlock
export type BlockType = Block["type"]

/** The content column inside a 600px email with 40px either side. */
export const CONTENT_WIDTH = 520
export const IMAGE_WIDTHS = [100, 75, 50, 33] as const
export const SPACER_SIZES = [16, 32, 48] as const
export const DEFAULT_ACCENT = "#1a1a2e"
export const SWATCHES = ["#1a1a2e", "#8b5cf6", "#2563eb", "#0f766e", "#16a34a", "#dc2626", "#ea580c"] as const

const INK = "#1f2937"
const HEAD = "#111827"
const MUTED = "#4b5563"
const LINE = "#e5e7eb"
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

let counter = 0
export function blockId(): string {
  counter = (counter + 1) % 1_000_000
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function newBlock(type: BlockType, init: Partial<Block> = {}): Block {
  const id = blockId()
  switch (type) {
    case "text":
      return { id, type, style: "p", html: "", align: "left", ...(init as Partial<TextBlock>) }
    case "list":
      return { id, type, ordered: false, items: [""], ...(init as Partial<ListBlock>) }
    case "button":
      return { id, type, label: "", url: "", align: "center", color: DEFAULT_ACCENT, ...(init as Partial<ButtonBlock>) }
    case "image":
      return { id, type, src: "", alt: "", width: 100, align: "center", href: "", ...(init as Partial<ImageBlock>) }
    case "product":
      return { id, type, productId: "", title: "", price: "", imageUrl: "", url: "", cta: "View product", color: DEFAULT_ACCENT, ...(init as Partial<ProductBlock>) }
    case "divider":
      return { id, type }
    case "spacer":
      return { id, type, size: 32, ...(init as Partial<SpacerBlock>) }
  }
}

/* ─── Small, careful helpers ─────────────────────────────────────────── */

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

export function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/** A colour we write into a style attribute: #rgb or #rrggbb, or the default. */
export function safeColor(c: unknown, fallback = DEFAULT_ACCENT): string {
  return typeof c === "string" && /^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/i.test(c.trim()) ? c.trim().toLowerCase() : fallback
}

/** White or ink on a background, whichever reads. */
export function textOn(bg: string): string {
  const hex = safeColor(bg).slice(1)
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.45 ? "#111827" : "#ffffff"
}

/**
 * A link a reader can follow: http(s), mailto, tel. A bare domain gets
 * https. Anything else (javascript:, data:, a relative path that means
 * nothing in an inbox) is refused as "".
 */
export function safeUrl(raw: unknown): string {
  if (typeof raw !== "string") return ""
  let url = raw.trim()
  if (!url) return ""
  if (/^(mailto|tel):/i.test(url)) return /[\s<>"]/.test(url) ? "" : url
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (url.startsWith("//") || url.startsWith("/")) return ""
    url = `https://${url}`
  }
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return ""
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return ""
    return u.toString()
  } catch {
    return ""
  }
}

/** An image source we will put in an email: https, or http for an old upload. */
export function safeImageSrc(raw: unknown): string {
  const url = safeUrl(raw)
  return /^https?:\/\//i.test(url) ? url : ""
}

function props(block: Block): string {
  const { id: _id, type: _type, ...rest } = block as Block & Record<string, unknown>
  void _id
  void _type
  if (block.type === "text" || block.type === "list") return ""
  return ` data-sl-props="${escapeAttr(JSON.stringify(rest))}"`
}

function mark(block: Block): string {
  return `data-sl-block="${block.type}"${props(block)}`
}

const TEXT_STYLE: Record<TextStyle, { tag: string; css: string }> = {
  p: { tag: "p", css: `margin:0 0 16px;font-size:16px;line-height:26px;color:${INK};` },
  h1: { tag: "h1", css: `margin:8px 0 16px;font-size:28px;line-height:36px;font-weight:700;color:${HEAD};` },
  h2: { tag: "h2", css: `margin:8px 0 12px;font-size:22px;line-height:30px;font-weight:700;color:${HEAD};` },
  h3: { tag: "h3", css: `margin:4px 0 10px;font-size:18px;line-height:26px;font-weight:600;color:${HEAD};` },
  quote: { tag: "blockquote", css: `margin:0 0 16px;padding:2px 0 2px 16px;border-left:3px solid ${LINE};font-size:16px;line-height:26px;color:${MUTED};font-style:italic;` },
}

/**
 * Links inside text get the same look everywhere, whatever the editor or a
 * paste put on them.
 */
function styleInlineLinks(html: string): string {
  return html.replace(/<a\s+([^>]*?)>/gi, (_m, attrs: string) => {
    const href = /href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']*)'/i.exec(attrs)?.[1] ?? ""
    const url = safeUrl(href.replace(/&amp;/g, "&"))
    if (!url) return "<a>"
    return `<a href="${escapeAttr(url)}" style="color:${HEAD};text-decoration:underline;">`
  })
}

function isBlankInline(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/&nbsp;| |​/g, "").replace(/<[^>]*>/g, "").trim() === ""
}

/* ─── Rendering ──────────────────────────────────────────────────────── */

function alignTable(align: Align, inner: string, attrs: string, bottom = 16): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${attrs} style="border-collapse:collapse;margin:0 0 ${bottom}px;"><tr><td align="${align}" style="text-align:${align};">${inner}</td></tr></table>`
}

export function renderBlock(block: Block): string {
  switch (block.type) {
    case "text": {
      const { tag, css } = TEXT_STYLE[block.style] ?? TEXT_STYLE.p
      const body = isBlankInline(block.html) ? "<br>" : styleInlineLinks(block.html)
      const align = block.align && block.align !== "left" ? `text-align:${block.align};` : ""
      return `<${tag} ${mark(block)} data-sl-style="${block.style}" style="${css}${align}font-family:${FONT};">${body}</${tag}>`
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul"
      const items = (block.items.length ? block.items : [""])
        .map((i) => `<li style="margin:0 0 6px;padding-left:4px;">${isBlankInline(i) ? "<br>" : styleInlineLinks(i)}</li>`)
        .join("")
      return `<${tag} ${mark(block)} style="margin:0 0 16px;padding:0 0 0 24px;font-size:16px;line-height:26px;color:${INK};font-family:${FONT};">${items}</${tag}>`
    }
    case "button": {
      const url = safeUrl(block.url)
      const bg = safeColor(block.color)
      const fg = textOn(bg)
      const label = escapeHtml(block.label.trim() || "Button")
      const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${block.align}" style="border-collapse:separate;${block.align === "center" ? "margin:0 auto;" : ""}"><tr><td align="center" bgcolor="${bg}" style="border-radius:8px;background-color:${bg};"><a href="${escapeAttr(url || "#")}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${fg};text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`
      return alignTable(block.align, inner, mark(block), 20)
    }
    case "image": {
      const src = safeImageSrc(block.src)
      if (!src) return alignTable(block.align, "", mark(block), 0)
      const width = Math.round((CONTENT_WIDTH * Math.max(10, Math.min(100, block.width || 100))) / 100)
      const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(block.alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;${block.align === "center" ? "margin:0 auto;" : block.align === "right" ? "margin:0 0 0 auto;" : ""}">`
      const href = safeUrl(block.href)
      return alignTable(block.align, href ? `<a href="${escapeAttr(href)}" style="text-decoration:none;">${img}</a>` : img, mark(block), 16)
    }
    case "product": {
      const url = safeUrl(block.url)
      const bg = safeColor(block.color)
      const fg = textOn(bg)
      const img = safeImageSrc(block.imageUrl)
      const imageCell = img
        ? `<td width="112" valign="top" style="width:112px;padding:16px 0 16px 16px;"><a href="${escapeAttr(url || "#")}" style="text-decoration:none;"><img src="${escapeAttr(img)}" alt="${escapeAttr(block.title)}" width="96" height="96" style="display:block;width:96px;height:96px;border:0;border-radius:8px;object-fit:cover;"></a></td>`
        : ""
      const price = block.price ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:22px;color:${MUTED};">${escapeHtml(block.price)}</p>` : ""
      const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid ${LINE};border-radius:12px;"><tr>${imageCell}<td valign="middle" style="padding:16px;"><p style="margin:0 0 4px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;color:${HEAD};">${escapeHtml(block.title || "Product")}</p>${price}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td bgcolor="${bg}" style="border-radius:8px;background-color:${bg};"><a href="${escapeAttr(url || "#")}" style="display:inline-block;padding:9px 16px;font-family:${FONT};font-size:14px;line-height:18px;font-weight:600;color:${fg};text-decoration:none;">${escapeHtml(block.cta.trim() || "View product")}</a></td></tr></table></td></tr></table>`
      return alignTable("left", inner, mark(block), 20)
    }
    case "divider":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${mark(block)} style="border-collapse:collapse;margin:8px 0 24px;"><tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`
    case "spacer": {
      const h = SPACER_SIZES.includes(block.size as 16) ? block.size : 32
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${mark(block)} style="border-collapse:collapse;"><tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
    }
  }
}

/** The body of the email: every block, in order. */
export function renderBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n")
}

/* ─── What a block holds, for "is there anything here" ───────────────── */

export function blockHasContent(block: Block): boolean {
  switch (block.type) {
    case "text":
      return !isBlankInline(block.html)
    case "list":
      return block.items.some((i) => !isBlankInline(i))
    case "button":
      return !!block.label.trim() && !!safeUrl(block.url)
    case "image":
      return !!safeImageSrc(block.src)
    case "product":
      return !!block.title && !!safeUrl(block.url)
    default:
      return false
  }
}

export function hasRealContent(blocks: Block[]): boolean {
  return blocks.some(blockHasContent)
}

/**
 * What is unfinished, so Send can say so instead of mailing a button that
 * goes nowhere. An error stops a send; a warning is said and does not.
 */
export interface BlockIssue {
  id: string
  message: string
  level: "error" | "warning"
}

export function blockIssues(blocks: Block[]): BlockIssue[] {
  const out: BlockIssue[] = []
  for (const b of blocks) {
    if (b.type === "button") {
      if (!b.label.trim()) out.push({ id: b.id, level: "error", message: "A button has no label." })
      else if (!safeUrl(b.url)) out.push({ id: b.id, level: "error", message: `The button "${b.label.trim()}" has no link.` })
    }
    if (b.type === "image") {
      if (!safeImageSrc(b.src)) out.push({ id: b.id, level: "error", message: "An image block has no image." })
      else if (!b.alt.trim()) out.push({ id: b.id, level: "warning", message: "An image has no description for people who cannot see it." })
    }
    if (b.type === "product" && (!b.productId || !safeUrl(b.url))) out.push({ id: b.id, level: "error", message: "A product block has no product chosen." })
  }
  return out
}
