/**
 * lib/native-bridge.ts
 *
 * Centralised wrapper around window.StorelibNative — the Android
 * JavascriptInterface injected by MainActivity.java in the Capacitor WebView.
 *
 * Every function is a safe no-op in a browser / SSR environment.
 *
 * Why a single file?
 *   - Avoids scattered `(window as any).StorelibNative?.xxx?.()` snippets.
 *   - Guards are applied once here, not repeated in every caller.
 *   - The nativeAuthInProgress flag is owned here so all callers agree on state.
 */

// ── Bridge accessor ──────────────────────────────────────────────────────────
function bridge(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null
  return (window as any).StorelibNative ?? null
}

// ── Overlay control ──────────────────────────────────────────────────────────

/**
 * Tell the native shell to show (or keep showing) the loading overlay.
 * Call this before opening a Chrome Custom Tab for OAuth so the overlay
 * is already visible when the WebView activity resumes on return.
 */
export function nativeAuthStart(): void {
  try { (bridge() as any)?.authStart?.() } catch { /* ignore */ }
}

/**
 * Dismiss the native loading overlay — guarded version.
 *
 * No-ops while `nativeAuthInProgress` is set so the overlay is never
 * dismissed prematurely mid-exchange.  Safe to call from any route or
 * effect without manually checking the flag at each call site.
 */
export function nativeAppReady(): void {
  try {
    if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
    ;(bridge() as any)?.appReady?.()
  } catch { /* sessionStorage unavailable (SSR) or bridge absent (web) */ }
}

/**
 * Dismiss the overlay unconditionally — for confirmed final destinations
 * (/app, /library, /signup/success) where auth is complete and content
 * is fully rendered.  Does NOT check the nativeAuthInProgress flag.
 */
export function nativeAppReadyForce(): void {
  try { (bridge() as any)?.appReady?.() } catch { /* ignore */ }
}

// ── nativeAuthInProgress flag ────────────────────────────────────────────────
// Written by native-oauth.ts when a deep-link code exchange is running.
// Read by nativeAppReady() and useAuthGate() to suppress premature overlay
// dismissal or redirect logic.

export function setNativeAuthInProgress(value: boolean): void {
  try {
    if (value) sessionStorage.setItem("nativeAuthInProgress", "1")
    else sessionStorage.removeItem("nativeAuthInProgress")
  } catch { /* ignore */ }
}

export function isNativeAuthInProgress(): boolean {
  try { return sessionStorage.getItem("nativeAuthInProgress") === "1" }
  catch { return false }
}

// ── Platform detection ───────────────────────────────────────────────────────

/**
 * Returns true when running inside the Capacitor native wrapper.
 * Returns false during SSR and in a regular browser.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as any).Capacitor
  if (cap?.isNativePlatform?.()) return true
  const ua = navigator.userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

// ── Native home route cache ───────────────────────────────────────────────────
// Persisted in Capacitor Preferences so NativeStartupRouter can route the user
// to /app or /library on cold start without a DB round-trip on every launch.
// Written after every successful login / OAuth. Cleared on logout.

const NATIVE_HOME_KEY = "sb-native-home"

/**
 * Persist the user's home route (/app or /library) in Capacitor Preferences.
 * Call after determining account type post-login or post-OAuth.
 * No-op on web / SSR.
 */
export async function cacheNativeHome(destination: string): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const cap = (window as any).Capacitor
    if (!cap?.isNativePlatform?.()) return
    const { Preferences } = await import("@capacitor/preferences")
    await Preferences.set({ key: NATIVE_HOME_KEY, value: destination })
  } catch { /* ignore */ }
}

/**
 * Read the cached home route from Capacitor Preferences.
 * Returns null if not set or not on native.
 */
export async function getCachedNativeHome(): Promise<string | null> {
  if (typeof window === "undefined") return null
  try {
    const cap = (window as any).Capacitor
    if (!cap?.isNativePlatform?.()) return null
    const { Preferences } = await import("@capacitor/preferences")
    const { value } = await Preferences.get({ key: NATIVE_HOME_KEY })
    return value
  } catch { return null }
}

/**
 * Remove the cached home route from Capacitor Preferences.
 * Called on logout so the next login re-determines the route from the DB.
 */
async function clearNativeHome(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    const cap = (window as any).Capacitor
    if (!cap?.isNativePlatform?.()) return
    const { Preferences } = await import("@capacitor/preferences")
    await Preferences.remove({ key: NATIVE_HOME_KEY })
  } catch { /* ignore */ }
}

// ── Log-out ──────────────────────────────────────────────────────────────────

/**
 * Signal the native shell to end the session and return to the welcome screen.
 *
 * Android:
 *   Calls StorelibNative.onLogOut() → launches WelcomeActivity which shows
 *   the local native welcome HTML (android/app/src/main/assets/welcome/index.html).
 *   Zero flash — WelcomeActivity uses the same #f2f2f2 background.
 *
 * iOS (Capacitor WebView, no StorelibNative bridge):
 *   Navigates directly to /welcome — the bundled Next.js welcome page at
 *   capacitor://localhost/welcome. Skips "/" entirely so the marketing page
 *   never appears even for a frame.
 *
 * Web browser:
 *   Same /welcome redirect as iOS.
 */
export function nativeLogOut(): void {
  if (typeof window === "undefined") return
  // Clear cached home so the next login re-determines route from DB
  clearNativeHome()
  const br = (window as any).StorelibNative
  if (typeof br?.onLogOut === "function") {
    try { br.onLogOut() } catch { /* ignore */ }
  } else {
    window.location.replace("/welcome")
  }
}

// ── External link handling ──────────────────────────────────────────────────

/**
 * Open a URL in the system browser when running inside Capacitor, or in a
 * new tab when on the regular web.
 *
 * Inside the native app, routes like /explore, /store/*, /product/* should
 * open in the device's default browser rather than the in-app WebView so
 * the user gets the full browser experience (address bar, sharing, etc).
 *
 * The native shell interprets the `storelib://external?url=…` deep-link
 * and launches an Intent / SFSafariViewController accordingly.
 */
export function openExternal(url: string): void {
  if (typeof window === "undefined") return
  if (isNativeApp()) {
    window.location.href = "storelib://external?url=" + encodeURIComponent(url)
  } else {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
