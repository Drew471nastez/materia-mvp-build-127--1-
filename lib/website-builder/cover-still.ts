/**
 * ===========================================================================
 *  THE PAGE A COVER IS TAKEN OF, STILL AND SELF-CONTAINED
 * ===========================================================================
 * The Website page's card shows a photograph of the site's home page, and
 * the page itself, small, while the photograph is on its way. Both open the
 * same page (/cover-render, or /api/site-theme/cover for an imported theme).
 *
 * "Preparing preview" stayed on the card because that page did not finish
 * opening: a theme that loads a script from its own servers (measured in
 * production: a heartbeat script from the theme's app, called again and
 * again) held the document's first paint past 18 seconds, the photograph
 * timed out, and the small page waited for the same script before it showed.
 *
 * So that page answers with a policy of its own:
 *
 *   SCRIPTS   the site's own and the common script CDNs a theme is built on
 *             (jQuery and friends); any other script fails at once instead
 *             of holding the page.
 *   CALLS     only to this origin: a theme's beacons, chat widgets and
 *             heartbeats are not part of a picture.
 *
 * Pictures, fonts and stylesheets load from wherever the theme keeps them.
 *
 * And it is STILL. Every animation is taken straight to its end and nothing
 * transitions, so the small page on the card is not playing the theme's
 * entrance animations in a box, and the photograph is the settled page, not
 * a frame halfway through a fade.
 */

/** Script hosts a theme can rely on. Everything else is not loaded on the cover's page. */
export const COVER_SCRIPT_HOSTS = [
  "https://cdnjs.cloudflare.com",
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://code.jquery.com",
  "https://ajax.googleapis.com",
] as const

/** A policy of its own, sent beside any the page already has (a comma joins two policies, both enforced). */
export const COVER_STILL_POLICY = `script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: ${COVER_SCRIPT_HOSTS.join(" ")}; connect-src 'self'`

/** Every animation at its end, nothing in transition, and anything waiting to be scrolled to shown as it would be. */
export const COVER_STILL_CSS =
  "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important}" +
  ":is([data-reveal],[data-animate],[data-aos],.reveal,.fade-in,.fade-up,.scroll-trigger,.animate-on-scroll,.js-animate,.wow,[class*='animate--']){opacity:1!important;visibility:visible!important;transform:none!important;clip-path:none!important}"

/** Add the still style to a whole HTML document, in its head when it has one. */
export function withStillStyle(html: string): string {
  const tag = `<style data-cover-still>${COVER_STILL_CSS}</style>`
  const head = html.search(/<\/head\s*>/i)
  return head >= 0 ? html.slice(0, head) + tag + html.slice(head) : tag + html
}
