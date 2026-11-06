/**
 * ===========================================================================
 *  HOW A PAGE LAYS ITS BLOCKS OUT, AND THE REST OF WHAT A THEME NOW SETS
 * ===========================================================================
 * Round 40, the owner: "We can create multiple layouts of how the blocks
 * display", and themes that "control more things". Everything here is read
 * from the theme the page already saves (onepages.theme, a JSON column), so
 * nothing new is stored anywhere else and no SQL was needed:
 *
 *   block_layout   "list" (what every page was), "grid" (plain links two to
 *                  a row, as tiles), "cards" (a link with a picture drawn as
 *                  a card with the picture large), "compact" (tight rows).
 *                  Missing is "list", so a saved page keeps its look.
 *   spacing        the gap between blocks, as before; Design now offers it.
 *   header_align   "center" (missing) or "left": the name, bio and social
 *                  icons of a classic header.
 *
 * The editor's preview is the live page's own component, so both read these
 * from the same functions and cannot disagree.
 */

import { buttonSize } from "./button-style"

export type BlockLayout = "list" | "grid" | "cards" | "compact" | "masonry"
export const BLOCK_LAYOUTS: readonly BlockLayout[] = ["list", "grid", "cards", "compact", "masonry"]

export type BlockSpacing = "compact" | "normal" | "comfortable"
export type HeaderAlign = "center" | "left"

type LayoutThemeLike = { block_layout?: unknown; spacing?: unknown; header_align?: unknown } | null | undefined

export function blockLayoutOf(theme: LayoutThemeLike): BlockLayout {
  const v = theme?.block_layout
  return v === "grid" || v === "cards" || v === "compact" || v === "masonry" ? v : "list"
}

export function blockSpacingOf(theme: LayoutThemeLike): BlockSpacing {
  const v = theme?.spacing
  return v === "compact" || v === "comfortable" ? v : "normal"
}

export function headerAlignOf(theme: LayoutThemeLike): HeaderAlign {
  return theme?.header_align === "left" ? "left" : "center"
}

/**
 * The gap between blocks. The three spacing strings are exactly the ones the
 * page always used; the Compact layout is tighter than any of them.
 */
export function blockGapClass(theme: LayoutThemeLike): string {
  if (blockLayoutOf(theme) === "compact") return "gap-2 sm:gap-2.5"
  const s = blockSpacingOf(theme)
  return s === "compact" ? "gap-3 sm:gap-4" : s === "comfortable" ? "gap-5 sm:gap-6" : "gap-4 sm:gap-5"
}

/**
 * What picking a layout in Design writes. Compact also makes the buttons Small and leaving it puts them back to
 * Medium, so the Buttons panel always says what the page shows; a size picked by hand (Large) is left alone.
 */
export function layoutUpdates(theme: { block_layout?: unknown; button_size?: unknown }, next: BlockLayout): Record<string, unknown> | null {
  const now = blockLayoutOf(theme)
  if (next === now) return null
  const updates: Record<string, unknown> = { block_layout: next }
  const size = buttonSize(theme as never)
  if (next === "compact" && size === "regular") updates.button_size = "compact"
  if (now === "compact" && next !== "compact" && size === "compact") updates.button_size = "regular"
  return updates
}

type LinkDataLike ={ url?: unknown; thumbnail_url?: unknown; layout_type?: unknown } | null | undefined

/** On the Cards layout a link with a picture is drawn as a featured card, its picture large. */
export function linkDrawnAsCard(theme: LayoutThemeLike, data: LinkDataLike): boolean {
  return blockLayoutOf(theme) === "cards" && typeof data?.thumbnail_url === "string" && data.thumbnail_url.length > 0
}

type BlockLike = { id: string; type: string; data?: unknown; style?: {presentation?: {size?: string}} }

/** A link that can sit in the Grid layout's two columns: a plain link, not a featured card. */
export function isGridLink(block: BlockLike): boolean {
  if (block.type !== "link_button" || (block.style?.presentation?.size && block.style.presentation.size !== "auto")) return false
  const d = (block.data || {}) as { url?: unknown; layout_type?: unknown }
  return typeof d.url === "string" && d.url.length > 0 && d.layout_type !== "pro"
}

export interface LinkTilePair<T> {
  links: T[]
  key: string
}

/**
 * On the Grid layout, plain links that follow one another two to a row. A
 * link left over on its own, and every other block, stays a full row, as it
 * was. Anything that is not a block (the product tiles already paired) is
 * passed through untouched, in order.
 */
export function pairLinkTiles<T>(items: readonly T[], layout: BlockLayout): (T | LinkTilePair<T>)[] {
  if (layout !== "grid") return [...items]
  const out: (T | LinkTilePair<T>)[] = []
  let run: T[] = []
  const flush = () => {
    let i = 0
    for (; i + 1 < run.length; i += 2) {
      const a = run[i] as unknown as BlockLike
      out.push({ links: [run[i], run[i + 1]], key: `links:${a.id}` })
    }
    if (i < run.length) out.push(run[i])
    run = []
  }
  for (const item of items) {
    const b = item as unknown as BlockLike
    if (b && typeof b === "object" && "type" in b && isGridLink(b)) run.push(item)
    else {
      flush()
      out.push(item)
    }
  }
  flush()
  return out
}

export function isLinkTilePair<T>(item: T | LinkTilePair<T>): item is LinkTilePair<T> {
  return !!item && typeof item === "object" && "links" in (item as object) && Array.isArray((item as LinkTilePair<T>).links)
}

/* ─── The gradient's direction ────────────────────────────────────────── */

/**
 * The eight directions a gradient is usually wanted in, as the CSS angle the
 * page has always saved (`linear-gradient(<n>deg, a 0%, b 100%)`): 180 runs
 * from the top down, 90 from left to right. Their names are the Design tab's
 * (components/onepage/themes/gradient-direction.tsx), so they are translated.
 */
export const GRADIENT_DIRECTIONS: readonly number[] = [180, 0, 90, 270, 135, 225, 45, 315]

/** An angle kept to 0 to 359, whole degrees. */
export function normalAngle(deg: number): number {
  const n = Math.round(Number.isFinite(deg) ? deg : 180) % 360
  return n < 0 ? n + 360 : n
}

/** The gradient's stored value, in the shape it has always been saved in. */
export function linearGradientValue(direction: number, color1: string, color2: string): string {
  return `linear-gradient(${normalAngle(direction)}deg, ${color1} 0%, ${color2} 100%)`
}

/* ─── Font pairs ──────────────────────────────────────────────────────── */

/**
 * A title face and a page face that are made to sit together. The values are
 * the exact strings the Design tab's font lists hold, so the pickers show the
 * pair as chosen afterwards.
 */
export const FONT_PAIRS: readonly { id: string; title: string; body: string }[] = [
  { id: "fraunces-inter", title: "'Fraunces', serif", body: "'Inter', sans-serif" },
  { id: "playfair-lato", title: "'Playfair Display', serif", body: "'Lato', sans-serif" },
  { id: "newsreader-source", title: "'Newsreader', serif", body: "'Source Serif Pro', serif" },
  { id: "grotesk-inter", title: "'Space Grotesk', sans-serif", body: "'Inter', sans-serif" },
  { id: "archivo-dm", title: "'Archivo Black', sans-serif", body: "'DM Sans', sans-serif" },
  { id: "geist-geist", title: "'Geist', sans-serif", body: "'Geist', sans-serif" },
  { id: "mono-geist", title: "'Geist Mono', monospace", body: "'Geist', sans-serif" },
  { id: "fredoka-nunito", title: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
]

const family = (v: unknown) => (typeof v === "string" ? v.split(",")[0].trim().replace(/^['"]|['"]$/g, "") : "")

/** The pair a theme is set in now, if it is one of them. */
export function fontPairOf(theme: { font_family?: unknown; title_font?: unknown } | null | undefined): string | null {
  const body = family(theme?.font_family)
  const title = family(theme?.title_font) || body
  return FONT_PAIRS.find((p) => family(p.body) === body && family(p.title) === title)?.id ?? null
}

/* ─── How a theme shows products, and a cover picture (round 42) ─────── */

/**
 * The owner: "Themes should differ in layout style too, not just colours:
 * some with an image hero, some that display product blocks differently
 * (product cards/grid vs list rows)". Two more things a theme can set, read
 * from the same saved theme, so nothing new is stored and no SQL is needed:
 *
 *   product_layout   "grid": a product block drawn as a tile, two to a row
 *                    (the Tile layout, paired by pairProductTiles); "rows":
 *                    a product block drawn as a list row (the Row layout).
 *                    Missing (every page before) is each block's own.
 *   cover_image_url  a wide picture across the top of the page, the round
 *                    photo set over its lower edge (the classic header).
 *                    Missing is no cover, as before.
 *
 * WHAT A PERSON CHOSE STAYS. A product block starts as the Callout, so a
 * theme's product_layout redraws a Callout (or a block with no layout at
 * all) and nothing else; a layout picked in the block's own Layout list is
 * marked `style_chosen` and always wins, Callout included.
 */
export type ThemeProductLayout = "own" | "grid" | "rows"

type ProductThemeLike = { product_layout?: unknown } | null | undefined

export function themeProductLayoutOf(theme: ProductThemeLike): ThemeProductLayout {
  const v = theme?.product_layout
  return v === "grid" || v === "rows" ? v : "own"
}

/** The block's style as the page draws it under this theme: the theme's, unless the block's own was picked. */
export function themedProductStyle(theme: ProductThemeLike, data: { style?: unknown; style_chosen?: unknown } | null | undefined): string | null {
  const own = typeof data?.style === "string" ? data.style : null
  const kind = themeProductLayoutOf(theme)
  if (kind === "own" || data?.style_chosen === true) return own
  if (own !== null && own !== "callout") return own
  return kind === "grid" ? "tile" : "row"
}

type CoverThemeLike = { cover_image_url?: unknown; header_layout?: unknown } | null | undefined

/** The cover picture's address, when the theme has one and the header is the classic one (a Hero is already a picture). */
export function coverImageOf(theme: CoverThemeLike): string | null {
  const v = theme?.cover_image_url
  if (typeof v !== "string" || !/^https:\/\/[^\s"'<>()]+$/.test(v.trim())) return null
  if (theme?.header_layout === "hero") return null
  return v.trim()
}
