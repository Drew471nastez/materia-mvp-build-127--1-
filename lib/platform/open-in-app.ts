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

/** Inside the app: the page an "open" link asks for, or null for any other link. */
export function openTarget(url: string): string | null {
  const m = /^(?:com\.storelib\.app|storelib):\/\/open\/?\?(.*)$/i.exec(url || "")
  if (!m) return null
  try {
    return sitePath(new URLSearchParams(m[1]).get("path"))
  } catch {
    return null
  }
}
