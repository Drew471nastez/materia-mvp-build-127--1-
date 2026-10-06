/**
 * ===========================================================================
 *  THE STORELIB LOGO, IN ONE PLACE
 * ===========================================================================
 * Every file that draws the logo gets it from here, and every page that
 * shows it draws it through one component (components/brand/storelib-logo.tsx).
 * Changing the logo is a new file in public/images/brand and a new path
 * below; tests/brand-logo.test.ts keeps it that way by naming any file that
 * reaches for the picture on its own.
 *
 * THE FILES ARE VERSIONED BY NAME (-v2), not replaced in place. Next's image
 * optimizer keeps a resized copy for a year (minimumCacheTTL in
 * next.config.mjs), keyed on the source path, so a new picture at the old
 * path would keep serving the old logo from that cache. A new name is a new
 * key everywhere at once: the optimizer, browsers, email clients and Google.
 * /images/:path* is also served immutable for a year (next.config.mjs), which
 * is right for a file whose name changes when its content does.
 *
 * /storelib-logo.webp, the path the logo lived at before, holds the same new
 * picture, so a link to it from anywhere outside this code shows the new
 * logo too.
 *
 * WHAT EACH FILE IS FOR:
 *
 *   storelib-logo-v2.webp        512 square, opaque, 9KB. Every page. The
 *                                page rounds it (7px) and gives it its faint
 *                                shadow, so the file has square corners.
 *   storelib-logo-v2.png         The same square as a PNG, for readers that
 *                                may not take webp: Google's Organization
 *                                logo and the invoice PDF.
 *   storelib-logo-email-v2.png   96 square (32px at 3x) with the corners cut
 *                                into the file, because Outlook on Windows
 *                                has no webp and ignores border-radius.
 *   storelib-og-v2.jpg           The 1200x630 share card, the logo on grey.
 */
export const STORELIB_LOGO = "/images/brand/storelib-logo-v2.webp"
export const STORELIB_LOGO_PNG = "/images/brand/storelib-logo-v2.png"
export const STORELIB_EMAIL_LOGO = "/images/brand/storelib-logo-email-v2.png"
export const STORELIB_OG_IMAGE = "/images/brand/storelib-og-v2.jpg"

/**
 * THE PRODUCTION HOST, WRITTEN OUT. An email, a share card, a PDF and Google
 * read these addresses long after the page that wrote them, from somewhere
 * that has no origin to resolve a bare path against, so they are always the
 * live site and never a preview deployment that will be gone next week.
 */
export const STORELIB_ORIGIN = "https://storelib.com"

/** Any of the files above as the full address, for readers outside this document. */
export function storelibAssetUrl(path: string): string {
  return `${STORELIB_ORIGIN}${path}`
}

/** The logo as the full address: the Organization logo Google reads, and anything else outside the page. */
export function storelibLogoUrl(): string {
  return storelibAssetUrl(STORELIB_LOGO_PNG)
}

/**
 * THE CORNER. "Everywhere it appears it must sit in a 7px border radius."
 * At 18px and up that is 7px exactly. Below 18px, 7px is most of the way to
 * a circle (a 16px square with 8px corners IS one), so the few places that
 * draw the logo as a small icon, 12 to 16px, keep its shape instead: the
 * proportion 7px is of 32px, the size the logo has in an email.
 */
export const STORELIB_LOGO_RADIUS = 7
export function storelibLogoRadius(size: number): number {
  if (size >= 18) return STORELIB_LOGO_RADIUS
  return Math.round(((size * STORELIB_LOGO_RADIUS) / 32) * 10) / 10
}

/**
 * THE DEPTH: "extremely little, a tiny, almost unnoticeable shadow". A half
 * pixel hairline at 6% ink, so the edge holds on white, and a one pixel
 * shadow at 5% under it. On the dark headers neither shows, which is right.
 */
export const STORELIB_LOGO_SHADOW = "0 0 0 0.5px rgba(15,23,42,0.06), 0 1px 1.5px rgba(15,23,42,0.05)"

/** A touch more depth on light surfaces (onboarding, join). */
export const STORELIB_LOGO_SHADOW_JOIN =
  "0 0 0 0.5px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.07), 0 4px 12px -5px rgba(15,23,42,0.14)"
