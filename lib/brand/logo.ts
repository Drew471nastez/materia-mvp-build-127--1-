/**
 * ===========================================================================
 *  THE STORELIB MARK, IN ONE PLACE
 * ===========================================================================
 * This URL was a string literal in nineteen files. Changing the logo meant
 * finding all nineteen, and the last one to be missed is the one somebody
 * screenshots. So it is a constant, and the test beside it counts the
 * literals to keep it that way.
 *
 * IT IS SERVED FROM OUR OWN ORIGIN rather than from Supabase storage, and
 * that is not tidiness:
 *
 *   The old mark was a 512x512 SVG fetched cross-origin on every page that
 *   drew a header, a footer or a sidebar — a DNS lookup, a TLS handshake and
 *   a request to a host that has nothing else to do with rendering the page.
 *   A file in /public is on the connection the document already came down.
 *
 *   Next's optimizer will not resize an arbitrary remote host, so every one
 *   of those places was decoding the full-size original into a 32px box. From
 *   /public it is resized per usage, which is the whole point of <Image>.
 *
 *   And the Android welcome screen was reaching for it through Supabase's
 *   /render/image/ transform, which this repository bans on cost grounds
 *   (tests/no-image-transforms.test.ts). That ban only scans code files, so
 *   an HTML asset had quietly kept one.
 *
 * 512 square, quality 90, 19KB. The largest the mark is ever DRAWN is 46px,
 * so 512 is roughly three times what a 3x screen asks for and leaves the
 * apple-touch icon room; the favicons are separate files because a browser
 * asks for those by convention rather than through the optimizer.
 */
export const STORELIB_LOGO = "/storelib-logo.webp"

/**
 * The same mark where a bare path will not do: an email, an Open Graph card,
 * anything read by something that is not this document. Falls back to the
 * production host, because those consumers have no origin to resolve against.
 */
export function storelibLogoUrl(origin?: string): string {
  const base = origin || process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
  return `${base.replace(/\/+$/, "")}${STORELIB_LOGO}`
}
