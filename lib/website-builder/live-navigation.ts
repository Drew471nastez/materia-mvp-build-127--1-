/**
 * ===========================================================================
 *  NO WHITE FLASH BETWEEN A LIVE SITE'S PAGES
 * ===========================================================================
 * A Storelib website and an imported Shopify theme alike go from page to
 * page by loading the next page whole, as Shopify does. The next page is
 * already fetched while the pointer rests on its link
 * (lib/website-builder/prefetch-rules.ts); this is the other half, how the
 * change looks. A cross-document view transition keeps the page being left
 * on screen until the next one can be drawn, then the two cross-fade,
 * briefly: no white page between them, and the header and its logo do not
 * blink. Off for a visitor who has asked for less motion, and ignored by a
 * browser that does not have it, which loads pages as it always did.
 *
 * Live pages only: the builder's canvas draws one page and does not move.
 */
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

/** As markup, for a page drawn as text (an imported theme's live page). */
export function liveNavigationMarkup(): string {
  return `<style data-storelib-navigation>${VIEW_TRANSITION_CSS}</style>`
}
