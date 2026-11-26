/**
 * ===========================================================================
 *  ADD TO CART WHILE IT WORKS: THE SPINNER, NEVER THE ICON BESIDE IT
 * ===========================================================================
 * Round 11, the owner: "When I click it, it shows the loading thing to open
 * the cart drawer. If the icon is there in such a button, it should not show
 * that icon when it's in the loading state."
 *
 * An imported theme's own script runs Add to cart: it marks the button busy
 * (Dawn and most themes add `loading`; others `is-loading`, `btn--loading`,
 * `button--loading`, or aria-busy="true"), shows its spinner, posts to
 * /cart/add.js and opens its cart drawer when the answer comes back. A theme
 * that puts a bag or cart icon in the button often forgets the icon, so the
 * spinner turned while the icon still sat beside it (or under it).
 *
 * So, on every page of an imported theme (the live site and the builder's
 * canvas alike, theme.ts renderDocument), any Add to cart button that is
 * busy hides its icons: `visibility: hidden`, which keeps their room, so the
 * button never changes width or height and its label never moves. The
 * spinner itself is left alone: anything named a spinner or a loader (or
 * inside one) inside the button is never hidden. When the theme takes the
 * busy mark off (the line added, or an error), the icon is simply there
 * again, in the same place, with no fade to watch.
 *
 * Pure CSS, no script: it follows whatever the theme's script does, at the
 * same frame. tests/store-r11.test.ts pins it, and scripts/check-store-r11.mjs
 * presses the buttons in a browser.
 */

/** What a theme calls a button that puts the product in the cart. */
export const ADD_TO_CART_BUTTONS = [
  'form[action*="/cart/add"] button',
  'form[action*="/cart/add"] [type="submit"]',
  '[name="add"]',
  "[data-add-to-cart]",
  "[data-add-to-cart-button]",
  '[data-action="add-to-cart"]',
  ".product-form__submit",
  ".product-form__cart-submit",
  ".quick-add__submit",
  '[class*="add-to-cart" i]',
  '[class*="add_to_cart" i]',
  '[class*="addtocart" i]',
  '[id*="add-to-cart" i]',
  '[id*="addtocart" i]',
]

/** How a theme says the button is working: on the button, or on the form around it. */
export const BUSY_MARKS = [".loading", ".is-loading", ".btn--loading", ".button--loading", ".is-busy", '[aria-busy="true"]', '[data-loading="true"]']

/** The spinner's own parts, which stay as the theme draws them. */
const SPINNER = '[class*="spin" i],[class*="loader" i],[class*="loading" i],[class*="progress" i]'

/** An icon: a drawing, a picture or an icon font's glyph. */
const ICON = "svg,img,i,.icon"

const busyButton = `:is(${ADD_TO_CART_BUTTONS.join(",")}):is(${BUSY_MARKS.join(",")})`
const busyForm = `form[action*="/cart/add"]:is(${BUSY_MARKS.join(",")}) :is(button,[type="submit"])`

/*
  Two rules, so a browser that cannot read one still keeps the other. In
  each, an icon inside the busy button is hidden unless it is the spinner
  or part of one (looked for inside that same button only, so a section
  whose wrapper happens to say "loader" changes nothing).
*/
/*
  Round 28: "inside a spinner" is written `… :is(${SPINNER}) :is(${ICON})`,
  not `… :is(${SPINNER}) *`. They match the same icons (the rule only ever
  styles an icon), but a `*` under a [class*=…] test told Chrome that any
  class change anywhere could restyle everything below it: a class on <html>
  (a drawer's scroll lock, a menu opening) restyled the whole page, 20 to
  40ms on a store page and far more on a phone, in the frame the panel was
  to start moving. With the icons named, only icons are looked at again.
*/
const rule = (button: string) => `${button} :is(${ICON}):not(:is(${SPINNER}),${button} :is(${SPINNER}) :is(${ICON})){visibility:hidden!important}`

export const BUSY_BUTTON_CSS = `${rule(busyButton)}${rule(busyForm)}`

/** In the <head> of every page of an imported theme, after the theme's own stylesheets. */
export const BUSY_BUTTON_FIX = `<style data-sl-busy-buttons>${BUSY_BUTTON_CSS}</style>`
