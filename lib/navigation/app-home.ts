/**
 * ===========================================================================
 *  WHERE A BACK PRESS LANDS WHEN THERE IS NOTHING BEHIND IT
 * ===========================================================================
 * The seller's shell has a handful of destinations you reach by pressing a
 * row in the sidebar rather than by drilling in. Everything else in /app sits
 * under one of them: a product editor belongs to Products, an automation to
 * Emails. So a back press with nothing to go back to (a deep link, a
 * notification, an entry the browser replaced) has a real page to land on,
 * and it is the list the page belongs to rather than the home screen.
 *
 * The list is also what the Android hardware key treats as a root: on one of
 * these, back offers to leave the app (components/app/native-back-handler).
 *
 * BUYER ROUTES ARE NOT HERE. /library, /explore and /account are under other
 * layouts, and "the app's home" for somebody reading their library is not
 * /app. The one place that used to list /library never ran on a buyer route,
 * because the handler is mounted in app/app/layout.tsx alone.
 *
 * Its own file, with no imports, so it is a plain function a test can run.
 */

/** The seller shell's own destinations, deepest first is not assumed: homeFor sorts it out. */
export const APP_ROOT_ROUTES = [
  "/app",
  "/app/products",
  /* A row of its own under Products in the sidebar, as Coupons and Reviews are. */
  "/app/products/collections",
  "/app/products/size-charts",
  "/app/analytics",
  "/app/orders",
  "/app/coupons",
  "/app/reviews",
  "/app/onepage",
  /* Round 51: the store's people, above Emails in the sidebar. A profile (/app/contacts/<id>) lands back on it. */
  "/app/contacts",
  "/app/emails",
  "/app/payouts",
  "/app/settings",
]

/** Is this one of the shell's own destinations, rather than a page under one? */
export function isAppRootRoute(pathname: string): boolean {
  return APP_ROOT_ROUTES.some((r) => pathname === r || pathname === r + "/")
}

/**
 * The list `pathname` belongs to, or the app's home. The deepest match wins,
 * so /app/emails/flow/<id> lands on Emails rather than on the home screen.
 */
export function homeFor(pathname: string): string {
  let best = "/app"
  for (const r of APP_ROOT_ROUTES) {
    if ((pathname === r || pathname.startsWith(r + "/")) && r.length > best.length) best = r
  }
  return best
}
