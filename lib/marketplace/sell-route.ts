/**
 * ===========================================================================
 *  WHERE THE SELL FORM LIVES, ASKED IN ONE PLACE
 * ===========================================================================
 *
 * The form has two addresses now — `/products/new` to write a listing and
 * `/products/edit/<id>` to change one — and eight different components need to
 * know whether the screen currently showing is that form:
 *
 *   the tab bar          to draw the + as an ×, and to know the sheet is up
 *   the global nav       to keep the bar mounted underneath rather than
 *                        removing it and reflowing the page behind the sheet
 *   the top bar          to drop the app's own chrome while the sheet is over it
 *   the tab transition   to not play a screen fade under a rising sheet
 *   the scroll reset     to leave the page underneath where you left it
 *   the footer           to not end a form in a sitemap
 *
 * Every one of those was `pathname.startsWith("/products/new")` written out by
 * hand. Adding a second address to eight string comparisons is how seven of
 * them get updated and the eighth quietly starts treating the edit screen as an
 * ordinary listing page — which, for `isListing` in the global nav, would have
 * hidden the tab bar under the sheet and reflowed the profile behind it. That
 * is precisely the flash the note in that file exists to explain.
 *
 * So the question is asked once, here, and the answer is imported. A third
 * address later is one line in this file.
 */

/** Writing a new listing. */
export const SELL_NEW = "/products/new"

/** Changing one that already exists. A real route rather than a query string on
 *  the new-listing page: the URL is the one part of a screen a person can read,
 *  and `/products/new?edit=…` says "new" to somebody who is editing. */
export function sellEditHref(listingId: string): string {
  return `/products/edit/${encodeURIComponent(listingId)}`
}

/**
 * Finishing a draft.
 *
 * Still a query on /products/new, and deliberately: a draft has never been
 * published, so it IS a new listing — one you started earlier. It saves through
 * the drafts route, which is the only one that knows how to publish from a
 * draft, and putting it under /edit would say it was already live.
 */
export function sellDraftHref(draftId: string): string {
  return `${SELL_NEW}?draft=${encodeURIComponent(draftId)}`
}

/**
 * Is this path the sell form — either of them?
 *
 * `startsWith` on the edit route includes the trailing slash on purpose. Without
 * it `/products/editorial-picks` would match, and a listing whose slug happens
 * to begin with "edit" would lose the tab bar and be treated as a form.
 */
export function isSellFormRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  // BOUNDED, and for the reason the note above gives about `edit` — which was
  // written about `edit` and then not applied to `new`.
  //
  // A bare `startsWith(SELL_NEW)` matches `/products/newbalance-97`, and the
  // consequence is worse there than losing a tab bar: `sheetOpen` is what the +
  // checks before opening, so on any listing whose slug begins with "new" the
  // button silently refuses every press, for as long as that page is open, with
  // nothing to suggest why. A query string never reaches this — usePathname
  // strips it — so the only two shapes that count are the route itself and
  // anything nested under it.
  if (pathname === SELL_NEW || pathname.startsWith(`${SELL_NEW}/`)) return true
  return pathname.startsWith("/products/edit/")
}

/**
 * ===========================================================================
 *  ON A DESKTOP, "VINDE ACUM" IS A PAGE
 * ===========================================================================
 *
 * Both sell addresses are intercepted routes, so a client navigation renders
 * them into the layout's @modal slot over the screen you were on. That is right
 * on a phone — the sheet needs something to slide over, and `router.back()`
 * returns you to the feed at the scroll you left it.
 *
 * On a monitor it is wrong for a reason that has nothing to do with how it
 * looks: writing a listing there is a ten-minute job with eight photographs in
 * it, and a modal says the opposite — that this is a quick aside from the page
 * behind, dismissable by clicking away from it. The URL bar says
 * /products/new and the screen says "you are still on the feed".
 *
 * An interception only fires on a CLIENT navigation. A document load resolves
 * the real route, full-page, with the site header above it — so the fix is not
 * to defeat the router but to stop asking it. One line at the two places a
 * person starts a listing from on a desktop.
 *
 * Deliberately NOT a media query in CSS or a breakpoint constant imported from
 * somewhere else: 768 is `md`, it is the same number the form's own layout
 * turns on at, and the two must agree or there is a width at which the page
 * opens as a modal and then renders as a page inside it.
 */
export function sellOpensAsPage(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(min-width: 768px)").matches
}

/**
 * Returns true when it has handled the navigation itself.
 *
 * `assign`, not `href`: it leaves the current page in the session history, so
 * the browser's back button returns to the feed rather than to nothing.
 */
export function goToSellFormAsPage(href: string): boolean {
  if (!sellOpensAsPage()) return false
  window.location.assign(href)
  return true
}
