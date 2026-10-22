/**
 * ===========================================================================
 *  A VALUE BEING EDITED IS DRAWN AT ONCE, NEVER EASED TOWARDS
 * ===========================================================================
 * The owner, round 1022: "Theme settings › the button corner radius, the
 * slider feels heavy and is not smooth". The slider was not slow: the page's
 * buttons ease every change over 180ms (Theme settings › Buttons › Hover
 * animation writes `transition: all` on every button, lib/website-builder/
 * theme-css.ts), and sections ease their own colours over 150ms. Each value
 * a finger sent started the ease again from wherever the last one had got
 * to, so the canvas trailed the thumb by the length of the ease and arrived
 * once the finger stopped. Measured (scripts/check-editor-live.mjs, theme
 * radius): 1 value in 44 drawn as itself, the canvas 1.1s behind at p50.
 *
 * So what is being edited holds still: a section whose values are live (a
 * finger on a slider or a colour, a word just typed) or which a theme value
 * under a finger is written onto, carries one of these attributes, and
 * app/globals.css turns transitions off inside it. Only those sections, never
 * the canvas's root: an attribute on the root restyles the whole page, which
 * on a long page is the frame the change was meant to save. Each is taken
 * off once what is drawn is the committed value, so taking it off starts no
 * ease either (the values do not move).
 *
 * Two names, one per writer, so the theme letting go of a section never
 * lets go of a section setting still under a finger, and the other way.
 */

/** Set by a section whose own settings are live or echoed (SectionRenderer). */
export const STILL_SECTION_ATTR = "data-wb-still"
/** Set by the theme patcher on a section a live theme value is written onto (editor page.tsx canvasThemePatcher). */
export const STILL_THEME_ATTR = "data-wb-still-theme"

export function holdStill(el: Element | null | undefined, attr: string, on: boolean): void {
  if (!el) return
  if (on) {
    if (!el.hasAttribute(attr)) el.setAttribute(attr, "")
  } else if (el.hasAttribute(attr)) el.removeAttribute(attr)
}
