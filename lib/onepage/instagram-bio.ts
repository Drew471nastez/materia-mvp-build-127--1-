/**
 * ===========================================================================
 *  ADD YOUR ONEPAGE TO YOUR INSTAGRAM BIO (round AR)
 * ===========================================================================
 * The owner: "in Share, add 'Add link to Instagram bio', with a QR that I
 * can scan with my phone, and it takes me on the phone to a page, white,
 * clean, just the Storelib logo and Instagram: copy your link with a copy
 * button, tap Edit profile then Links, Add external link, paste, Open
 * Instagram".
 *
 * The page is storelib.com/instagram-bio/<page name>
 * (app/(storelib)/(marketing)/instagram-bio/[slug]). It is public, because
 * a phone that scans the code is often not signed in, and so it shows only
 * what the OnePage itself already shows the world: its public address,
 * worked out on the server from the published page (lib/onepage/
 * published-page onePageAddress), never taken from the address bar. A name
 * with no published page is a 404, and the page is never indexed.
 */

export const INSTAGRAM_BIO_PREFIX = "/instagram-bio/"

/** The page a creator's QR code opens. */
export function instagramBioPath(slug: string): string {
  return `${INSTAGRAM_BIO_PREFIX}${encodeURIComponent(slug.trim().toLowerCase())}`
}

/** The same, whole, for the QR code: on Storelib's own origin, wherever the editor is open. */
export function instagramBioUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}${instagramBioPath(slug)}`
}

/**
 * Instagram's own app first, then its website's profile editor. The app's
 * scheme only opens the app; nothing in it can point at Edit profile, so the
 * steps say where to tap.
 */
export const INSTAGRAM_APP_URL = "instagram://app"
export const INSTAGRAM_WEB_URL = "https://www.instagram.com/accounts/edit/"

/** How long the page waits for the app to take over before it opens the website instead. */
export const INSTAGRAM_FALLBACK_MS = 1500

/** The address as the page shows it: no scheme, no trailing slash. */
export function shownAddress(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "")
}
