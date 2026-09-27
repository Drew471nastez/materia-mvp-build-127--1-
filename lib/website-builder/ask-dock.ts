/**
 * ===========================================================================
 *  WHERE ASK STORELIB'S PILL AND CONVERSATION SIT ON A COMPUTER
 * ===========================================================================
 * The dock (components/website-builder/theme-chat.tsx, variant "dock") is a
 * pill at the bottom centre of the canvas that opens into the conversation
 * above it. Everything is placed in pixels from the canvas's own measured
 * box, which a ResizeObserver reads once and hands here, so the layout and
 * the maximize animation read the same numbers and cannot disagree.
 *
 * Pure, so tests/ask-storelib.test.ts can hold it to its numbers.
 */

/** The pill's bottom edge above the canvas's bottom edge. */
export const DOCK_GAP = 20
/** How far the open conversation reaches past the pill on its sides and below it. */
export const DOCK_PAD = 10
/** The pill's width, and so the conversation's, when there is room. */
export const PILL_WIDTH = 660
/** The open conversation's height, when there is room. */
export const CARD_HEIGHT = 620
/** Kept clear above the open conversation. */
export const CARD_TOP_ROOM = 28
/** Maximized: this wide at most, and this much of the window tall. */
export const MAX_WIDTH = 960
export const MAX_HEIGHT_SHARE = 0.85
/**
 * How it moves. Opening is the iOS sheet curve: fast out of the gate, then a
 * long soft landing. Closing is a little quicker on an ease in, so it gets
 * out of the way without a tail. Transform and opacity only, both run by the
 * compositor, so nothing on the canvas is laid out again while it moves.
 */
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)"
export const OPEN_MS = 260
export const CLOSE_MS = 200
export const SLIDE_MS = 320

/*
  ═══════════════════════════════════════════════════════════════════════════
   THE PAGE SOFTENING AROUND THE FOLDED PILL
  ═══════════════════════════════════════════════════════════════════════════
  "Around the pill shape there, there needs to be some smooth clean blur
  applied around it, very smooth." The pill was a sticker: 95% white stops
  dead at its hairline and the page behind it — in the screenshot a bright
  blue site being edited — is untouched right up to that line.

  WHY FIVE RINGS AND NOT ONE MASKED BAND. There was one masked band here
  before (FADE_REACH/FADE_BLUR, one element, `linear-gradient` ramps
  intersected). It looked right in Chrome and wrong everywhere else: WebKit
  draws a backdrop filter but does not carry the element's mask into it, so
  the feathered band came out as a hard blurred pill — "it's very cut
  around" — and the whole thing was pulled out.

  So the fade is built twice over, and the two ways do not depend on each
  other:

    THE STAIRCASE   five rings, each a little wider than the last and each
                    blurring a little less. Backdrop filters stack: a ring's
                    backdrop is what the ring outside it already drew, so
                    the blur adds up in quadrature towards the pill (0.7,
                    1.0, 1.3, 1.9, 2.8px at the five edges) and is gone by
                    the outer edge.

                    IT WAS 4.3px AT THE PILL, AND THAT WAS TOO STRONG. "Has
                    too much blur, reduce its strength a little bit": over
                    a dark product photo the old ramp pulled the light parts
                    of the picture into white streaks round the pill. Every
                    ring now blurs about a third less, so the page still
                    softens into the pill but keeps its shapes. No mask is involved, so this much
                    survives in any engine, and a step between two rings is
                    a step between two blur radii, not between blurred and
                    sharp.

                    FIVE, because of what one step costs. A blur of radius σ
                    leaves exp(−2π²σ²f²) of a detail f across; the finest
                    thing a screen can hold is a stripe every other pixel,
                    and keeping each ring's edge from taking more than about
                    a third of that at once means σ can only grow by so much
                    per ring. Five keeps every step well inside that, and
                    the outermost two start at 0.7px so the ramp begins
                    below what a single step can show. scripts/check-ask-ai.mjs measures it
                    with the masks taken off, which is what WebKit does.
    THE FEATHER     on top of that, each ring carries a mask that ramps its
                    own outer `fade` px away to nothing. Where masks reach
                    backdrop filters the staircase dissolves into one smooth
                    ramp; where they do not, the staircase is what is left,
                    which is the point.

  NO LIGHT, NO INK, NO RING. Not one of them has a background: all they do
  is blur and very slightly desaturate the page's own pixels (the five
  multiplied out come to about 0.94 at the pill). saturate() keeps
  luminance, so this cannot lighten a white page or darken a dark one —
  scripts/check-ask-dock.mjs measures exactly that, over a photograph, over
  stripes, over flat dark and over the blue — but it does take the edge off
  a saturated page, which is the one thing a blur alone cannot do over flat
  colour.

  COST. Outermost first (it is painted first and every inner ring reads it),
  reach in px from the pill's box on every side. 24px keeps the softening
  to about twice the pill's own area and no more, and inside the 20px
  DOCK_GAP but for a few pixels the canvas clips anyway; each ring is its
  own compositor layer because a backdrop filter always is; none of them
  animates, and nothing but their opacity ever changes.
*/
export interface SoftenRing {
  /** How far past the pill's box this ring reaches, on every side. */
  reach: number
  /** Its own blur radius; they add up in quadrature towards the pill. */
  blur: number
  /** A touch of the saturation out of the page. Luminance is untouched. */
  saturate: number
  /** The width of the ramp that takes its own outer edge to nothing. */
  fade: number
}
export const SOFTEN_RINGS: SoftenRing[] = [
  { reach: 24, blur: 0.7, saturate: 0.995, fade: 11 },
  { reach: 19, blur: 0.7, saturate: 0.992, fade: 10 },
  { reach: 14, blur: 0.9, saturate: 0.988, fade: 9 },
  { reach: 9, blur: 1.3, saturate: 0.984, fade: 8 },
  { reach: 5, blur: 2.1, saturate: 0.98, fade: 7 },
]
/** The folded pill's corner radius (`rounded-[27px]`), which the rings grow out of. */
export const PILL_RADIUS = 27
/**
 * A ring's mask: a ramp in from each side, the two intersected, so the
 * plateau is a rounded band with no line anywhere in it.
 *
 * The ramp is eased, not straight. A straight ramp reaches nothing with the
 * slope it had all the way along, and that corner is visible as the place
 * where the softening stops — over fine detail it reads as the edge of a
 * band. These are the stops of 3t² − 2t³, which leaves and arrives flat, so
 * the blur has no end you can point at.
 */
const RAMP = [0, 0.043, 0.156, 0.32, 0.5, 0.68, 0.844, 0.957, 1]
const rampIn = (fade: number) =>
  RAMP.map((a, i) => `rgba(0, 0, 0, ${a}) ${+((i / (RAMP.length - 1)) * fade).toFixed(2)}px`).join(", ")
const rampOut = (fade: number) =>
  RAMP.map((a, i) => `rgba(0, 0, 0, ${a}) calc(100% - ${+((i / (RAMP.length - 1)) * fade).toFixed(2)}px)`)
    .reverse()
    .join(", ")
export const softenMask = (fade: number) =>
  (["to right", "to bottom"] as const).map((way) => `linear-gradient(${way}, ${rampIn(fade)}, ${rampOut(fade)})`).join(", ")

export interface DockGeometry {
  pillW: number
  /** The pill's bottom edge above the canvas's bottom. */
  pillBottom: number
  cardW: number
  cardH: number
  /** The open conversation's bottom edge above the canvas's bottom. */
  cardBottom: number
}

/**
 * Where the pill and the open conversation sit, for a canvas `w` by `h`.
 *
 * Open, the conversation is the pill's width plus DOCK_PAD each side and
 * grows up from just under it. Maximized, it is as wide as MAX_WIDTH allows
 * and MAX_HEIGHT_SHARE of the window tall, centred in the canvas, with the
 * pill moved up to stay its input row. Both are always inside the canvas.
 */
export function dockGeometry(w: number, h: number, maximized: boolean, viewportHeight: number): DockGeometry {
  const pillW = Math.max(280, Math.min(PILL_WIDTH, w - 48))
  if (!maximized) {
    const cardW = pillW + DOCK_PAD * 2
    const cardH = Math.max(240, Math.min(CARD_HEIGHT, h - (DOCK_GAP - DOCK_PAD) - CARD_TOP_ROOM))
    return { pillW, pillBottom: DOCK_GAP, cardW, cardH, cardBottom: DOCK_GAP - DOCK_PAD }
  }
  const cardW = Math.max(pillW + DOCK_PAD * 2, Math.min(MAX_WIDTH, w - 48))
  const cardH = Math.max(240, Math.min(h - 48, Math.round(viewportHeight * MAX_HEIGHT_SHARE)))
  const cardBottom = Math.max(DOCK_GAP - DOCK_PAD, Math.round((h - cardH) / 2))
  return { pillW, pillBottom: cardBottom + DOCK_PAD, cardW, cardH, cardBottom }
}
