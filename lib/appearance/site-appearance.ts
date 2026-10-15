/**
 * ===========================================================================
 *  LIGHT OR DARK, FOR THE PERSON, ACROSS STORELIB'S OWN PAGES
 * ===========================================================================
 * Round 27, the owner: the light and dark switch is the person's, kept for
 * their account, and it applies to Storelib's own buyer pages (Explore, the
 * account and its library, settings, communities, profiles), never to the
 * dashboard (/app), a creator's store or a checkout, which have looks of
 * their own.
 *
 * Kept three ways, each for a reason:
 *   - this browser (localStorage), so the first paint of the next page is
 *     already right (APPEARANCE_BOOT, printed in <head>);
 *   - the account (the person's user metadata, app/api/account/appearance),
 *     so it follows them to their phone and the native apps;
 *   - nothing else: no IP or device guess. A person who never chose gets
 *     light, or inside a community the look its creator picked.
 *
 * Pure and server safe: the root layout prints the boot as text.
 */

import { RESERVED_ROOT_EXTRAS, RESERVED_ROOT_SEGMENTS } from "../routes/reserved-segments"

export type Appearance = "light" | "dark"

/** This browser's copy of the choice. */
export const APPEARANCE_KEY = "storelib:appearance"
/** Round 26's key, read once so a choice made then is kept. */
export const LEGACY_APPEARANCE_KEY = "storelib:community-appearance"

/** The attribute on <html> while a themed page is dark (app/theme-dark.css reads it). */
export const DARK_ATTR = "data-sl-dark"

/**
 * Storelib's own pages that follow the person's look. Never /app, a store, a checkout or a site.
 * Round 30: "/p/", the product page's own address (app/(marketing)/p/[slug]).
 */
export const THEMED_PREFIXES = ["/explore", "/account", "/community", "/u/", "/member/", "/wishlist", "/notifications", "/p/"] as const

/*
  THE PRODUCT PAGE FOLLOWS THE LOOK TOO (round 30, the owner: "in dark mode I open a product from Explore and it is
  light, a jarring jump"). The address Explore's cards hand out is /<handle>/<slug> (lib/url-helpers getProductUrl), which
  has no prefix of its own: it is any two segment path whose first segment is not one of the platform's own words
  (lib/routes/reserved-segments) and whose second is not the creator's links page. A creator's product page with a look
  of their own (a scheme, colours or an arranged page) says so with data-own-look and keeps it, as a creator page under
  /u/ does; only the platform's default look is drawn dark (app/(marketing)/p/[slug]/page.tsx, productHasOwnLook).

  WHOSE LOOK, PART BY PART (round 31, the owner: "in dark mode, opening a product from Explore lands on a white product
  page and a white header"):
    - Storelib's own chrome follows the person, on every themed page, whatever is under it: the header, the tab bar,
      the strip under the clock, and the sheets, menus and dialogs a page opens (they are drawn over the page, in
      Storelib's components, and portalled out of it).
    - A creator's own look ([data-own-look]: a creator page under /u/, a product page its creator designed) keeps
      exactly the colours the creator chose, in both looks, and everything drawn inside it with them: its bars, its buy
      card, its option rows, its wishlist button. Those carry the creator's colours, and a dark one on a light page of
      the creator's would be the clash.
    - Storelib's own product page (no look of the creator's, data-product-look="site") is Storelib's chrome all the
      way down: the whole page follows the person, its inline colours painted through ./site-paint.
  So the dark attribute stays on <html> on a themed page with a look of the creator's own: app/theme-dark.css leaves
  [data-own-look] out of every rule and puts the light tokens back inside it (scripts/gen-theme-dark.mjs OWN). Until
  round 31 a boot took the dark look off the whole document there (OWN_LOOK_BOOT), and the header and the sheets went
  white with the page.
*/
export const PLATFORM_FIRST_SEGMENTS: readonly string[] = [...RESERVED_ROOT_SEGMENTS, ...RESERVED_ROOT_EXTRAS].map((s) => s.toLowerCase())

/** A product's address on Storelib's own domain: /<handle>/<slug>. */
export function productAddress(pathname: string): boolean {
  const parts = pathname.split("/")
  if (parts.length !== 3 || parts[0] !== "" || !parts[1] || !parts[2]) return false
  const first = parts[1].toLowerCase()
  return first.charAt(0) !== "@" && first.indexOf(".") < 0 && parts[2] !== "links" && !PLATFORM_FIRST_SEGMENTS.includes(first)
}

export function themedPath(pathname: string | null | undefined): boolean {
  const p = pathname || "/"
  return THEMED_PREFIXES.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x || p.startsWith(`${x}/`))) || productAddress(p)
}

export function isAppearance(v: unknown): v is Appearance {
  return v === "light" || v === "dark"
}

/**
 * Printed in <head>: the dark look on <html> before the first paint, for a
 * person who chose dark, on a themed page. Mirrors themedPath.
 */
export const APPEARANCE_BOOT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||localStorage.getItem(${JSON.stringify(LEGACY_APPEARANCE_KEY)});if(s!=="dark")return;var p=location.pathname||"/";var h=document.documentElement;var on=function(){h.setAttribute(${JSON.stringify(DARK_ATTR)},"");h.style.colorScheme="dark"};var t=${JSON.stringify(THEMED_PREFIXES)};for(var i=0;i<t.length;i++){var x=t[i];if(x.charAt(x.length-1)==="/"?p.indexOf(x)===0:(p===x||p.indexOf(x+"/")===0)){on();return}}var q=p.split("/");if(q.length===3&&q[0]===""&&q[1]&&q[2]){var f=q[1].toLowerCase();if(f.charAt(0)!=="@"&&f.indexOf(".")<0&&q[2]!=="links"&&${JSON.stringify(PLATFORM_FIRST_SEGMENTS)}.indexOf(f)<0)on()}}catch(e){}})();`

/*
  ===========================================================================
   INTO THE DASHBOARD FROM THE DARK LOOK (round 30)
  ===========================================================================
  The owner: "in dark mode, going from a community to the dashboard shows white while it loads". /app is never dark (its
  header is #111111, its pages light), and it is a document of its own (lib/native-links DOCUMENT_LOAD_PREFIXES), so its
  first frames were the canvas the head script paints (app/globals.css html.app-arriving): the header's colour across the
  top and a light field under it, over a dark page a moment earlier. That field was the white.

  So the tab remembers the look it last painted (LOOK_NOW_KEY, this tab's session storage, written by paintAppearance on
  every move), and an /app document that opens after a dark page starts under a veil of the header's own colour
  (APP_FROM_DARK_CLASS, html::after): the dark page is followed by dark, never by a light field, and once the shell is on
  the screen (components/app/app-layout-wrapper) the veil fades off it in APP_FROM_DARK_MS, opacity only, so the
  dashboard comes up out of its own header colour. A client move into /app from a dark page plays the same fade. The
  dark attribute is never on an /app document (the boot leaves it off), and a client move takes it off in the same
  layout effect that starts the veil, so /app is never left dark.
*/
/** This tab's last painted look (session storage): "dark" or "light". */
export const LOOK_NOW_KEY = "storelib:look-now"
/** On <html> while the veil is up, and with the second class while it fades off. */
export const APP_FROM_DARK_CLASS = "app-from-dark"
export const APP_FROM_DARK_OUT_CLASS = "app-from-dark-out"
/** How long the veil takes to fade off the dashboard (app/globals.css reads the same number). */
export const APP_FROM_DARK_MS = 240
/** A shell that is slow to come is not waited on longer than this: the veil fades off whatever is there. */
export const APP_FROM_DARK_CAP_MS = 1500

/** Printed in <head>: the veil, before the first paint, on an /app document opened after a dark page in this tab. */
export const APP_FROM_DARK_BOOT = `(function(){try{if(!/^\\/app(\\/|$)/.test(location.pathname))return;if(sessionStorage.getItem(${JSON.stringify(LOOK_NOW_KEY)})!=="dark")return;var h=document.documentElement;h.classList.add(${JSON.stringify(APP_FROM_DARK_CLASS)});setTimeout(function(){if(!h.classList.contains(${JSON.stringify(APP_FROM_DARK_CLASS)}))return;h.classList.add(${JSON.stringify(APP_FROM_DARK_OUT_CLASS)});setTimeout(function(){h.classList.remove(${JSON.stringify(APP_FROM_DARK_CLASS)},${JSON.stringify(APP_FROM_DARK_OUT_CLASS)})},${APP_FROM_DARK_MS + 60})},${APP_FROM_DARK_CAP_MS})}catch(e){}})();`

/*
  No boot for a page with a look of its own any more (round 31): it took the dark look off the whole document, the
  Storelib header and the sheets with it. The dark sheet leaves [data-own-look] out instead (WHOSE LOOK, PART BY PART).
*/
