/**
 * THE NEXT PAGE IS ALREADY HERE WHEN IT IS CLICKED. A link a visitor rests on
 * (or presses) on a published website is fetched in the background by the
 * browser (Speculation Rules: Chrome and Edge; other browsers ignore it), so
 * a click between the site's pages opens what is already downloaded.
 *
 * Prefetch only, never prerender: no page script, pixel or analytics runs
 * for a page nobody opened. The cart, checkout, account and the API are left
 * out, and so is a link marked nofollow, one opening a new tab, or one with
 * `data-no-prefetch`. Used by Storelib's own themes (app/(site)/layout.tsx)
 * and imported ones (lib/storelib-theme/compat/shims.ts).
 */
export const SITE_PREFETCH_RULES = {
  prefetch: [
    {
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: ["/cart", "/cart/*", "/checkout", "/checkout/*", "/account", "/account/*", "/api/*"] } },
          { not: { selector_matches: "[rel~=nofollow], [target=_blank], [data-no-prefetch]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
} as const
