/**
 * ===========================================================================
 *  WHAT A SECTION PREVIEW'S MARKUP GOES THROUGH BEFORE A CARD SHOWS IT
 * ===========================================================================
 * The Add a section library (components/website-builder/editor/section-library.tsx)
 * draws each section once, off screen, and keeps its markup. These are the
 * string steps between the renderer and the card. Pure, so they are tested as
 * text (tests/builder-sidebar.test.ts).
 */

/** Every picture in a preview waits until it is near the screen, and decodes off the main thread. */
export function lazyImages(html: string): string {
  return html.replace(/<img\s/gi, '<img loading="lazy" decoding="async" ')
}

/**
 * A PREVIEW'S STYLE GOES IN A SHEET OF THE LIBRARY'S, ONCE, BEFORE ANYBODY LOOKS.
 *
 * A section written as a .storelib file carries its own <style>, scoped to
 * its instance, inside its markup. Thirty-eight of those arriving in the
 * library meant thirty-eight new stylesheets in the document in the frame it
 * opened, and a new stylesheet makes the browser look again at every element
 * on the page, the whole editor included: measured, a 424ms task on a
 * computer at a quarter speed.
 *
 * So the styles are taken out of the markup when a preview is drawn, to be
 * put into a small sheet of the library's own in idle time, one per idle
 * moment that has any (see flushStyles). The markup left is only markup.
 * Each rule is still scoped to its own preview's instance, so nothing
 * reaches the page.
 */
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
export function splitStyles(html: string): { html: string; css: string[] } {
  const css: string[] = []
  const rest = html.replace(STYLE_BLOCK, (_, body: string) => {
    if (body.trim()) css.push(body)
    return ""
  })
  return { html: rest, css }
}

/**
 * Where a drawn preview is kept. The width is part of it because a section
 * drawn at 390 is a different document from one drawn at 800, and the
 * sources are because a creator's own section changes when its file does.
 */
export const previewKey = (type: string, presetIndex: number, width: number, sourcesTag: string) =>
  `${type}:${presetIndex}:${width}:${sourcesTag}`

/**
 * The shortest a card is drawn, so a strip of a section still reads as a
 * section. The shortest in the theme are its two announcement bars, 37 to
 * 42px as drawn in a card: at 80 they sit in the middle of it with about
 * 20px of white above and below, where 96 left 27 to 29px, more than the
 * 24px of empty card a section is allowed (scripts/check-add-section.mjs).
 */
export const PREVIEW_MIN_HEIGHT = 80

/**
 * ===========================================================================
 *  A CARD IS AS TALL AS ITS SECTION
 * ===========================================================================
 * Every card used to be one height, the height a tall section is cropped to,
 * so a short section (a banner, a strip of logos) sat at the top of a tall
 * white frame with nothing under it. A card is now its section's own height
 * as drawn (at the width the preview is drawn at, scaled to the card's),
 * never shorter than PREVIEW_MIN_HEIGHT and never taller than the crop,
 * `ratio` of its width, which a tall section is still cut to.
 *
 * `drawn` is unknown (undefined, or 0 for a preview that failed to draw)
 * until the preview has been drawn and measured: until then the card keeps
 * the crop's height, which is the most any card can be, so knowing the
 * section's own height can only ever make a card shorter. Rounded up, so a
 * card never cuts the last pixel of a section it is meant to show whole.
 */
export function previewCardHeight(drawn: number | undefined, cardWidth: number, renderWidth: number, ratio: number): number {
  const tallest = Math.round(cardWidth * ratio)
  if (!drawn || drawn <= 0 || cardWidth <= 0 || renderWidth <= 0) return tallest
  const own = Math.ceil((drawn * cardWidth) / renderWidth)
  return Math.min(tallest, Math.max(PREVIEW_MIN_HEIGHT, own))
}

/**
 * A section shorter than the floor sits in the middle of its floor-high
 * card: an even strip of white above and below reads as a thin section,
 * where all of it underneath read as a card with nothing in it. A card that
 * is taller than the floor (its own height, or held at the crop until nobody
 * can see it change) keeps its section at the top, like a page.
 */
export function previewCentered(drawn: number | undefined, cardWidth: number, renderWidth: number, cardHeight: number): boolean {
  if (!drawn || drawn <= 0 || cardWidth <= 0 || renderWidth <= 0) return false
  return cardHeight <= PREVIEW_MIN_HEIGHT && (drawn * cardWidth) / renderWidth < cardHeight
}
