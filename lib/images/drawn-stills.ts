/**
 * ===========================================================================
 *  A PICTURE ALREADY ON SCREEN, DRAWN AGAIN FROM THE CACHE
 * ===========================================================================
 * The owner (round 13 of the desktop post): an opened post showed a grey box
 * where its picture or its video's poster would be, then the picture. The
 * feed had that picture on screen a moment before, as a card's thumbnail or
 * tile, but at another size, so nothing of it could be reused.
 *
 * Each picture a feed card has shown is noted here by its original address,
 * with the exact attributes it was drawn with (src, srcset, sizes). Drawn
 * again with those same attributes the browser picks the same file, from its
 * memory cache, already decoded: it is there on the first frame of the
 * opened post, under the full size picture, until that one is whole.
 *
 * Kept per tab and small; the larger of two copies of one picture wins.
 */
import type React from "react"

export interface DrawnStill {
  src: string
  srcSet?: string
  sizes?: string
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
  /** The file's own width, to keep the sharper of two copies. */
  width: number
}

const STILLS = new Map<string, DrawnStill>()
const MAX_STILLS = 300

/** Note a picture a card has on screen, decoded, by its original address. */
export function noteDrawnStill(original: string | null | undefined, still: DrawnStill): void {
  if (!original || !still.src || still.width <= 0) return
  const had = STILLS.get(original)
  if (had && had.width > still.width) return
  STILLS.delete(original)
  STILLS.set(original, still)
  while (STILLS.size > MAX_STILLS) STILLS.delete(STILLS.keys().next().value as string)
}

/** The copy of this picture already on screen in this tab, or null. */
export function drawnStill(original: string | null | undefined): DrawnStill | null {
  return (original && STILLS.get(original)) || null
}
