/**
 * ===========================================================================
 *  MOVING BETWEEN THE PAGES OF A LIVE SITE: FETCHED AHEAD, NO FLASH
 * ===========================================================================
 * A Storelib website and an imported Shopify theme alike go from page to
 * page by loading the next page whole, as Shopify does. Two things the
 * browser offers make that fast and calm, and both are ignored by a browser
 * that does not have them, so nothing changes there:
 *
 *   SPECULATION RULES   a link of this site is fetched while the pointer
 *                       rests on it (or a finger is down on it), so the page
 *                       is in hand by the click. Fetched only, never
 *                       prerendered: no script of the next page runs and no
 *                       visit is counted before somebody arrives. The cart,
 *                       checkout, the account pages, the API and anything
 *                       marked nofollow are never fetched ahead.
 *
 *   VIEW TRANSITIONS    the page being left stays on screen until the next
 *                       one can be drawn, then the two cross-fade, briefly.
 *                       No white page between them, and the header and its
 *                       logo do not blink. Off for a visitor who has asked
 *                       for less motion.
 *
 * Live pages only: the builder's canvas draws one page and does not move.
 */

const NEVER_AHEAD = ["/cart*", "/checkout*", "/account*", "/api/*", "/wishlist*", "/password*", "/policies/*"]

export const SPECULATION_RULES = JSON.stringify({
  prefetch: [
    {
      source: "document",
      where: {
        and: [
          { href_matches: "/*" },
          ...NEVER_AHEAD.map((p) => ({ not: { href_matches: p } })),
          { not: { selector_matches: "[rel~=nofollow], [target=_blank], [download]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
})

/*
  `:root::` and not `::`: the app's own stylesheet turns the root's fade off
  for its sliding layers (app/globals.css), and this sheet is only on a
  site's pages, so on a site the more particular rule wins and the pages
  cross-fade. plus-lighter adds the two pictures, so what is the same on
  both, the header and its logo, stays exactly as it was through the fade.
*/
export const VIEW_TRANSITION_CSS =
  "@keyframes sl-page-out{to{opacity:0}}@keyframes sl-page-in{from{opacity:0}}" +
  "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:auto}" +
  ":root::view-transition-group(root){animation:none}" +
  ":root::view-transition-old(root){animation:sl-page-out 160ms ease both;mix-blend-mode:plus-lighter}" +
  ":root::view-transition-new(root){animation:sl-page-in 160ms ease both;mix-blend-mode:plus-lighter}}"

/** Both, as markup for a page drawn as text (an imported theme's live page). */
export function liveNavigationMarkup(): string {
  return `<script type="speculationrules">${SPECULATION_RULES}</script><style data-storelib-navigation>${VIEW_TRANSITION_CSS}</style>`
}
