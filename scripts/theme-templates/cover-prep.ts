/**
 * ===========================================================================
 *  A HOME PAGE, MADE READY TO BE PHOTOGRAPHED WHOLE (round 30)
 * ===========================================================================
 * The covers (scripts/build-theme-template-covers.ts) photograph a page a
 * screen at a time and stitch the screens. Two things a visitor never sees
 * came out on them, and the owner caught both on the marketplace:
 *
 *   CARD BUTTONS. Headless Chromium answers (hover: none) and cannot be told
 *   otherwise, so every product card drew its wishlist heart and quick view
 *   eye, which a visitor with a mouse only sees under the pointer
 *   (Fairweather, capstees). The cover shows a card at rest, on a computer
 *   and on a phone: the buttons, their tooltips and the slider arrows are
 *   hidden (their room kept), as are the add button on the picture and the
 *   second picture that hover:none shows (templates round 23).
 *
 *   A BACKGROUND IN EVERY SCREEN. A layer fixed to the screen, or a
 *   background attached to it (background-attachment: fixed, the base's
 *   .gradient), is painted again in every screen that is photographed, so a
 *   wallpaper or a gradient came out repeated down the stitched page (XP
 *   shop). For the photograph it is drawn once: a background attached to
 *   the screen is attached to its box instead, and a layer fixed to the
 *   screen that covers half of it or more (a backdrop, not a bar) is in the
 *   first screen only. What sticks (position: sticky) is let go of already.
 *
 * scripts/check-theme-covers.ts measures both on every template, and
 * tests/theme-cover-hygiene.test.ts reads the covers themselves.
 */

/** The card controls a visitor sees only under the pointer. Scoped to product cards, so a product section's own wishlist button stays. */
export const COVER_CARD_CONTROLS = [
  ".product-item .pc-actions",
  ".product-item .pc-action",
  ".product-item .pc-tip",
  ".product-item .pc-arrow",
  ".product-item .product-item__button-wishlist",
  ".product-item button-quickview",
] as const

export const COVER_CSS = [
  /* At rest, as a mouse sees a card: no buttons, no tooltips, no slider arrows; their room is kept so nothing moves. */
  `${COVER_CARD_CONTROLS.join(", ")} { visibility: hidden !important; opacity: 0 !important; transition: none !important; }`,
  /* The add button on the picture and the second picture, which (hover: none) shows on every card (templates round 23). */
  ".product-item .product-grid .product-item__inner .pc-form--media { opacity: 0 !important; }",
  ".product-item .product__media.show_secondary.peek-secondary > .secondary-image { opacity: 0 !important; }",
  /* A background attached to the screen is painted in every screen: attached to its own box, it is painted once. */
  "*, *::before, *::after { background-attachment: scroll !important; }",
].join("\n")

/** A fixed layer this much of the screen tall or more is a backdrop: in the first screen only. */
export const BACKDROP_SHARE = 0.5

/**
 * Run in the page before each screen is photographed (page.evaluate, with
 * BACKDROP_SHARE as `share`: it runs in the page, where nothing of this file is). `first` is the first
 * screen: the header stays and backdrops stay; after it, whatever is fixed
 * to the screen is let go of, backdrops included, so nothing is painted
 * twice. Sticky things keep their place in the page.
 */
export function releaseForPhotograph(first: boolean, share: number): { backdrops: number; bars: number } {
  let backdrops = 0
  let bars = 0
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    const cs = getComputedStyle(el)
    if (cs.position === "sticky") {
      el.style.setProperty("position", "static", "important")
      continue
    }
    if (cs.position !== "fixed" || el.offsetHeight === 0) continue
    const inHeader = !!el.closest(".shopify-section-group-header-group, header")
    if (el.offsetHeight >= innerHeight * share) {
      backdrops++
      if (!first) el.style.setProperty("visibility", "hidden", "important")
    } else if (!first || !inHeader) {
      bars++
      el.style.setProperty("display", "none", "important")
    }
  }
  return { backdrops, bars }
}
