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

import { GOOGLE_OAUTH_QUERY } from "@/lib/auth/google-oauth-params"
import { needsDocumentLoad, nativeLinkFor } from "@/lib/native-links"
import { forgetLastPlace } from "@/lib/native-resume"

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

/**
 * True in an app build that opens Stripe's own windows (its sign in, a
 * bank's login) inside the app rather than in Safari or Chrome
 * (ios/App/App/AppDelegate.swift StorelibPopups, android StorelibChromeClient).
 * Such a build says so in its user agent (capacitor.config.ts appendUserAgent).
 */
export function appHoldsStripeWindows(): boolean {
  if (typeof navigator === "undefined") return false
  return /StorelibWindows\//.test(navigator.userAgent || "")
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
/**
 * ===========================================================================
 *  A HOME THE APP CAN ACTUALLY GO TO
 * ===========================================================================
 *
 * `cacheNativeHome` is called with a `next` path in two places (the login page
 * and the OAuth callback) and that path is whatever the URL happened to carry --
 * very often "/". Storing "/" as the native app's home is how the app came to
 * open on the marketing site instead of the dashboard.
 *
 * It got worse than wrong. Once the app also redirects "/" back to
 * /native-start, a cached home of "/" is an INFINITE LOOP: /native-start reads
 * the cache, goes to "/", which bounces to /native-start, forever, and the app
 * sits on the launch screen at a few requests per second.
 *
 * So a home is only ever one of the app's real destinations. Anything else --
 * "/", a marketing route, an off-site URL, a protocol-relative "//evil.com" --
 * collapses to /app rather than being stored. This is the one place that
 * decides, so the login page and the OAuth callback cannot disagree with
 * /native-start about what a valid home is.
 */
/* "/library" is the buyer's home the installed apps' offline shell knows (out/index.html), and it answers with /account/library (app/library/[[...path]]); the new address is allowed too. */
const NATIVE_HOME_ALLOWED = ["/app", "/library", "/account/library", "/dashboard", "/creator-page", "/store-builder"]

export function sanitizeNativeHome(destination: string | null | undefined): string {
  if (!destination) return "/app"
  // Must be a same-origin absolute path. "//host" is protocol-relative and
  // leaves the app entirely, so a leading "/" alone is not enough.
  if (!destination.startsWith("/") || destination.startsWith("//")) return "/app"
  const path = destination.split(/[?#]/)[0]
  const ok = NATIVE_HOME_ALLOWED.some((a) => path === a || path.startsWith(`${a}/`))
  return ok ? destination : "/app"
}

/**
 * A COMMUNITY TO OPEN ON, NOT A HOME TO KEEP. Somebody without seller access
 * who is in a community opens the app on the one they used last
 * (/api/native/start). That answer changes from one launch to the next, so
 * it is never cached as the home (and the installed apps' offline shell
 * would not know it): /native-start asks for it on each cold start and
 * passes it through this check alone. Only a plain /community/<slug>.
 */
export function isCommunityStart(path: unknown): path is string {
  return typeof path === "string" && /^\/community\/[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(path)
}

/** The access token inside the stored session (plain JSON, or the "base64-" form the cookie storage writes), or null. */
export function accessTokenOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    let text = raw
    if (text.startsWith("base64-")) {
      const b64 = text.slice(7).replace(/-/g, "+").replace(/_/g, "/")
      text = new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)))
    }
    const v = JSON.parse(text) as { access_token?: unknown } | null
    return typeof v?.access_token === "string" && v.access_token.length < 4096 ? v.access_token : null
  } catch {
    return null
  }
}

export async function cacheNativeHome(rawDestination: string): Promise<void> {
  if (typeof window === "undefined") return
  const destination = sanitizeNativeHome(rawDestination)
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
    // Sanitised on the way OUT as well as in: a device that cached "/" under an
    // older build still has it in Preferences, and that value must not be able
    // to loop the app on first launch after the update.
    return value ? sanitizeNativeHome(value) : null
  } catch { return null }
}

/**
 * Remove the cached home route from Capacitor Preferences.
 * Called on logout so the next login re-determines the route from the DB.
 */
async function clearNativeHome(): Promise<void> {
  if (typeof window === "undefined") return
  /* And the place the app reopens on (lib/native-resume.ts): it was this account's. */
  forgetLastPlace()
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
      queryParams: GOOGLE_OAUTH_QUERY,
      skipBrowserRedirect: true,
    },
  })
  if (error || !data.url) throw error ?? new Error("OAuth init failed")

  const { Browser } = await import("@capacitor/browser")
  /*
   * The sheet, not a full screen takeover: Google's page slides over Storelib
   * the way Stripe's agreement does, and closes back to where the person was.
   * "_self" on iOS filled the screen and read as leaving the app.
   */
  await Browser.open({ url: data.url, windowName: "_self", presentationStyle: "popover", toolbarColor: "#ffffff" })
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
      await cacheNativeHome("/app")
      return { success: true, isCreator: true, nextPath: "/app" }
    }

    const { data: profile } = await supabaseClient.from("profiles")
      .select("is_creator, welcome_completed").eq("id", userId).maybeSingle()
    if (profile?.welcome_completed) {
      const dest = profile.is_creator ? "/app" : "/library"
      await cacheNativeHome(dest)
      return { success: true, isCreator: !!profile.is_creator, nextPath: dest }
    }
    return { success: true, isCreator: false, nextPath: "/welcome" }
  } catch (err) {
    console.error("[handleNativeOAuthCallback]", err)
    return { success: false, isCreator: false, nextPath: "/login?authError=exchange_failed" }
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
  try { await supabaseClient.auth.signOut({ scope: "local" }) } catch { /* ignore */ }
  try { localStorage.removeItem("sb-native-home") } catch { /* ignore */ }
  forgetLastPlace()
  isNative() ? window.location.replace("/welcome") : router.replace("/login")
}

// ── Haptic feedback ──────────────────────────────────────────────────────────

/**
 * Trigger a short haptic impact on iOS/Android via @capacitor/haptics.
 * No-op on web or SSR. Dynamically imported so it never bloats the web bundle.
 *
 * @param style - "light" | "medium" | "heavy" (default: "light")
 */
/** An iPhone, iPod or iPad (which says Macintosh, with touch points) in a browser. */
function appleTouchBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)
}

export async function triggerHaptic(style: "soft" | "light" | "medium" | "heavy" = "light"): Promise<boolean> {
  if (typeof window === "undefined") return false
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform?.()) return false
  /*
    THE PLUGIN IS ALREADY ON THE BRIDGE. Capacitor injects every installed
    plugin as window.Capacitor.Plugins before the page loads, so the tick is
    called there and lands on the frame it was asked for (a pull to refresh
    crossing its line). The import below is only for a shell that does not
    expose it there: it costs a chunk the first time, which is a tick that
    lands late.
  */
  const onBridge = cap.Plugins?.Haptics
  if (onBridge?.impact && onBridge?.selectionChanged) {
    try {
      if (style === "soft") await onBridge.selectionChanged()
      else await onBridge.impact({ style: style === "light" ? "LIGHT" : style === "medium" ? "MEDIUM" : "HEAVY" })
      return true
    } catch {
      return false
    }
  }
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
    /**
     * "soft" IS NOT AN IMPACT AT ALL.
     *
     * The three impact styles are knocks, and Light is the quietest knock
     * there is. Below it iOS has a different generator entirely, the one
     * behind a picker wheel and a segmented control: selection feedback. It
     * is the softest thing the Taptic Engine makes, and it is what a row of
     * tabs is, so it is the right shape as well as the quiet one.
     */
    if (style === "soft") {
      await Haptics.selectionChanged()
      return true
    }
    const styleMap = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
    await Haptics.impact({ style: styleMap[style] })
    return true
  } catch {
    /**
     * IT RETURNS WHETHER IT WORKED, and that is not pedantry.
     *
     * `@capacitor/haptics` is an npm dependency whose NATIVE half has to be
     * installed in each app project, and in this repository it is not: the
     * iOS Podfile lists Capacitor, Cordova, PushNotifications and Camera, and
     * android/capacitor.settings.gradle lists capacitor-android, app and
     * browser. No haptics in either.
     *
     * So this import resolves, the call is made, the bridge answers "plugin
     * not implemented", and the catch swallowed it — silently, for every
     * haptic in the app, on both platforms. Saying so lets the caller fall
     * back to the web API, which Android WebView does support.
     */
    return false
  }
}

/**
 * ===========================================================================
 *  TAP FEEDBACK, ON EVERY PLATFORM — USE THIS, NOT navigator.vibrate
 * ===========================================================================
 *
 * `navigator.vibrate()` IS NOT IMPLEMENTED ON iOS. Not in Safari, and not in
 * the WKWebView that Capacitor runs the app inside. It is not deprecated and it
 * does not throw — the property simply is not there, so the usual
 * `"vibrate" in navigator` guard reads false and the call is skipped in
 * silence. The result is feedback that works on Android, does nothing at all on
 * an iPhone, and reports no error anywhere.
 *
 * That is exactly how it came to be wrong in three separate places: the
 * dashboard chart, the analytics chart and the OnePage link reorder each wrote
 * the same reasonable-looking guarded call, and each was dead on the platform
 * the app mostly ships to.
 *
 * So there is one function now. Inside the native app it goes through the
 * Capacitor Haptics plugin, which is the only thing that reaches the iOS Taptic
 * Engine; on the web it falls back to navigator.vibrate for the browsers that
 * do support it. tests/page-performance.test.ts fails the build if a raw
 * navigator.vibrate call appears anywhere outside this file.
 */
export function hapticTap(strength: "soft" | "light" | "medium" = "light"): void {
  const web = () => {
    /* NEVER ON AN iPHONE'S OR iPAD'S BROWSER: Safari has no vibration for a
       page today, and one that grew the API should not start buzzing for a
       tick that was written for the Taptic Engine. */
    if (appleTouchBrowser()) return
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      /* Android has no selection generator, so soft is simply a shorter buzz
         than light — which is all `vibrate` can express. */
      navigator.vibrate(strength === "soft" ? 6 : strength === "light" ? 10 : 15)
    }
  }

  if (!isNativeApp()) {
    web()
    return
  }

  /**
   * NATIVE FIRST, THEN THE WEB API IF THE PLUGIN IS NOT THERE.
   *
   * This used to `return` unconditionally once it knew it was inside the app,
   * on the reasonable assumption that the Capacitor plugin would handle it.
   * The plugin is not built into either app project (see triggerHaptic), so
   * that branch has been doing nothing at all since it was written — inside
   * the Android app, where `navigator.vibrate` works perfectly well, as much
   * as inside the iOS one, where nothing does.
   *
   * Falling through costs one rejected promise and makes Android work either
   * way. The pod IS in ios/App/Podfile now, so an iPhone running a build made
   * since then goes through the Taptic Engine; one running an older binary
   * falls through to a web vibration API that does not exist on iOS, in
   * Safari or in WKWebView, and stays silent. Nothing here can tell the two
   * apart, and nothing here needs to.
   */
  void triggerHaptic(strength).then((ok) => {
    if (!ok) web()
  })
}

// ── External link handling ──────────────────────────────────────────────────

/**
 * ===========================================================================
 *  A STORELIB ADDRESS NAVIGATES THE APP; ONLY SOMEBODY ELSE'S SITE LEAVES IT
 * ===========================================================================
 * Inside the native app, `href` is followed in the app's own WebView when it
 * is one of Storelib's addresses (lib/native-links.ts): storelib.com,
 * www.storelib.com, storelib.me and a creator's <name>.storelib.com. A path
 * goes through the router when one is given and the page shares the layout,
 * else as a document load. Returns false, having done nothing, for anything
 * else, which is the caller's to open.
 *
 * Off the app it does nothing and returns false: the web's own link
 * behaviour is already right there.
 */
export function navigateInApp(href: string, router?: { push: (href: string) => void } | null): boolean {
  if (typeof window === "undefined" || !isNativeApp()) return false
  const link = nativeLinkFor(href)
  if (link.kind === "path") {
    if (router && !needsDocumentLoad(link.path)) router.push(link.path)
    else window.location.assign(link.path)
    return true
  }
  if (link.kind === "host") {
    window.location.assign(link.url)
    return true
  }
  return false
}

/**
 * The address to hand `location.replace` or `location.assign` for this href:
 * inside the app a Storelib address becomes its storelib.com path, so a full
 * page navigation (a checkout going back to the product, or on to a
 * creator's website after paying) stays in the WebView. Anything else, and
 * everything off the app, comes back as it was.
 */
export function inAppHref(href: string): string {
  if (typeof window === "undefined" || !isNativeApp()) return href
  const link = nativeLinkFor(href)
  return link.kind === "path" ? link.path : href
}

/**
 * Open a URL that is not Storelib's in the system browser when running inside
 * Capacitor, or in a new tab on the regular web.
 *
 * A STORELIB ADDRESS NEVER LEAVES THE APP. This used to send every URL it
 * was given to Safari, on purpose: /explore, a creator's page and a product
 * all opened outside the app so that nothing for sale was ever shown in it.
 * The owner asked for the opposite ("/explore, product pages, creator pages,
 * the buyer side and checkout must stay inside the app"), so a Storelib
 * address now navigates the app's WebView (navigateInApp above) and only
 * somebody else's site, a creator's own links or Stripe's billing page, goes
 * to the browser.
 *
 * iOS:  window.open("_system") hands the URL to iOS's openURL, which opens
 *       Safari.app.
 *
 * Android: Uses @capacitor/browser (Chrome Custom Tab) with a _system fallback.
 */
export function openExternal(url: string): void {
  if (typeof window === "undefined") return
  if (isNativeApp()) {
    /* From the creator's own tools, a Storelib page is their live site being checked: the real browser (openInBrowser). */
    if (onCreatorTools()) return openInBrowser(url)
    if (navigateInApp(url)) return
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

/**
 * ===========================================================================
 *  A CREATOR LOOKING AT THEIR OWN LIVE PAGE: THE REAL BROWSER
 * ===========================================================================
 * The owner: "in the website builder, View live or Preview, and creator pages
 * and stores, should open in the browser, not inside the app". A buyer's
 * Storelib address still navigates the app (navigateInApp); this is only for
 * the creator side checking what the world sees, so it skips that and goes
 * to Safari (iOS) or Chrome (Android). On the web, a new tab.
 */
/** The creator's own tools: the dashboard, the website builder, the store builder, the creator page editor. */
export function onCreatorTools(): boolean {
  if (typeof window === "undefined") return false
  const path = window.location.pathname
  return ["/app", "/website-builder", "/store-builder", "/dashboard", "/creator-page", "/onepage-preview"].some((p) => path === p || path.startsWith(`${p}/`))
}

export function openInBrowser(url: string): void {
  if (typeof window === "undefined") return
  if (!isNativeApp()) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  /* Let this window through the link guard (components/platform/native-link-guard.tsx). */
  ;(window as unknown as { __storelibBrowser?: string }).__storelibBrowser = url
  if (isIOS()) {
    try {
      if (window.open(url, "_system")) return
    } catch { /* fall through */ }
    window.location.href = "storelib://external?url=" + encodeURIComponent(url)
    return
  }
  import("@capacitor/browser")
    .then(({ Browser }) => Browser.open({ url, toolbarColor: "#ffffff" }))
    .catch(() => {
      try {
        if (!window.open(url, "_system")) throw new Error("blocked")
      } catch {
        window.location.href = "storelib://external?url=" + encodeURIComponent(url)
      }
    })
}

/**
 * A page to read without leaving the app: Terms, Stripe's account agreement.
 * In the phone app it opens in the in-app browser sheet (SFSafariViewController
 * on iOS, a Custom Tab on Android), which slides over the app and closes back
 * to exactly where the person was. Never for a purchase (that is openExternal).
 * On the web, a new tab.
 */
export function openInApp(url: string): void {
  if (typeof window === "undefined") return
  if (isNativeApp()) {
    /* Opened over the app on purpose: the link guard (components/platform/native-link-guard.tsx) lets this one window through. */
    ;(window as unknown as { __storelibSheet?: string }).__storelibSheet = url
    import("@capacitor/browser")
      .then(({ Browser }) => Browser.open({ url, presentationStyle: "popover", toolbarColor: "#ffffff" }))
      .catch(() => window.open(url, "_blank", "noopener"))
    return
  }
  window.open(url, "_blank", "noopener")
}
