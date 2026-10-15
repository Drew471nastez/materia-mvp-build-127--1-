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

export type Appearance = "light" | "dark"

/** This browser's copy of the choice. */
export const APPEARANCE_KEY = "storelib:appearance"
/** Round 26's key, read once so a choice made then is kept. */
export const LEGACY_APPEARANCE_KEY = "storelib:community-appearance"

/** The attribute on <html> while a themed page is dark (app/theme-dark.css reads it). */
export const DARK_ATTR = "data-sl-dark"

/** Storelib's own pages that follow the person's look. Never /app, a store, a checkout or a site. */
export const THEMED_PREFIXES = ["/explore", "/account", "/community", "/u/", "/member/", "/wishlist", "/notifications"] as const

export function themedPath(pathname: string | null | undefined): boolean {
  const p = pathname || "/"
  return THEMED_PREFIXES.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x || p.startsWith(`${x}/`)))
}

export function isAppearance(v: unknown): v is Appearance {
  return v === "light" || v === "dark"
}

/**
 * Printed in <head>: the dark look on <html> before the first paint, for a
 * person who chose dark, on a themed page. Mirrors themedPath.
 */
export const APPEARANCE_BOOT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||localStorage.getItem(${JSON.stringify(LEGACY_APPEARANCE_KEY)});if(s!=="dark")return;var p=location.pathname||"/";var t=${JSON.stringify(THEMED_PREFIXES)};for(var i=0;i<t.length;i++){var x=t[i];if(x.charAt(x.length-1)==="/"?p.indexOf(x)===0:(p===x||p.indexOf(x+"/")===0)){var h=document.documentElement;h.setAttribute(${JSON.stringify(DARK_ATTR)},"");h.style.colorScheme="dark";return}}}catch(e){}})();`

/**
 * Printed as the first thing inside a page with a look of its own (a creator's page under /u/): the boot has already
 * put the dark look on <html> for the address, and this takes it off again before anything of the page is drawn.
 */
export const OWN_LOOK_BOOT = `(function(){try{var h=document.documentElement;h.removeAttribute(${JSON.stringify(DARK_ATTR)});h.style.colorScheme="light"}catch(e){}})();`
