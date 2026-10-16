/**
 * ===========================================================================
 *  HOW A COMMUNITY'S PAGE LOOKS, BEYOND ITS WORDS (round 33)
 * ===========================================================================
 * Two things the creator now sets in the Page editor
 * (components/community/creator/page-editor):
 *
 *   THE COVER'S FOCUS   where the picture sits in every frame that crops it
 *                       (the About page, the side card, the community card,
 *                       Explore): x and y, 0 to 100, as CSS object-position.
 *                       Dragged on the cover in the editor. 50 50 is the
 *                       middle, which is what every cover did before.
 *   THE JOIN BUTTON     its words ("Join for free", "Get access"), its style
 *                       (ink, the community's own colour taken from its logo,
 *                       or an outline) and one short line under it.
 *
 * Kept in communities.onboarding.page, beside the welcome steps and slow
 * mode, so no column is added (lib/communities/server/creator.ts keeps it
 * when the welcome is saved). Missing, or anything it does not recognise,
 * reads as the page as it always was.
 *
 * Pure and browser safe: the server, the About page, the editor and the
 * tests read it.
 */

export const JOIN_STYLES = ["ink", "brand", "outline"] as const
export type JoinStyle = (typeof JOIN_STYLES)[number]

export const JOIN_LABEL_MAX = 32
export const JOIN_NOTE_MAX = 90

export interface PageLook {
  coverX: number
  coverY: number
  /** The button's own words, or "" for the words the page picks (Join, Request to join, Join for $19/month). */
  joinLabel: string
  joinStyle: JoinStyle
  /** One short line under the button, or "". */
  joinNote: string
  /** The community's colour, from its logo (#rrggbb), for the brand style; null until one was taken. */
  brand: string | null
}

export const DEFAULT_LOOK: PageLook = { coverX: 50, coverY: 50, joinLabel: "", joinStyle: "ink", joinNote: "", brand: null }

const HEX = /^#[0-9a-f]{6}$/i

function pct(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50
}

function words(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

/** The look from anything (a settings body, a stored row): every field checked on its own, the default where it is not one. */
export function cleanLook(raw: unknown): PageLook {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const style = JOIN_STYLES.includes(r.joinStyle as JoinStyle) ? (r.joinStyle as JoinStyle) : "ink"
  const brand = typeof r.brand === "string" && HEX.test(r.brand) ? r.brand.toLowerCase() : null
  return { coverX: pct(r.coverX), coverY: pct(r.coverY), joinLabel: words(r.joinLabel, JOIN_LABEL_MAX), joinStyle: style === "brand" && !brand ? "ink" : style, joinNote: words(r.joinNote, JOIN_NOTE_MAX), brand }
}

/** The look a community's stored settings hold (communities.onboarding.page). */
export function pageLookOf(onboarding: unknown): PageLook {
  const page = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>).page : undefined
  return cleanLook(page)
}

/** The same settings with this look, everything else in them kept. The default look is stored as nothing. */
export function withPageLook(onboarding: unknown, look: PageLook): Record<string, unknown> {
  const base = onboarding && typeof onboarding === "object" ? { ...(onboarding as Record<string, unknown>) } : {}
  if (sameLook(look, DEFAULT_LOOK)) delete base.page
  else base.page = look
  return base
}

/** The part of the settings the look owns, so saving the welcome steps never drops it. */
export function keptLook(onboarding: unknown): { page?: PageLook } {
  const page = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>).page : undefined
  return page && typeof page === "object" ? { page: cleanLook(page) } : {}
}

export function sameLook(a: PageLook, b: PageLook): boolean {
  return a.coverX === b.coverX && a.coverY === b.coverY && a.joinLabel === b.joinLabel && a.joinStyle === b.joinStyle && a.joinNote === b.joinNote && a.brand === b.brand
}

/** CSS object-position for the cover, or undefined for the middle (so a cover nobody moved carries no style). */
export function coverPosition(look: Pick<PageLook, "coverX" | "coverY"> | null | undefined): string | undefined {
  if (!look || (look.coverX === 50 && look.coverY === 50)) return undefined
  return `${look.coverX}% ${look.coverY}%`
}

/* ── The brand colour ─────────────────────────────────────────────────── */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * A colour a button can be filled with: the logo's colour, darkened in small
 * steps until white words on it read at 4.5:1 (WCAG AA). A near white or
 * near grey logo gives no brand colour (null): the button stays ink.
 */
export function buttonBrand(hex: string | null): string | null {
  if (!hex || !HEX.test(hex)) return null
  let [r, g, b] = rgb(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  /* Grey (no hue to speak of): not a brand colour, ink says it better. */
  if (max - min < 24) return null
  for (let i = 0; i < 40 && contrast(toHex([r, g, b]), "#ffffff") < 4.5; i++) {
    r *= 0.93
    g *= 0.93
    b *= 0.93
  }
  return toHex([r, g, b])
}

/**
 * The most telling colour of a logo's pixels (RGBA, as a canvas gives them):
 * the commonest saturated colour, in buckets of 32 per channel, averaged
 * inside its bucket. Transparent, white, black and grey pixels are left out,
 * so a mark on white gives the mark's colour. Null when nothing is left.
 */
export function dominantColour(pixels: ArrayLike<number>): string | null {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (a < 128) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max - min < 32 || max < 40 || min > 235) continue
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5)
    const s = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    s.n++
    s.r += r
    s.g += g
    s.b += b
    buckets.set(key, s)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const s of buckets.values()) if (!best || s.n > best.n) best = s
  return best ? toHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null
}

/** What the About page's button is drawn with: its words, its fill and its line, from the look and the words the page would use. */
export interface JoinLookView {
  label: string
  style: JoinStyle
  /** The fill for the brand style; null for ink and outline. */
  brand: string | null
  note: string
}

export function joinLookOf(look: PageLook): JoinLookView {
  const brand = look.joinStyle === "brand" ? buttonBrand(look.brand) : null
  return { label: look.joinLabel, style: look.joinStyle === "brand" && !brand ? "ink" : look.joinStyle, brand, note: look.joinNote }
}
