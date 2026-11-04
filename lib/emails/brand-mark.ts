/**
 * ===========================================================================
 *  THE STORE'S LOGO AT THE TOP OF AN EMAIL, ONE WAY FOR EVERY EMAIL
 * ===========================================================================
 * Round 43, the owner: a "loud LIB." wordmark arrived as "OUC" in a black
 * circle (the refund drew every picture as a round avatar), while the
 * receipt showed the same logo whole in a rounded box. Every email now draws
 * its sender the way Shopify's do:
 *
 *   a logo           the picture at its own shape, at most 40px tall and
 *                    200px wide, never cropped, never cut round, alone: the
 *                    logo is the name (its alt says it for a reader). Its
 *                    corners have the store logo's small radius and it has
 *                    no shadow (round 49, lib/brand/store-logo.ts)
 *   a square icon    the same picture (a profile photo, a square mark), the
 *                    store's name beside it, as an icon alone says nothing
 *   no picture       the store's name in type, after its initial on a tile
 *                    when the email draws one (lib/emails/layout.ts tile)
 *
 * A logo whose shape is not known when the email is drawn (the templates are
 * pure, they never fetch) is drawn as a logo, with the name beside it kept in
 * a comment. At send, lib/emails/logo-shape-server.ts reads the picture's
 * size once and, for a square one, opens the comment: the same markup, the
 * name beside it. Nothing else in the email changes.
 *
 * Pure: used by lib/emails/layout.ts (every transactional email, the
 * notification engine's, the physical ones, review requests, community
 * emails) and lib/email-campaigns/template.ts (campaigns).
 */

import { STORE_LOGO_RADIUS } from "@/lib/brand/store-logo"

/** The tallest a logo is drawn, in CSS pixels. */
export const LOGO_MAX_H = 40
/** The widest a logo is drawn. */
export const LOGO_MAX_W = 200
/** A picture wider than this many times its height is a logo; up to it, a square icon with the name beside it. */
export const SQUARE_UP_TO = 1.3
/** The width a logo's file is asked for (lib/email-campaigns/sender emailImageSrc doubles it for a sharp phone). */
export const LOGO_FILE_PX = LOGO_MAX_W

export type LogoShape = "wide" | "square" | "auto"

/** A shape from a picture's size: square up to SQUARE_UP_TO, wide past it. */
export function shapeOfSize(size: { width: number; height: number } | null | undefined): "wide" | "square" | null {
  if (!size || !(size.width > 0) || !(size.height > 0)) return null
  return size.width / size.height <= SQUARE_UP_TO ? "square" : "wide"
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * The picture itself: its own aspect ratio inside 200 by 40. Both sides
 * auto with a max on each, so a wide one stops at 200px wide and a tall one
 * at 40px tall, and neither is ever stretched or cropped. The height
 * attribute is what Outlook on Windows reads, which ignores max-*.
 *
 * The store logo's small corner (round 49, lib/brand/store-logo.ts), on the
 * picture itself so a wordmark's own four corners are the ones rounded.
 * Outlook on Windows ignores border-radius on a picture and draws it square,
 * which is fine. No shadow.
 */
export function logoImg(src: string, alt: string, cls = "e-store-logo", extra = ""): string {
  return `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" height="${LOGO_MAX_H}"${extra} style="display:block;width:auto;height:auto;max-width:${LOGO_MAX_W}px;max-height:${LOGO_MAX_H}px;border:0;border-radius:${STORE_LOGO_RADIUS}px;outline:none;text-decoration:none;">`
}

/** Where the name stands beside an icon, for a comment: "--" can never close it early. */
const commentSafe = (html: string) => html.replace(/--/g, "-&#45;")

export interface BrandMarkInput {
  name: string
  /** An https picture, already sized; null draws the name alone. */
  src: string | null
  shape: LogoShape
  /** The name's type: font, size, colour (the email's own). */
  font: string
  ink: string
  size?: number
  lineHeight?: number
  /** The side the name is on: "left" in a right to left email. */
  start?: "left" | "right"
  nameClass?: string
  /** With no picture: what stands before the name (the layout's initial tile), as HTML. None, the name alone. */
  initial?: string | null
}

export function brandNameHtml(i: BrandMarkInput, beside: boolean): string {
  const size = i.size ?? 16
  const lh = i.lineHeight ?? 22
  const pad = beside ? `padding-${i.start ?? "left"}:10px;` : ""
  return `<td class="${i.nameClass ?? "e-mark"}" style="vertical-align:middle;${pad}font-family:${i.font};font-size:${size}px;line-height:${lh}px;font-weight:700;color:${i.ink};">${esc(i.name.trim() || "Store")}</td>`
}

/**
 * The mark as HTML: a one row table, so a name beside an icon stays on its
 * line in every client. `data-logo-shape` says what it was drawn as.
 */
export function brandMarkHtml(i: BrandMarkInput): string {
  const name = i.name.trim() || "Store"
  const table = (cells: string, shape: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-logo-shape="${shape}"><tr>${cells}</tr></table>`
  if (!i.src) return table(i.initial ? `<td style="vertical-align:middle;">${i.initial}</td>${brandNameHtml(i, true)}` : brandNameHtml(i, false), "none")
  if (i.shape === "square") return table(`<td style="vertical-align:middle;">${logoImg(i.src, "")}</td>${brandNameHtml(i, true)}`, "square")
  const img = `<td style="vertical-align:middle;">${logoImg(i.src, name)}</td>`
  if (i.shape === "wide") return table(img, "wide")
  /* Not known yet: a logo, with the name beside it waiting in a comment for lib/emails/logo-shape-server.ts. */
  return table(`${img}<!--e-logo-name${commentSafe(brandNameHtml(i, true))}e-logo-name-->`, "auto")
}

const AUTO = /<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-logo-shape="auto"><tr><td style="vertical-align:middle;">(<img class="[^"]*" src="([^"]*)" alt=")([^"]*)("[^>]*>)<\/td><!--e-logo-name([\s\S]*?)e-logo-name--><\/tr><\/table>/g

/** The pictures drawn before their shape was known, by their src (HTML escaped, as in the markup). */
export function autoLogoSources(html: string): string[] {
  const out = new Set<string>()
  for (const m of html.matchAll(AUTO)) out.add(m[2])
  return [...out]
}

/**
 * Each mark drawn before its shape was known, settled: a square picture gets
 * the name beside it (and an empty alt, the name being there in words), a
 * wide one stays alone. A picture missing from `shapes` stays as drawn.
 */
export function settleBrandMarks(html: string, shapes: ReadonlyMap<string, "wide" | "square" | null>): string {
  if (!html.includes("data-logo-shape=\"auto\"")) return html
  return html.replace(AUTO, (whole, imgStart: string, src: string, _alt: string, imgEnd: string, nameCell: string) => {
    const shape = shapes.get(src)
    if (shape === "square") return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-logo-shape="square"><tr><td style="vertical-align:middle;">${imgStart}${imgEnd}</td>${nameCell.replace(/-&#45;/g, "--")}</tr></table>`
    if (shape === "wide") return whole.replace('data-logo-shape="auto"', 'data-logo-shape="wide"').replace(/<!--e-logo-name[\s\S]*?e-logo-name-->/, "")
    return whole
  })
}
