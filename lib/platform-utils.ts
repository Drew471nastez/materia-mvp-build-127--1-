/**
 * Helper to determine if platform header should be shown based on searchParams
 * Only checks the query parameter, no sessionStorage or referrer logic
 */
export function getShowPlatformHeader(searchParams: Record<string, string | string[] | undefined>): boolean {
  const src = searchParams.src
  return src === "platform"
}

/**
 * Detect whether the page is running inside the Storelib Capacitor native wrapper
 * (iOS / Android WebView). Returns false during SSR.
 *
 * Signals used (any one is sufficient):
 *  1. window.Capacitor.isNativePlatform() — set by the Capacitor runtime
 *  2. User-Agent contains "StorelibApp", "Capacitor", or "wv" (Android WebView flag)
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as any).Capacitor
  if (cap?.isNativePlatform?.()) return true
  const ua = navigator.userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}
