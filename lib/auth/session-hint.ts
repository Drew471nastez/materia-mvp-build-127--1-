/**
 * ===========================================================================
 *  IS ANYBODY SIGNED IN IN THIS BROWSER, WITHOUT ASKING ANYBODY (round 49)
 * ===========================================================================
 * The creator page, the product page and Explore are drawn the same for
 * everybody now (one HTML a CDN may hold, tests/cdnpages-r49), and whatever
 * is somebody's own (Edit, Download, the Contact for a buyer, For you) is
 * asked for after the page has loaded. Most visitors are strangers: they
 * should not pay a request to be told they are nobody.
 *
 * The Supabase session cookie (`sb-<project>-auth-token`, whole or in
 * chunks) is readable by the page (lib/supabase/server.ts: the browser
 * client needs it), and sl_owned_hint says "this browser bought something
 * here as a guest" (lib/receipts/guest-access.ts). Neither proves anything;
 * each only says it is worth asking. The answer always comes from a route
 * that reads the real session or the signed, httpOnly sl_owned.
 */

const SESSION = /(?:^|;\s*)(?:__Host-)?sb-[^=;]+-auth-token(?:\.\d+)?=[^;]/
const GUEST_HINT = /(?:^|;\s*)sl_owned_hint=1(?:;|$)/

function jar(): string {
  try {
    return typeof document === "undefined" ? "" : document.cookie
  } catch {
    return ""
  }
}

/** A Storelib session cookie is in this browser (signed in, or was). */
export function mayBeSignedIn(cookie: string = jar()): boolean {
  return SESSION.test(cookie)
}

/** This browser bought something here without an account (the readable companion of sl_owned). */
export function mayOwnAsGuest(cookie: string = jar()): boolean {
  return GUEST_HINT.test(cookie)
}
