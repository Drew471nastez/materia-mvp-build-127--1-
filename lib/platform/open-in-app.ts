/**
 * The addresses behind "Open in app" (components/library/open-in-app.tsx),
 * and the app's side of them (components/native-auth-handler.tsx). Pure, so
 * both ends are tested against one another.
 */

export type Phone = "ios" | "android"

export const APP_PACKAGE = "com.storelib.app"
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`

/** The cookie that says the library's app banner was closed, and for how long it stays closed. */
export const APP_BANNER_COOKIE = "storelib_app_banner"
export const APP_BANNER_QUIET_DAYS = 30

/** The app's own web view says so in its user agent (app/library/layout.tsx isCapacitorWebView reads the same). */
export function isAppWebView(ua: string): boolean {
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

/**
 * The phone the library's banner is drawn for, decided on the server from
 * the request: a phone's browser, not the app, and not closed in the last
 * APP_BANNER_QUIET_DAYS. Null draws nothing.
 */
export function bannerPhone(ua: string, closedCookie: string | null | undefined): Phone | null {
  if (closedCookie === "closed" || isAppWebView(ua)) return null
  return phoneOf(ua)
}

export function phoneOf(ua: string): Phone | null {
  if (/iPhone|iPod/i.test(ua)) return "ios"
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "android"
  return null
}

/** A path on this site, never another site's address dressed as one. */
function sitePath(path: string | null | undefined): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path)) return null
  return path
}

/** The address that opens the app, from the page this is on. */
export function appLink(phone: Phone, path: string): string {
  const safe = sitePath(path) ?? "/account/library"
  if (phone === "ios") return `${APP_PACKAGE}://open?path=${encodeURIComponent(safe)}`
  return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
}

/**
 * A storelib.com link the phone handed to the app (a Universal Link or an
 * App Link, lib/platform/app-links.ts) that is a page to show. The sign in
 * and password reset returns are not: lib/native-oauth.ts has its own
 * handling for those, which a second navigation would race.
 */
const HANDLED_ELSEWHERE = /^\/(?:app\/)?(?:auth\/|reset-password)|^\/app\/settings\/billing/

/** Inside the app: the page an "open" link or a storelib.com link asks for, or null for any other link. */
export function openTarget(url: string): string | null {
  const m = /^(?:com\.storelib\.app|storelib):\/\/open\/?\?(.*)$/i.exec(url || "")
  if (m) {
    try {
      return sitePath(new URLSearchParams(m[1]).get("path"))
    } catch {
      return null
    }
  }
  const web = /^https:\/\/(?:www\.)?storelib\.com(\/[^#]*)?(?:#.*)?$/i.exec(url || "")
  if (!web) return null
  const path = sitePath(web[1] || "/")
  if (!path || HANDLED_ELSEWHERE.test(path)) return null
  return path
}

/**
 * ===========================================================================
 *  THE "OPEN IN THE APP" PILL ON A COMMUNITY (components/community/
 *  open-in-app-pill.tsx)
 * ===========================================================================
 * The address that opens this very page in the app:
 *
 *   iPhone    the app's scheme with the page (com.storelib.app://open?path=),
 *             the App Store when nothing answers; iOS never opens a
 *             Universal Link for a tap on the site it is already on
 *   Android   the page itself as an intent for the app's package: with App
 *             Links verified (lib/platform/app-links.ts) the app opens on it,
 *             and Chrome falls back to the Play Store when it is not there
 */
export function pageAppLink(phone: Phone, path: string, host = "storelib.com"): string {
  const safe = sitePath(path) ?? "/"
  if (phone === "ios") return `${APP_PACKAGE}://open?path=${encodeURIComponent(safe)}`
  return `intent://${host}${safe}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
}

/**
 * Whether the pill is drawn, and for which phone. Never in the app, never
 * on a computer; on an iPhone's Safari only when the system's own Smart App
 * Banner is not there to do it (no App Store id configured), since two
 * banners for one app is one too many. Chrome and Firefox on an iPhone have
 * no Smart App Banner, so they get the pill.
 */
export function pillPhone(ua: string, smartBanner: boolean): Phone | null {
  if (isAppWebView(ua)) return null
  const phone = phoneOf(ua)
  if (phone === "ios" && smartBanner && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return null
  return phone
}

/** The pill's own quiet time once closed. */
export const APP_PILL_KEY = "storelib:app-pill-closed"
export const APP_PILL_QUIET_DAYS = 30
