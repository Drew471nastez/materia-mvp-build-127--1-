/**
 * ===========================================================================
 *  THE BUYER PAGES BOUNCE AGAIN, AND THE BOUNCE SHOWS THEIR OWN GROUND
 * ===========================================================================
 * "When I scroll the page with a touch to reach the bottom or the top it is
 * not flexible, it does not have that Safari style elastic thing."
 *
 * The bounce was refused across the whole native shell
 * (app/globals.css: `overscroll-behavior: none` on html.capacitor and on its
 * body) for two reasons, both written down there:
 *
 *   1. a bounce "reveals the body background (white) behind dark
 *      headers/footers"
 *   2. it is also how the browser's pull to refresh is kept off
 *
 * Neither reason needs the bounce gone.
 *
 * (2) is `contain` rather than `none`: a root element that contains its
 * overscroll keeps pull to refresh off and keeps scroll chaining inside it,
 * and leaves WebKit's rubber band alone. The CSS is in app/globals.css under
 * `html.elastic-scroll`.
 *
 * (1) was true because the canvas, the surface a rubber band exposes, was
 * ONE colour for both ends of the page: the band's, the header's own. Above
 * a dark header that is right; below a light footer it is a dark strip, and
 * below a dark footer the old white body was the white flash. So the canvas
 * is two colours now: the band's above the top of the page, and the page's
 * OWN GROUND below its bottom.
 *
 * The band is already one number the whole app agrees on (--native-band,
 * lib/native-chrome.ts). The ground is not, and cannot be: a person's page
 * carries whatever scheme its owner chose (components/storefront/
 * storefront-template.tsx), so it is MEASURED off the page rather than
 * written down twice. This file is the measuring, kept pure so a test can
 * drive it; components/ui/elastic-overscroll.tsx is the part that touches
 * the DOM.
 */

/** The class that turns the bounce back on, on <html>. */
export const ELASTIC_CLASS = "elastic-scroll"

/** Where the measured ground is written, on <html>. */
export const GROUND_VAR = "--bounce-ground"

/**
 * THE PAGES THAT BOUNCE. The buyer's own screens, each named by a marker it
 * already carries: the profile centre and everything under it (the library,
 * account settings), a person's or a creator's page, a community's public
 * frame, Explore and its categories.
 *
 * Not /app and not its scrollers, not the auth pages, not the website
 * builder, not landscape. Those keep `overscroll-behavior: none` exactly as
 * they had it.
 */
export const ELASTIC_SURFACES = [
  '[data-page="account"]',
  '[data-page="library"]',
  "[data-member-profile]",
  "[data-community-public]",
  ".explore-ground",
] as const

/** The surfaces as one selector, for a single querySelector. */
export const ELASTIC_SELECTOR = ELASTIC_SURFACES.join(", ")

/**
 * A colour that paints nothing, so the walk has to keep going. Both
 * spellings an engine answers with: the keyword, and an rgba() whose alpha
 * is zero.
 */
export function isTransparent(color: string | null | undefined): boolean {
  const v = (color || "").trim().toLowerCase()
  if (!v || v === "transparent" || v === "none") return true
  const m = /^rgba?\(([^)]*)\)$/.exec(v)
  if (!m) return false
  const parts = m[1].split(/[,/]|\s+/).filter(Boolean)
  return parts.length >= 4 && Number(parts[3]) === 0
}

/**
 * What the measuring needs to know about an element. An interface rather
 * than `getComputedStyle` directly, so the walks below can be driven over a
 * made up tree in a test.
 */
export interface GroundProbe {
  /** Its resolved background colour, as the engine reports it. */
  background(el: Element): string
  /** `static`, `relative`, `absolute`, `fixed`, `sticky`. */
  position(el: Element): string
  /** Its height in CSS pixels. */
  height(el: Element): number
}

/** Deeper than any page shell goes; a guard against a cycle, not a limit anybody meets. */
const MAX_DEPTH = 32

/**
 * THE ELEMENT AT THE FOOT OF THE PAGE, which is the one whose colour a
 * bounce at the bottom reveals. The last child, then its last child, and so
 * on, skipping what is not actually at the foot:
 *
 *   a fixed or absolute child    the phone's tab bar is the last child of
 *                                the profile's shell and is fixed to the
 *                                window, so it is not the page's foot
 *   a child with no height       the tab bar's spacer, a zero height marker
 *
 * So a page that ends in a dark footer measures the footer, and a page that
 * ends in its own surface measures the surface.
 */
export function bottomSurface(root: Element, probe: GroundProbe): Element {
  let el: Element = root
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    let next: Element | null = null
    let child: Element | null = el.lastElementChild
    while (child) {
      const pos = probe.position(child)
      if (pos !== "fixed" && pos !== "absolute" && probe.height(child) > 0) {
        next = child
        break
      }
      child = child.previousElementSibling
    }
    if (!next) break
    el = next
  }
  return el
}

/**
 * The first real colour at or above `from`. A footer with no background of
 * its own hands the question to the surface it sits on, which is the answer
 * anyway. `null` when nothing up the chain paints: the caller then leaves
 * the custom property alone and the stylesheet's own default stands.
 */
export function groundColor(from: Element, probe: GroundProbe, stopAfter: Element | null = null): string | null {
  let el: Element | null = from
  for (let depth = 0; el && depth < MAX_DEPTH; depth++) {
    const bg = probe.background(el)
    if (!isTransparent(bg)) return bg
    if (stopAfter && el === stopAfter) return null
    el = el.parentElement
  }
  return null
}
