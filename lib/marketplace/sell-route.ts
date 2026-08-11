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
