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
