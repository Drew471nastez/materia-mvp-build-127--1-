/**
 * ===========================================================================
 *  AN EMAIL AS BLOCKS, AND THE HTML AN INBOX CAN READ
 * ===========================================================================
 * The compose page edits a column of blocks: text (written in the shared
 * rich text field, so headings, lists, quotes and links live inside it), a
 * button, an image, a product, a divider, a space.
 *
 * Two writers:
 *
 *   storeBlocks    what is saved: each block in a <div data-sl-block> with
 *                  its settings as JSON in data-sl-props, and a text block's
 *                  HTML exactly as the editor wrote it, so a draft reopens as
 *                  the blocks it was written as (lib/email-campaigns/stored.ts
 *                  reads it back, in the browser and on the server)
 *   renderBlocks   what is sent, and what the preview shows: tables for
 *                  anything laid out, every style inline, the brand's colours
 *                  (lib/email-campaigns/brand.ts), and no markers
 *
 * The server never sends the saved HTML as it is. It reads the blocks back
 * out of it and renders them itself, with the brand as it is at that moment,
 * so what goes out is always HTML this file wrote.
 *
 * Pure and browser-safe: the editor, the preview and the server import it.
 */
import { DEFAULT_ACCENT, buttonColors, textOn as readableOn, themeOf, type EmailTheme } from "./brand"
import { FONT, HEAD, LINE, MUTED, TEXT, buttonHtml, emailHref, emailImageSrc, esc, richToEmail } from "./rich"
import { inboxImageSrc } from "./sender"

export type Align = "left" | "center" | "right"
/** The old editor's text styles, still read from drafts it saved. */
export type TextStyle = "p" | "h1" | "h2" | "h3" | "quote"

interface Base {
  id: string
}

/** Text, as the rich text field writes it: paragraphs, headings, lists, quotes, links. */
export interface RichBlock extends Base {
  type: "rich"
  html: string
}

/** A paragraph from a draft saved before the rich text field. Read, then turned into rich text. */
export interface TextBlock extends Base {
  type: "text"
  style: TextStyle
  html: string
  align: Align
}

/** A list from a draft saved before the rich text field. */
export interface ListBlock extends Base {
  type: "list"
  ordered: boolean
  items: string[]
}

export interface ButtonBlock extends Base {
  type: "button"
  label: string
  url: string
  align: Align
  /** "" for the brand's colour, read when the email is sent. */
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
  /** "" for the brand's colour. */
  color: string
}

export interface DividerBlock extends Base {
  type: "divider"
}

export interface SpacerBlock extends Base {
  type: "spacer"
  size: number
}

export type Block = RichBlock | TextBlock | ListBlock | ButtonBlock | ImageBlock | ProductBlock | DividerBlock | SpacerBlock
export type BlockType = Block["type"]

/** The content column inside a 600px email with 40px either side. */
export const CONTENT_WIDTH = 520
export const IMAGE_WIDTHS = [100, 75, 50, 33] as const
export const SPACER_SIZES = [16, 32, 48] as const
export { DEFAULT_ACCENT }
/** The colour a button takes when none is chosen: the brand's, at send time. */
export const BRAND_COLOR = ""
export const SWATCHES = ["#1a1a2e", "#8b5cf6", "#2563eb", "#0f766e", "#16a34a", "#dc2626", "#ea580c"] as const

/** How the preview draws before the brand has loaded, and a test with no brand. */
export const PLAIN_THEME: EmailTheme = themeOf({ accent: DEFAULT_ACCENT })

let counter = 0
export function blockId(): string {
  counter = (counter + 1) % 1_000_000
  return `b${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function newBlock(type: BlockType, init: Partial<Block> = {}): Block {
  const id = blockId()
  switch (type) {
    case "rich":
      return { id, type, html: "", ...(init as Partial<RichBlock>) }
    case "text":
      return { id, type, style: "p", html: "", align: "left", ...(init as Partial<TextBlock>) }
    case "list":
      return { id, type, ordered: false, items: [""], ...(init as Partial<ListBlock>) }
    case "button":
      return { id, type, label: "", url: "", align: "center", color: BRAND_COLOR, ...(init as Partial<ButtonBlock>) }
    case "image":
      return { id, type, src: "", alt: "", width: 100, align: "center", href: "", ...(init as Partial<ImageBlock>) }
    case "product":
      return { id, type, productId: "", title: "", price: "", imageUrl: "", url: "", cta: "View product", color: BRAND_COLOR, ...(init as Partial<ProductBlock>) }
    case "divider":
      return { id, type }
    case "spacer":
      return { id, type, size: 32, ...(init as Partial<SpacerBlock>) }
  }
}

/* ─── Small, careful helpers ─────────────────────────────────────────── */

export function escapeHtml(s: string): string {
  return esc(String(s ?? ""))
}

export function escapeAttr(s: string): string {
  return escapeHtml(s)
}

/** A colour for a style attribute: #rgb or #rrggbb, or the fallback. */
export function safeColor(c: unknown, fallback = DEFAULT_ACCENT): string {
  return typeof c === "string" && /^#[0-9a-f]{6}$|^#[0-9a-f]{3}$/i.test(c.trim()) ? c.trim().toLowerCase() : fallback
}

/** White or ink on a fill, whichever reads (lib/email-campaigns/brand.ts). */
export function textOn(bg: string): string {
  return readableOn(safeColor(bg))
}

/**
 * A link a reader can follow, as typed into a block's settings: https (a
 * bare domain gets https, http is upgraded), mailto, tel. Anything else
 * (javascript:, data:, a relative path that means nothing in an inbox) is
 * refused as "".
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
    if (!u.hostname.includes(".") || u.username || u.password) return ""
    u.protocol = "https:"
    return u.toString()
  } catch {
    return ""
  }
}

/** A picture we will put in an email: https only. */
export function safeImageSrc(raw: unknown): string {
  return emailImageSrc(typeof raw === "string" ? raw : null) ?? ""
}

function isBlankInline(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/&nbsp;| |​/g, "").replace(/<[^>]*>/g, "").trim() === ""
}

/* ─── The old text and list blocks, as rich text ─────────────────────── */

const LEGACY_TAG: Record<TextStyle, string> = { p: "p", h1: "h2", h2: "h2", h3: "h3", quote: "blockquote" }

/** A paragraph or list from an older draft, as the rich text field's HTML. */
export function legacyToRich(b: TextBlock | ListBlock): string {
  if (b.type === "list") {
    const tag = b.ordered ? "ol" : "ul"
    const items = b.items.filter((i) => !isBlankInline(i)).map((i) => `<li>${i}</li>`).join("")
    return items ? `<${tag}>${items}</${tag}>` : ""
  }
  if (isBlankInline(b.html)) return ""
  const tag = LEGACY_TAG[b.style] ?? "p"
  const align = b.align && b.align !== "left" ? ` style="text-align: ${b.align}"` : ""
  return tag === "blockquote" ? `<blockquote><p>${b.html}</p></blockquote>` : `<${tag}${align}>${b.html}</${tag}>`
}

/* ─── Rendering, as sent ─────────────────────────────────────────────── */

function alignTable(align: Align, inner: string, bottom = 16): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 ${bottom}px;"><tr><td align="${align}" style="text-align:${align};">${inner}</td></tr></table>`
}

export function renderBlock(block: Block, theme: EmailTheme = PLAIN_THEME): string {
  switch (block.type) {
    case "rich":
      return richToEmail(block.html, theme)
    case "text":
    case "list":
      return richToEmail(legacyToRich(block), theme)
    case "button": {
      const url = emailHref(safeUrl(block.url))
      const c = buttonColors(block.color, theme)
      const label = escapeHtml(block.label.trim() || "Button")
      if (!url) return ""
      return alignTable(block.align, buttonHtml({ href: url, label, fill: c.fill, text: c.text, align: block.align }), 20)
    }
    case "image": {
      const stored = safeImageSrc(block.src)
      if (!stored) return ""
      const width = Math.round((CONTENT_WIDTH * Math.max(10, Math.min(100, block.width || 100))) / 100)
      /* The block keeps the stored address; what is sent is sized for the inbox (./sender inboxImageSrc). */
      const src = inboxImageSrc(stored, width) ?? stored
      const margin = block.align === "center" ? "margin:0 auto;" : block.align === "right" ? "margin:0 0 0 auto;" : ""
      const img = `<img src="${escapeAttr(src)}" alt="${escapeAttr(block.alt.slice(0, 300))}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;${margin}">`
      const href = emailHref(safeUrl(block.href))
      return alignTable(block.align, href ? `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img, 16)
    }
    case "product": {
      const url = emailHref(safeUrl(block.url))
      if (!url || !block.title) return ""
      const c = buttonColors(block.color, theme)
      const stored = safeImageSrc(block.imageUrl)
      const img = stored ? inboxImageSrc(stored, 96) ?? stored : ""
      const imageCell = img
        ? `<td width="112" valign="top" style="width:112px;padding:16px 0 16px 16px;"><a href="${escapeAttr(url)}" target="_blank" style="text-decoration:none;"><img src="${escapeAttr(img)}" alt="${escapeAttr(block.title)}" width="96" height="96" style="display:block;width:96px;height:96px;border:0;border-radius:8px;object-fit:cover;"></a></td>`
        : ""
      const price = block.price ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:22px;color:${MUTED};">${escapeHtml(block.price)}</p>` : ""
      const cta = buttonHtml({ href: url, label: escapeHtml(block.cta.trim() || "View product"), fill: c.fill, text: c.text, size: "sm" })
      const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sl-product" style="border-collapse:separate;border:1px solid ${LINE};border-radius:12px;"><tr>${imageCell}<td valign="middle" style="padding:16px;"><p style="margin:0 0 4px;font-family:${FONT};font-size:17px;line-height:24px;font-weight:600;color:${HEAD};">${escapeHtml(block.title)}</p>${price}${cta}</td></tr></table>`
      return alignTable("left", inner, 20)
    }
    case "divider":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 24px;"><tr><td class="sl-rule" style="border-top:1px solid ${LINE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`
    case "spacer": {
      const h = SPACER_SIZES.includes(block.size as 16) ? block.size : 32
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
    }
  }
}

/** The body of the email as sent: every block, in order, in the brand's colours. */
export function renderBlocks(blocks: Block[], theme: EmailTheme = PLAIN_THEME): string {
  return blocks.map((b) => renderBlock(b, theme)).filter(Boolean).join("\n")
}

/* ─── Storing ────────────────────────────────────────────────────────── */

function settingsOf(block: Block): Record<string, unknown> {
  const { id: _id, type: _type, ...rest } = block as Block & Record<string, unknown>
  void _id
  void _type
  return rest
}

/**
 * What is saved. A text block keeps the editor's own HTML; any other block
 * keeps its settings, and its rendering inside so older readers of the
 * column still see the email.
 */
export function storeBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.type === "rich") return `<div data-sl-block="rich">${b.html}</div>`
      if (b.type === "text" || b.type === "list") return `<div data-sl-block="rich">${legacyToRich(b)}</div>`
      return `<div data-sl-block="${b.type}" data-sl-props="${escapeAttr(JSON.stringify(settingsOf(b)))}">${renderBlock(b)}</div>`
    })
    .join("\n")
}

/* ─── What a block holds, for "is there anything here" ───────────────── */

export function blockHasContent(block: Block): boolean {
  switch (block.type) {
    case "rich":
      return !isBlankInline(block.html) || /<(hr|img)\b/i.test(block.html)
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
      if (!b.label.trim()) out.push({ id: b.id, level: "error", message: "A button has no text." })
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

export { TEXT, HEAD, MUTED, LINE, FONT }
