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
 * NOTHING STICKY IN A CARD (round 44). A card is a still picture of its
 * section, and a sticky header or column has nothing there to stick to:
 * relative, with its offsets taken off, lays it out exactly where sticky puts it at rest, without a
 * layer of its own for the library to sort on every frame of a scroll.
 * For a preview's own styles and its inline ones; the app's `.sticky` is
 * the library's stylesheet's (section-library.tsx, REVEAL_SHOWN).
 */
export function withoutSticky(text: string): string {
  /* Its offsets go with it: on a relative box `top: 24px` would move it down, where sticky at rest does not. */
  return text.replace(/position\s*:\s*(?:-webkit-)?sticky/gi, "position:relative;inset:auto!important")
}

/*
  ===========================================================================
   A WINDOW THE SIZE OF THE CARD'S PAGE (round 45)
  ===========================================================================
  A preview is drawn in the editor's own document, so a section's `100vw`
  was the editor's window, not the 800px page it is drawn as: a full bleed
  hero (`width: 100vw; margin-left: calc(50% - 50vw)`) came out 1280 wide
  and 240px to the left of its card, cut and out of line, and `100vh` was
  as tall as whatever window the editor had. In a card the window is the
  page the section is drawn on: as wide as it is drawn, and a window tall.
  Every viewport length in a preview's own styles and its inline ones is
  written as pixels of that window; Storelib's sections read `--sl-vh`,
  which the card sets (section-library.tsx).
*/
const VIEWPORT_LENGTH = /(^|[\s:,(+*/])(-?(?:\d+\.?\d*|\.\d+))([sld]?)(vw|vh|vi|vb|vmin|vmax)\b/g
export function freezeViewport(css: string, width: number, height: number): string {
  if (!css || !/\d(?:[sld]?)(?:vw|vh|vi|vb|vmin|vmax)\b/.test(css)) return css
  const vw = width / 100
  const vh = height / 100
  return css.replace(VIEWPORT_LENGTH, (_, pre: string, n: string, _size: string, unit: string) => {
    const per = unit === "vw" || unit === "vi" ? vw : unit === "vh" || unit === "vb" ? vh : unit === "vmin" ? Math.min(vw, vh) : Math.max(vw, vh)
    return `${pre}${Math.round(Number(n) * per * 100) / 100}px`
  })
}
/** The same, for the style="" of every element in drawn markup (and nothing else: a "100vw" in words or a `sizes` is left alone). */
export function freezeViewportInStyles(html: string, width: number, height: number): string {
  if (!/v(?:w|h|i|b|min|max)\b/.test(html)) return html
  return html.replace(/(\sstyle=")([^"]*)(")/gi, (_, a: string, body: string, b: string) => `${a}${freezeViewport(body, width, height)}${b}`)
}

/*
  ===========================================================================
   A REMEMBERED HEIGHT IS CHECKED BEFORE A CARD IS SIZED BY IT (round 45)
  ===========================================================================
  Heights are remembered in the browser so a card is its own height from
  its first frame on the next visit. What comes back from storage is
  anybody's: an older format, a key of something else, a height of 0 or of
  a million. Only a key of the shape a preview's is, with a height a
  section can be, is taken; the rest is dropped. And a card sized by a
  remembered height never moves the cards around it when its section turns
  out another height while somebody is looking (section-library.tsx,
  useSteadyHeight; compat-section-preview.tsx): it keeps its height, the
  section cut at its foot or on white, until nobody can see it change.
*/
export const REMEMBERED_HEIGHT_MIN = 8
export const REMEMBERED_HEIGHT_MAX = 20_000
const REMEMBERED_MOST = 600
export const rememberedHeightOk = (h: unknown): h is number => typeof h === "number" && Number.isFinite(h) && h >= REMEMBERED_HEIGHT_MIN && h <= REMEMBERED_HEIGHT_MAX
export function rememberedHeightsFrom(parsed: unknown, keyShape: RegExp, widthOk?: (key: string) => boolean): Record<string, number> {
  const out: Record<string, number> = {}
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out
  let n = 0
  for (const [key, h] of Object.entries(parsed as Record<string, unknown>)) {
    if (n >= REMEMBERED_MOST) break
    if (key.length > 200 || !keyShape.test(key) || !rememberedHeightOk(h) || (widthOk && !widthOk(key))) continue
    out[key] = Math.ceil(h)
    n++
  }
  return out
}

/** A short tag of some text: a change anywhere in what is tagged is a new tag. */
export function textTag(parts: readonly string[]): string {
  let h = 0
  for (const s of parts) {
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
    h = (Math.imul(h, 31) + 124) | 0
  }
  return (h >>> 0).toString(36)
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

/*
  ===========================================================================
   A SECTION WHOSE PRESET HAS NO BLOCKS, SHOWN WITH SOME
  ===========================================================================
  Round BC, the owner: cards for "Content Tabs", "Community Feedback Slider"
  and "Contact Form Simple" were grey boxes with the section's name. Those
  sections are all blocks (the heading, the cards, the fields) and their
  preset adds none, so drawn as the preset gives them they are an empty
  shell with padding. A card that draws nothing is drawn again with a few of
  its own blocks, each filled in with its defaults, the way Add block would
  fill them: what the section looks like once it has content.
*/

type SampleField = { id?: string; default?: unknown }
type SampleBlockType = {
  type?: string
  fields?: SampleField[]
  settings?: SampleField[]
  limit?: number
  private?: boolean
  presets?: { settings?: Record<string, unknown> }[]
}

/** How many of a section's only block type a sample holds: a row, a slider or a list reads as one with three. */
const SAMPLE_REPEAT = 3
/** And how many blocks in all, whatever the section takes. */
const SAMPLE_MAX = 8

/**
 * A few blocks for a section's preview: one of each type it declares, or
 * three of its only type, within its `max_blocks` and each type's `limit`.
 * App blocks ("@app") and theme block wildcards ("@theme") are left out:
 * neither names a block that can be drawn here.
 */
export function sampleBlocks(blockTypes: readonly SampleBlockType[] | undefined, maxBlocks: number | undefined, idPrefix: string): { id: string; type: string; settings: Record<string, unknown> }[] {
  const kinds = (blockTypes ?? []).filter((b) => typeof b?.type === "string" && b.type && !b.type.startsWith("@") && !b.private)
  if (!kinds.length) return []
  const cap = Math.max(0, Math.min(SAMPLE_MAX, typeof maxBlocks === "number" && maxBlocks > 0 ? maxBlocks : SAMPLE_MAX))
  const out: { id: string; type: string; settings: Record<string, unknown> }[] = []
  const settingsOf = (b: SampleBlockType) => {
    const s: Record<string, unknown> = {}
    for (const f of b.fields ?? b.settings ?? []) if (f && typeof f.id === "string" && f.default !== undefined) s[f.id] = f.default
    return { ...s, ...(b.presets?.[0]?.settings ?? {}) }
  }
  const each = kinds.length === 1 ? SAMPLE_REPEAT : 1
  for (const b of kinds) {
    const n = Math.min(each, typeof b.limit === "number" && b.limit > 0 ? b.limit : each)
    for (let i = 0; i < n && out.length < cap; i++) out.push({ id: `${idPrefix}-sample-${out.length}`, type: b.type as string, settings: settingsOf(b) })
  }
  return out
}

/**
 * Whether drawn markup has nothing anybody could see: no picture, no field,
 * no words. Read from the string alone (its styles, scripts, templates and
 * comments left out), so it costs no layout; a card's own measurement
 * decides the rest.
 */
export function markupLooksEmpty(html: string): boolean {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
  if (/<(img|svg|video|picture|canvas|iframe|input|textarea|select|button)\b/i.test(body)) return false
  const text = body.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, "")
  return text.length === 0
}
