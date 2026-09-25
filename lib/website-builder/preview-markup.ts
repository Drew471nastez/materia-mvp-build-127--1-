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
 * A PREVIEW'S STYLE GOES IN ONE SHEET, ONCE, BEFORE ANYBODY LOOKS.
 *
 * A section written as a .storelib file carries its own <style>, scoped to
 * its instance, inside its markup. Thirty-eight of those arriving in the
 * library meant thirty-eight new stylesheets in the document in the frame it
 * opened, and a new stylesheet makes the browser look again at every element
 * on the page, the whole editor included: measured, a 424ms task on a
 * computer at a quarter speed.
 *
 * So the styles are taken out of the markup when a preview is drawn, to be
 * put into one sheet of the library's own in idle time. The markup left is
 * only markup. Each rule is still scoped to its own preview's instance, so
 * nothing reaches the page.
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
