/**
 * The addresses behind "Open in app" (components/library/open-in-app.tsx),
 * and the app's side of them (components/native-auth-handler.tsx). Pure, so
 * both ends are tested against one another.
 */

export type Phone = "ios" | "android"

export const APP_PACKAGE = "com.storelib.app"
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE}`

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
  const safe = sitePath(path) ?? "/library"
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
