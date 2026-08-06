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

import { POST_LOGIN_HOME } from "@/lib/auth/post-login"
import { isAuthInProgress, setAuthInProgress } from "@/lib/auth/auth-in-progress"

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
    if (isAuthInProgress()) return
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

// Both delegate to lib/auth/auth-in-progress.ts, which is where the flag's
// expiry lives. See the note there: an abandoned OAuth round trip used to leave
// this set for the life of the web view, and every later visit to /login sat on
// a spinner for thirty seconds.
export function setNativeAuthInProgress(value: boolean): void {
  setAuthInProgress(value)
}

export function isNativeAuthInProgress(): boolean {
  return isAuthInProgress()
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
    // Mirror in localStorage so the synchronous module-level startup check
    // can read it without an async Preferences call on cold start.
    try { localStorage.setItem(NATIVE_HOME_KEY, destination) } catch { /* ignore */ }
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
    try { localStorage.removeItem(NATIVE_HOME_KEY) } catch { /* ignore */ }
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

// ── isNative / isIOS / isAndroid / OAuth helpers / nativeLogout ──────────────

/** True when running inside the Capacitor native wrapper. Cleaner alias for isNativeApp(). */
export function isNative(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as any).Capacitor
  return typeof cap?.isNativePlatform === "function" && cap.isNativePlatform() === true
}

/** True when running on iOS inside the Capacitor native wrapper. */
export function isIOS(): boolean {
  return isNative() && (window as any).Capacitor?.getPlatform?.() === "ios"
}

/** True when running on Android inside the Capacitor native wrapper. */
export function isAndroid(): boolean {
  return isNative() && (window as any).Capacitor?.getPlatform?.() === "android"
}

/**
 * Start native Google OAuth (PKCE + Browser.open).
 * The OS intercepts the redirect back via custom URL scheme.
 * NativeAuthHandler catches `appUrlOpen` and calls handleNativeOAuthCallback().
 */
export async function startNativeGoogleOAuth(
  supabaseClient: import("@supabase/supabase-js").SupabaseClient,
): Promise<void> {
  const { Capacitor } = await import("@capacitor/core")
  const callbackUrl =
    Capacitor.getPlatform() === "ios"
      ? "com.storelib.app://auth/callback"
      : "storelib://auth/callback"

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
      queryParams: { access_type: "offline", prompt: "consent" },
      skipBrowserRedirect: true,
    },
  })
  if (error || !data.url) throw error ?? new Error("OAuth init failed")

  const { Browser } = await import("@capacitor/browser")
  await Browser.open({ url: data.url, windowName: "_self" })
}

/**
 * Handle the deep-link URL from Capacitor's appUrlOpen event after OAuth.
 * Exchanges the PKCE code for a session, resolves the user's home route, and
 * returns { success, isCreator, nextPath }.
 */
export async function handleNativeOAuthCallback(
  url: string,
  supabaseClient: import("@supabase/supabase-js").SupabaseClient,
): Promise<{ success: boolean; isCreator: boolean; nextPath: string }> {
  try {
    try { const { Browser } = await import("@capacitor/browser"); await Browser.close() } catch { /* ignore */ }

    const parsed       = new URL(url)
    const code         = parsed.searchParams.get("code")
    // Supabase recovery emails use "token" as the key; normalise to "access_token"
    const accessToken  = parsed.searchParams.get("access_token") ?? parsed.searchParams.get("token")
    const refreshToken = parsed.searchParams.get("refresh_token")
    const nextParam    = parsed.searchParams.get("next") ?? ""

    // Recovery / password-reset flow: store the full URL for reset-password page to consume
    if (nextParam.includes("/reset-password") || parsed.hash.includes("type=recovery")) {
      try {
        // Normalise fragment tokens into search params for consistent parsing
        const normalized = url.includes("#") ? url.replace("#", "?").replace(/\?([^?]*)$/, "?$1") : url
        sessionStorage.setItem("nativeRecoveryUrl", normalized)
      } catch { /* ignore */ }
      return { success: true, isCreator: false, nextPath: "/reset-password" }
    }

    let userId: string

    if (accessToken && refreshToken) {
      const { data, error } = await supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      if (error || !data.session) throw error ?? new Error("setSession failed")
      userId = data.session.user.id
    } else if (code) {
      const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code)
      if (error || !data.session) throw error ?? new Error("Code exchange failed")
      userId = data.session.user.id
    } else {
      throw new Error("No auth code or tokens in URL")
    }

    const { data: creator } = await supabaseClient.from("creators")
      .select("onboarding_completed").eq("user_id", userId).maybeSingle()
    if (creator?.onboarding_completed) {
      await cacheNativeHome(POST_LOGIN_HOME)
      return { success: true, isCreator: true, nextPath: POST_LOGIN_HOME }
    }

    const { data: profile } = await supabaseClient.from("profiles")
      .select("is_creator, welcome_completed").eq("id", userId).maybeSingle()
    if (profile?.welcome_completed) {
      const dest = POST_LOGIN_HOME
      await cacheNativeHome(dest)
      return { success: true, isCreator: !!profile.is_creator, nextPath: dest }
    }
    return { success: true, isCreator: false, nextPath: "/welcome" }
  } catch (err) {
    console.error("[handleNativeOAuthCallback]", err)
    return { success: false, isCreator: false, nextPath: "/login?error=oauth_failed" }
  }
}

/**
 * Sign the user out and navigate home.
 * Native → /welcome, Web → router.replace("/login").
 */
export async function nativeLogout(
  supabaseClient: import("@supabase/supabase-js").SupabaseClient,
  router: { replace: (url: string) => void },
): Promise<void> {
  try { await supabaseClient.auth.signOut() } catch { /* ignore */ }
  try { localStorage.removeItem("sb-native-home") } catch { /* ignore */ }
  isNative() ? window.location.replace("/welcome") : router.replace("/login")
}

// ── Haptic feedback ──────────────────────────────────────────────────────────

/**
 * The haptics module, fetched once and kept.
 *
 * `await import(...)` inside the tap handler is what made the buzz land after
 * the thing it was supposed to accompany. The FIRST call on a cold app pays for
 * fetching, parsing and evaluating a chunk before it can ask the OS for
 * anything — tens of milliseconds on a phone — and even a warm one costs a
 * promise tick, so the feedback always arrived a beat behind the finger. On a
 * tab bar, where the haptic IS the acknowledgement, a beat behind is the
 * difference between the bar answering you and the bar confirming something you
 * had already noticed.
 *
 * So it is warmed on first use and held. The dynamic import is kept — it is
 * what keeps the plugin out of the web bundle, which is the whole reason it was
 * written this way — but it is paid once instead of on every press.
 */
let hapticsModule: Promise<typeof import("@capacitor/haptics")> | null = null

function loadHaptics(): Promise<typeof import("@capacitor/haptics")> {
  if (!hapticsModule) hapticsModule = import("@capacitor/haptics")
  return hapticsModule
}

/**
 * Fetch the haptics chunk before anything needs it.
 *
 * Called from the tab bar on mount, so by the time a finger lands on it the
 * module is resolved and `triggerHaptic` is a straight call into the OS.
 */
export function warmHaptics(): void {
  if (typeof window === "undefined") return
  if (!(window as any).Capacitor?.isNativePlatform?.()) return
  void loadHaptics().catch(() => {})
}

/**
 * Trigger a short haptic impact on iOS/Android via @capacitor/haptics.
 * No-op on web or SSR. Dynamically imported so it never bloats the web bundle.
 *
 * @param style - "light" | "medium" | "heavy" (default: "light")
 */
export async function triggerHaptic(style: "light" | "medium" | "heavy" = "light"): Promise<void> {
  if (typeof window === "undefined") return
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform?.()) return
  try {
    const { Haptics, ImpactStyle } = await loadHaptics()
    const styleMap = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
    // Not awaited. The OS call is a round trip through the bridge and nothing
    // here depends on its result; awaiting it only means the caller's own work
    // — the navigation, the send — waits behind a vibration.
    void Haptics.impact({ style: styleMap[style] })
  } catch { /* plugin unavailable or permission denied — silent no-op */ }
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
 * iOS:  Uses window.open("_system") to launch the URL in Safari.app — fully
 *       external to the app. This satisfies App Store Guideline 3.1.1 because
 *       no purchase flow is ever presented inside the app or any in-app browser
 *       (SFSafariViewController). Apple reviewers will see product pages open
 *       in the user's default Safari browser, completely outside the app.
 *
 * Android: Uses @capacitor/browser (Chrome Custom Tab) with a _system fallback.
 */
export function openExternal(url: string): void {
  if (typeof window === "undefined") return
  if (isNativeApp()) {
    if (isIOS()) {
      // On iOS, open in the actual Safari browser (fully external).
      // window.open("_system") in Capacitor's WKWebView delegates the URL to
      // iOS's openURL, which launches Safari.app — never SFSafariViewController.
      // This guarantees no checkout/payment UI ever appears inside the app,
      // satisfying App Store Guideline 3.1.1.
      try {
        const w = window.open(url, "_system")
        if (w) return
      } catch { /* ignore */ }
      // Fallback: deep-link scheme handled by the native layer
      window.location.href = "storelib://external?url=" + encodeURIComponent(url)
    } else {
      // Android: Chrome Custom Tab via @capacitor/browser, with _system fallback.
      import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url, toolbarColor: "#ffffff" }))
        .catch(() => {
          try {
            const w = window.open(url, "_system")
            if (!w) throw new Error("blocked")
          } catch {
            window.location.href = "storelib://external?url=" + encodeURIComponent(url)
          }
        })
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}
