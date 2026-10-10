/**
 * ===========================================================================
 *  ONE TABLE FOR THE FEED'S PICTURE SLOTS: THE WIDTH, THE FILES, THE QUALITY
 * ===========================================================================
 * Round 15 (the shape is round 14's, wt-p14speed, with the numbers measured
 * again on the frame as it is now). A picture is slow for one of three
 * reasons: the file is wider than the box it is painted into, the quality is
 * higher than anyone can see, or it was asked for at the wrong moment. The
 * first two are decided by `sizes` and the quality number, and both were
 * written by hand at each call site, so they drifted: a phone's card said
 * `100vw` for a box 32px narrower, and a tile said `50vw` for a box that is
 * cropped to cover it, so a landscape photo in a square tile was drawn half
 * again wider than `sizes` said and came out soft on a 2x screen.
 *
 * So each slot's rule lives here, once, as data, and nothing here renders:
 * tests/communities-feed15.test.ts proves what a phone and a computer pick
 * for every slot without a browser.
 *
 * WHERE THE NUMBERS COME FROM: scripts/check-communities-feed15.mjs SLOTS,
 * which measures each box in the real frame at 360 to 1920px. A card's
 * picture area (the box a single picture fills, two tiles and their 3px
 * seam) is:
 *
 *   under 640     100vw less 32px (the page's gutter; the card's own padding
 *                 does not apply, the pictures run to the card's edges)
 *   640 to 1023   100vw less 89px
 *   1024 to 1279  100vw less 405px (the left column comes in)
 *   1280 to 1375  100vw less 749px (and the right one)
 *   1376 up       627px (the frame stops growing)
 *
 * A tile is half of that less half the seam.
 */

/** The widths the Next optimizer serves (deviceSizes and imageSizes, Next 16 defaults). Anything else is a 400. */
export const NEXT_IMAGE_WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const

/**
 * THE QUALITY FOR A PICTURE SOMEBODY POSTED IN A FEED, as opposed to a picture
 * a creator chose to represent themselves (optimized-url.ts PORTRAIT_QUALITY,
 * 88). Next encodes AVIF at `quality - 20` and WebP at the number itself
 * (node_modules/next/dist/server/image-optimizer.js), so 75 is AVIF 55.
 *
 * Checked by eye, not assumed: the same photograph at 88 and at 75, drawn at
 * 390px on a 3x screen as a phone draws it (scripts/check-communities-feed15
 * QUALITY, before and after screenshots), with round 14's side by side
 * crops of three photographs as a second look. It MUST be a member of
 * `images.qualities` in next.config.mjs or the optimizer answers 400.
 */
export const FEED_PICTURE_QUALITY = 75

/** The blurred placeholder: the smallest file, at the lowest listed quality; it is stretched and blurred before anyone sees it. */
export const BLUR_WIDTH = 16
export const BLUR_QUALITY = 75

export interface SlotRule {
  /** The `sizes` attribute: what the box measures at each width. */
  sizes: string
  /** The file widths offered in `srcset`. Members of NEXT_IMAGE_WIDTHS only. */
  widths: readonly number[]
  /** The CSS width used for the plain `src` (a browser with no srcset). */
  display: number
  /** The box's own shape (width over height) at a phone's width and at a computer's, for the crop (coverFactor). */
  shape: { phone: number; wide: number }
}

export type FeedSlotName = "cardSingle" | "cardHalf" | "cardSmall" | "cardThumb"

/* The card's picture area, as measured (above). */
const AREA = "(min-width: 1376px) 627px, (min-width: 1280px) calc(100vw - 749px), (min-width: 1024px) calc(100vw - 405px), (min-width: 640px) calc(100vw - 89px), calc(100vw - 32px)"
const HALF = "(min-width: 1376px) 312px, (min-width: 1280px) calc((100vw - 752px) / 2), (min-width: 1024px) calc((100vw - 408px) / 2), (min-width: 640px) calc((100vw - 92px) / 2), calc((100vw - 35px) / 2)"

export const FEED_SLOTS: Record<FeedSlotName, SlotRule> = {
  /* One picture across a card: only on a phone (from 640px the card shows a thumbnail instead), in its own shape between 1:1 and 2:1. */
  cardSingle: { sizes: "calc(100vw - 32px)", widths: [384, 640, 750, 828, 1080, 1200], display: 640, shape: { phone: 0, wide: 0 } },
  /* Two side by side, and the lead of three: half the area, a 2:1 box split in two on a phone (square tiles), 8:3 from 640 (4:3). */
  cardHalf: { sizes: HALF, widths: [256, 384, 640, 750, 828, 1080], display: 384, shape: { phone: 1, wide: 4 / 3 } },
  /* The two small tiles of three: half the width, half the height. */
  cardSmall: { sizes: HALF, widths: [256, 384, 640, 750, 828], display: 384, shape: { phone: 2, wide: 8 / 3 } },
  /* The 72px (96px from 640) square thumbnail beside a card's words on a computer. */
  cardThumb: { sizes: "(min-width: 640px) 96px, 72px", widths: [96, 128, 256, 384], display: 96, shape: { phone: 1, wide: 1 } },
}

/**
 * HOW MUCH WIDER THAN ITS BOX A CROPPED PICTURE IS DRAWN. A picture covering a box of another shape is scaled until it fills
 * the box's height too, so a 3:2 photograph in a square tile is drawn 1.5 times the tile's width, and the file must be that
 * wide for it to be sharp. 1 when the picture is narrower than the box (it is drawn at the box's width). Capped at 2: past
 * that the crop shows a sliver and a bigger file buys nothing anyone sees.
 */
export function coverFactor(pictureShape: number | null | undefined, boxShape: number): number {
  if (!pictureShape || !boxShape || !Number.isFinite(pictureShape)) return 1
  return Math.min(2, Math.max(1, Math.round((pictureShape / boxShape) * 100) / 100))
}

/** One length of a `sizes` entry, scaled: "312px" becomes "468px", a calc is wrapped in "calc((...) * f)". */
function scaleLength(length: string, factor: number): string {
  if (factor === 1) return length
  const px = /^(\d+(?:\.\d+)?)px$/.exec(length)
  return px ? `${Math.round(Number(px[1]) * factor)}px` : `calc(${length.replace(/^calc/, "")} * ${factor})`
}

/**
 * A `sizes` string with every length multiplied, by `phone` in the entry with no condition (a phone's) and by `wide` in the
 * entries from 640px, so the browser asks for the width the picture is really drawn at, in the box's shape at that width.
 */
export function scaleSizes(sizes: string, phone: number, wide: number = phone): string {
  if (phone === 1 && wide === 1) return sizes
  return sizes
    .split(",")
    .map((entry) => {
      const text = entry.trim()
      const query = /^(\([^)]*\))\s+(.+)$/.exec(text)
      return query ? `${query[1]} ${scaleLength(query[2], wide)}` : scaleLength(text, phone)
    })
    .join(", ")
}

/** The sizes, file widths and src width for one picture in a slot, given the picture's own shape (width over height). */
export function feedSlot(slot: FeedSlotName, pictureShape?: number | null): { sizes: string; widths: number[]; display: number } {
  const rule = FEED_SLOTS[slot]
  /* A single picture's box takes the picture's own shape between 1:1 and 2:1 (media.tsx CardMedia): only past 2:1 is it cropped. */
  const phone = coverFactor(pictureShape, slot === "cardSingle" ? 2 : rule.shape.phone)
  const wide = coverFactor(pictureShape, slot === "cardSingle" ? 2 : rule.shape.wide)
  return { sizes: scaleSizes(rule.sizes, phone, wide), widths: [...rule.widths], display: Math.round(rule.display * Math.max(phone, wide)) }
}

/* ── Reading a `sizes` string the way a browser does (for the tests) ─────── */

/** `100vw`, `calc(100vw - 64px)`, `calc((100vw - 64px) / 2)`, any of those `* f`, or `320px`, in CSS pixels at a viewport. */
export function lengthAt(expr: string, viewport: number): number | null {
  const text = expr.trim().toLowerCase()
  const px = /^(\d+(?:\.\d+)?)px$/.exec(text)
  if (px) return Number(px[1])
  const vw = /^(\d+(?:\.\d+)?)vw$/.exec(text)
  if (vw) return (Number(vw[1]) / 100) * viewport
  const inner = /^calc\((.+)\)$/.exec(text)
  if (!inner) return null
  let body = inner[1].trim()
  let times = 1
  const mul = /^(.+?)\s*\*\s*(\d+(?:\.\d+)?)$/.exec(body)
  if (mul) {
    body = mul[1].trim()
    times = Number(mul[2])
  }
  /* A scaled calc keeps its own parentheses: "((100vw - 35px) / 2) * 1.5" or "(100vw - 32px) * 1.5". */
  if (wrapped(body)) body = body.slice(1, -1).trim()
  const divided = /^\((.+)\)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(body)
  const core = divided ? divided[1] : body
  const parts = /^(\d+(?:\.\d+)?)vw\s*-\s*(\d+(?:\.\d+)?)px$/.exec(core.trim())
  let width: number
  if (parts) width = (Number(parts[1]) / 100) * viewport - Number(parts[2])
  else {
    const plain = /^(\d+(?:\.\d+)?)px$/.exec(core.trim())
    if (!plain) return null
    width = Number(plain[1])
  }
  return (divided ? width / Number(divided[2]) : width) * times
}

/** Whether a whole expression sits inside one pair of parentheses ("(a) / 2" does not; "((a) / 2)" does). */
function wrapped(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) return false
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++
    else if (text[i] === ")") depth--
    if (depth === 0 && i < text.length - 1) return false
  }
  return true
}

/** The box width a browser works out from `sizes` at a viewport: the first entry whose condition holds, else the last. */
export function slotWidthAt(sizes: string, viewport: number): number | null {
  for (const entry of sizes.split(",")) {
    const text = entry.trim()
    const query = /^\(min-width:\s*(\d+(?:\.\d+)?)px\)\s+(.+)$/.exec(text)
    if (!query) return lengthAt(text, viewport)
    if (viewport >= Number(query[1])) return lengthAt(query[2], viewport)
  }
  return null
}

/** The file a browser picks from `widths` for a box at a pixel ratio: the smallest that covers it, else the largest. */
export function fileWidthFor(sizes: string, widths: readonly number[], viewport: number, dpr = 2): number {
  const box = slotWidthAt(sizes, viewport) ?? 0
  const offered = [...widths].sort((a, b) => a - b)
  return offered.find((w) => w >= box * dpr) ?? offered[offered.length - 1]
}

/* ── When a picture is asked for ─────────────────────────────────────────── */

export interface LoadPolicy {
  loading: "eager" | "lazy"
  fetchPriority: "high" | "low" | "auto"
}

/**
 * The first screen is eager and high, so it is in flight with the page's first bytes; everything under it is lazy and low,
 * so it cannot take the connection from the picture somebody is looking at.
 */
export function loadPolicy(firstScreen: boolean): LoadPolicy {
  return firstScreen ? { loading: "eager", fetchPriority: "high" } : { loading: "lazy", fetchPriority: "low" }
}

/** A transparent pixel, for a <source> that must never fetch (a picture hidden at that width). */
export const NO_PICTURE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
