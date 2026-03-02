/**
 * lib/native-oauth.ts
 *
 * Singleton module — owns the entire Android / Capacitor Google OAuth flow.
 * Called once from app/NativeOAuthBridge.tsx (root layout).
 *
 * Flow (client-side PKCE — no server bridge needed):
 *  1. Login page: signInWithOAuth({ skipBrowserRedirect:true,
 *              redirectTo:"storelib://auth/callback" })
 *     → PKCE code-verifier written to Capacitor Preferences (SharedPreferences)
 *  2. Browser.open(authUrl) → Chrome Custom Tab
 *  3. User completes Google OAuth
 *  4. Supabase redirects → storelib://auth/callback?code=…
 *  5. Android intent-filter → onNewIntent → Capacitor appUrlOpen event
 *  6. handleOAuthCallback(fullUrl):
 *       → Browser.close()           ← dismiss Chrome Custom Tab
 *       → exchangeCodeForSession(code) ← bare code string + stored PKCE verifier
 *       → getSession()              ← verify session exists
 *       → window.location.assign("/app")
 *
 * Session storage: Capacitor Preferences (Android SharedPreferences).
 * This survives across Chrome Custom Tab ↔ WebView process switches
 * and across app restarts.
 *
 * Debug toasts: set NEXT_PUBLIC_OAUTH_DEBUG=true in .env.local
 *
 * IMPORTANT — Supabase dashboard config:
 *   Auth → URL Configuration → Redirect URLs must include:
 *     storelib://auth/callback
 */

import { createClient } from "@/lib/supabase/client"

const TAG = "[NativeOAuth]"
const DEBUG =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_OAUTH_DEBUG === "true"

// ── Module-level guards (survive React re-renders / Strict Mode double-mount) ─
let isHandling = false  // prevent concurrent duplicate callbacks
let isSetUp    = false  // prevent registering listeners more than once

// ── Debug toast (DOM-injected, zero React deps) ──────────────────────────────
let toastRoot: HTMLDivElement | null = null

function showToast(msg: string, variant: "info" | "ok" | "err") {
  if (!DEBUG || typeof document === "undefined") return
  if (!toastRoot) {
    toastRoot = document.createElement("div")
    toastRoot.id = "oauth-debug-toasts"
    Object.assign(toastRoot.style, {
      position: "fixed",
      top: "0",
      left: "12px",
      right: "12px",
      paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)",
      zIndex: "999999",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      pointerEvents: "none",
    })
    document.body.appendChild(toastRoot)
  }
  const bg = { info: "#1d4ed8", ok: "#15803d", err: "#b91c1c" }[variant]
  const icon = { info: "📡", ok: "✅", err: "❌" }[variant]
  const el = document.createElement("div")
  Object.assign(el.style, {
    background: bg,
    color: "#fff",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    fontFamily: "monospace",
    lineHeight: "1.4",
    boxShadow: "0 3px 10px rgba(0,0,0,.4)",
    wordBreak: "break-all",
    opacity: "1",
    transition: "opacity .4s ease",
  })
  el.textContent = `${icon} ${msg}`
  toastRoot.appendChild(el)
  setTimeout(() => {
    el.style.opacity = "0"
    setTimeout(() => el.remove(), 450)
  }, 6000)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isOAuthCallback(url: string): boolean {
  return url.startsWith("storelib://auth/callback")
}

/**
 * Detect if a URL is an HTTPS reset-password App Link / Universal Link.
 * These arrive when the OS intercepts the Supabase redirect:
 *   https://storelib.com/reset-password#access_token=...&type=recovery
 */
function isHttpsResetPasswordUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === "https:" &&
      (u.hostname === "storelib.com" || u.hostname === "www.storelib.com") &&
      u.pathname.startsWith("/reset-password")
    )
  } catch {
    return false
  }
}

/**
 * Tell the native Android shell that auth exchange is starting so it
 * can show (or keep showing) its loading overlay.  No-ops gracefully
 * if authStart is not defined on the native side.
 */
function notifyNativeAuthStart(): void {
  try {
    const w = window as any
    if (typeof window !== "undefined" && w.StorelibNative?.authStart) {
      w.StorelibNative.authStart()
    }
  } catch {
    // Ignore — web environment or missing native interface
  }
}

/**
 * Previously dismissed the native loading overlay by calling authDone().
 * That call was premature: it fired in the `finally` block right after
 * window.location.assign(), i.e. BEFORE the destination page loaded,
 * causing the overlay to fade out while the WebView was still in
 * transition — producing a brief flash of the login/signup page.
 *
 * The overlay is now dismissed exclusively by StorelibNative.appReady(),
 * which is called from:
 *   • NativeOAuthBridge (per-route effect) — for all pages once React renders
 *   • NativeAuthGate — for /app and /library once auth state resolves
 *
 * This function is kept as a no-op so callers (reset-password page, etc.)
 * continue to compile without changes.
 */
export function notifyNativeAuthDone(): void {
  // No-op: overlay dismissal is handled by appReady() on the destination page.
}

// ── Recovery deep link handler ────────────────────────────────────────────────
/**
 * Detect if a deep link URL is a password recovery callback.
 * Recovery URLs have type=recovery + access_token + refresh_token (no code).
 */
function isRecoveryCallback(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.searchParams.get("type") === "recovery" &&
      !!u.searchParams.get("access_token") &&
      !!u.searchParams.get("refresh_token")
    )
  } catch {
    return false
  }
}

/**
 * Handle a recovery deep link inside the native app.
 * Stores the recovery URL in sessionStorage so the /reset-password page
 * can pick it up, then navigates to that page.
 */
async function handleRecoveryCallback(rawUrl: string): Promise<void> {
  console.log(`${TAG} ▶ Recovery deep link detected`)
  console.log(`${TAG}   raw URL : "${rawUrl.slice(0, 120)}"`)
  showToast(`Recovery deep link\n${rawUrl.slice(0, 120)}`, "info")

  notifyNativeAuthStart()

  try { sessionStorage.setItem("nativeAuthInProgress", "1") } catch {}
  try { sessionStorage.setItem("nativeRecoveryUrl", rawUrl) } catch {}

  // Navigate to /reset-password — the page reads tokens from sessionStorage
  console.log(`${TAG}   Navigating to /reset-password for recovery flow`)
  showToast("Opening password reset…", "info")
  window.location.assign("/reset-password")
}

/**
 * Handle an HTTPS reset-password App Link / Universal Link.
 *
 * When the user taps the recovery email link:
 *   1. Browser opens Supabase verification URL
 *   2. Supabase verifies → 302 redirect to https://storelib.com/reset-password#access_token=...
 *   3. OS intercepts the redirect (App Link / Universal Link) → opens the app
 *   4. Capacitor fires appUrlOpen with the HTTPS URL
 *
 * We extract tokens from the hash fragment, store them in sessionStorage,
 * and navigate to /reset-password so the page can read them.
 */
async function handleHttpsResetPasswordLink(rawUrl: string): Promise<void> {
  console.log(`${TAG} ▶ HTTPS reset-password App Link detected`)
  console.log(`${TAG}   raw URL : "${rawUrl.slice(0, 150)}"`)
  showToast(`HTTPS reset link\n${rawUrl.slice(0, 120)}`, "info")

  notifyNativeAuthStart()
  try { sessionStorage.setItem("nativeAuthInProgress", "1") } catch {}

  // Extract tokens from hash fragment (#access_token=...&refresh_token=...&type=recovery)
  const hashIndex = rawUrl.indexOf("#")
  if (hashIndex !== -1) {
    const hashStr = rawUrl.substring(hashIndex + 1)
    const hashParams = new URLSearchParams(hashStr)
    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")
    const type = hashParams.get("type") || "recovery"

    if (accessToken && refreshToken) {
      // Build a recovery URL for sessionStorage (same format the page expects)
      const recoveryUrl = `storelib://auth/callback?type=${encodeURIComponent(type)}&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
      try { sessionStorage.setItem("nativeRecoveryUrl", recoveryUrl) } catch {}
      console.log(`${TAG}   Tokens extracted from hash, stored in sessionStorage`)
      showToast("Recovery tokens stored", "ok")
    } else {
      console.warn(`${TAG}   Hash fragment present but missing access_token/refresh_token`)
    }
  } else {
    console.warn(`${TAG}   No hash fragment in URL — tokens may have been stripped by the OS`)
  }

  // Always navigate to /reset-password.
  // If tokens were found → page reads from sessionStorage → shows form.
  // If tokens were NOT found → page shows "expired" with resend option.
  if (window.location.pathname === "/reset-password") {
    // Already on the reset page (e.g. Android loadInWebView already navigated here).
    // Dispatch a custom event so the page can re-check sessionStorage.
    console.log(`${TAG}   Already on /reset-password — dispatching nativeRecoveryTokensReady event`)
    window.dispatchEvent(new CustomEvent("nativeRecoveryTokensReady"))
  } else {
    console.log(`${TAG}   Navigating to /reset-password`)
    window.location.assign("/reset-password")
  }
}

// ── Core handler (exported so it can be called manually for testing) ──────────
export async function handleOAuthCallback(rawUrl: string): Promise<void> {
  // ── LOG 1: appUrlOpen fired ────────────────────────────────────────────────
  console.log(`${TAG} ▶ appUrlOpen fired`)
  console.log(`${TAG}   raw URL : "${rawUrl}"`)
  console.log(`${TAG}   isOAuthCallback: ${isOAuthCallback(rawUrl)}`)
  showToast(`appUrlOpen fired\n${rawUrl.slice(0, 120)}`, "info")

  if (!isOAuthCallback(rawUrl)) {
    console.log(`${TAG}   → Not an OAuth callback — ignoring.`)
    return
  }

  // ── Check for recovery deep link (type=recovery with tokens, no code) ──────
  if (isRecoveryCallback(rawUrl)) {
    await handleRecoveryCallback(rawUrl)
    return
  }

  // Notify native immediately — show/keep loading overlay before any async work
  notifyNativeAuthStart()

  if (isHandling) {
    console.warn(`${TAG}   → Already handling a callback — duplicate ignored.`)
    return
  }
  isHandling = true
  try { sessionStorage.setItem('nativeAuthInProgress', '1') } catch {}

  try {
    // ── LOG 2: close browser ─────────────────────────────────────────────────
    console.log(`${TAG} Closing Chrome Custom Tab…`)
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.close()
      console.log(`${TAG}   Browser.close() ✓`)
    } catch (e) {
      console.warn(`${TAG}   Browser.close() failed (already closed?):`, e)
    }

    // ── LOG 3: parse URL for diagnostics ─────────────────────────────────────
    const u = new URL(rawUrl)
    const code     = u.searchParams.get("code")
    const oauthErr = u.searchParams.get("error")
    const oauthErrDesc = u.searchParams.get("error_description")

    console.log(`${TAG} URL params:`)
    console.log(`${TAG}   code  : ${code ? `"${code.slice(0, 12)}…"` : "MISSING"}`)
    console.log(`${TAG}   error : ${oauthErr ?? "none"}`)

    // ── Handle OAuth errors (user cancelled, etc.) ───────────────────────────
    if (oauthErr) {
      const desc = oauthErrDesc ?? (oauthErr === "access_denied" ? "Sign-in was cancelled." : oauthErr)
      console.error(`${TAG} OAuth provider returned error: "${desc}"`)
      showToast(`Error: ${desc}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    if (!code) {
      const msg = "No authorization code in callback URL."
      console.error(`${TAG} ${msg} Full URL: "${rawUrl}"`)
      showToast(`Error: ${msg}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
      return
    }

    // ── LOG 4: exchange code for session (client-side PKCE) ──────────────────
    // The PKCE code-verifier was stored in Capacitor Preferences by
    // signInWithOAuth() on the login page.  exchangeCodeForSession() reads
    // it from the same Preferences storage and sends both code + verifier
    // to Supabase's token endpoint.
    //
    // IMPORTANT: Pass ONLY the bare authorization code, NOT the full URL.
    // Passing the full deep-link URL causes supabase-js to misparse it
    // (custom scheme URLs like storelib:// aren't valid HTTP URLs) and
    // lose the PKCE flow state → "invalid flow state" error.
    console.log(`${TAG} ── exchanging code for session (PKCE) ──────────────────`)
    console.log(`${TAG}   passing bare code to exchangeCodeForSession()`)
    showToast("Exchanging code…", "info")

    const supabase = createClient()
    const { data, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(code)

    // ── LOG 5: exchange result ───────────────────────────────────────────────
    console.log(`${TAG} ── exchangeCodeForSession returned ──────────────────────`)
    console.log(`${TAG}   error      : ${exchangeErr ? exchangeErr.message : "null"}`)
    console.log(`${TAG}   hasSession : ${!!data?.session}`)
    console.log(`${TAG}   userId     : ${data?.session?.user?.id ?? "null"}`)
    console.log(`${TAG}   email      : ${data?.session?.user?.email ?? "null"}`)

    if (exchangeErr) {
      console.error(`${TAG} Exchange FAILED:`, exchangeErr)
      showToast(`Exchange error: ${exchangeErr.message}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(exchangeErr.message)}`)
      return
    }

    if (!data?.session) {
      const msg = "No session returned after code exchange."
      console.error(`${TAG} ${msg}`)
      showToast(`Error: ${msg}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
      return
    }

    // ── LOG 6: verify session persisted ──────────────────────────────────────
    const { data: { session: verifiedSession } } = await supabase.auth.getSession()
    const email = verifiedSession?.user?.email ?? data.session.user.email ?? data.session.user.id
    console.log(`${TAG} ── getSession() verification ──────────────────────────`)
    console.log(`${TAG}   session exists : ${!!verifiedSession}`)
    console.log(`${TAG}   user email     : ${email}`)
    showToast(`Session verified: ${email}`, "ok")

    if (!verifiedSession) {
      const msg = "Session was not persisted. Please try again."
      console.error(`${TAG} ${msg}`)
      showToast(`Error: ${msg}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
      return
    }

    // ── LOG 7: success — determine destination and navigate ───────────────────
    console.log(`${TAG} ✓ Session confirmed for ${email} — determining destination…`)
    showToast(`Session OK — ${email}`, "ok")

    // Close Chrome Custom Tab again (belt-and-suspenders — some Android
    // versions keep it visible even after the deep link fires).
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.close()
      console.log(`${TAG}   Browser.close() after session ✓`)
    } catch (e) {
      console.warn(`${TAG}   Browser.close() after session failed:`, e)
    }

    // Determine destination.
    // Only route to /app or /library if the user has completed onboarding.
    // New / unboarded users MUST go to /signup/success (role chooser) so
    // they can pick creator vs buyer.  Without this check, new Google-OAuth
    // signups were sent directly to /library, skipping the role chooser.
    const userId = verifiedSession.user.id
    let nextPath = "/signup/success"
    try {
      const { data: creatorRow } = await supabase
        .from("creators")
        .select("id, onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle()
      if (creatorRow?.onboarding_completed) {
        // Fully onboarded creator → /app
        nextPath = "/app"
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_creator, welcome_completed")
          .eq("id", userId)
          .maybeSingle()
        if (profile?.welcome_completed) {
          // Returning user who already chose a role
          nextPath = profile.is_creator ? "/app" : "/library"
        }
        // else: new user or welcome not completed → /signup/success (default)
      }
    } catch (e) {
      console.warn(`${TAG}   User type check failed, defaulting to /signup/success:`, e)
    }
    console.log(`${TAG}   destination: ${nextPath}`)

    // The native Capacitor client stores the session in Capacitor Preferences
    // (Android SharedPreferences), but Next.js server components read cookies.
    // Route through /auth/sync-session which calls setSession() server-side,
    // writing Set-Cookie headers so the WebView's cookie jar is populated.
    // Without this the app layout's auth check finds no cookies → redirect loop.
    const { access_token, refresh_token } = data.session
    const syncUrl =
      `/auth/sync-session` +
      `?access_token=${encodeURIComponent(access_token)}` +
      `&refresh_token=${encodeURIComponent(refresh_token)}` +
      `&next=${encodeURIComponent(nextPath)}`
    console.log(`${TAG}   Navigating to sync-session route to establish cookies → ${nextPath}`)

    window.location.assign(syncUrl)

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error."
    console.error(`${TAG} Handler threw:`, err)
    showToast(`Error: ${msg}`, "err")
    window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
  } finally {
    isHandling = false
    try { sessionStorage.removeItem('nativeAuthInProgress') } catch {}
    // Always dismiss native loading overlay — covers success, catch,
    // AND all early-return error paths inside try (OAuth error, no code,
    // exchange failure, session not persisted).
    notifyNativeAuthDone()
  }
}

// ── Listener setup ────────────────────────────────────────────────────────────
/**
 * Call once at app boot (via NativeOAuthBridge in root layout).
 * Returns a cleanup function.  Idempotent — safe to call multiple times.
 */
export async function setupNativeOAuthListeners(): Promise<() => void> {
  console.log(`${TAG} setupNativeOAuthListeners() called  (isSetUp=${isSetUp})`)

  if (isSetUp) {
    console.log(`${TAG}   Already set up — skipping duplicate registration.`)
    return () => {}
  }
  if (typeof window === "undefined") {
    console.log(`${TAG}   SSR context — skipping.`)
    return () => {}
  }

  try {
    const { Capacitor } = await import("@capacitor/core")
    const native = Capacitor.isNativePlatform()
    console.log(`${TAG}   Capacitor.isNativePlatform() = ${native}`)

    if (!native) {
      console.log(`${TAG}   Not a native platform — no listeners needed.`)
      return () => {}
    }

    isSetUp = true
    const { App } = await import("@capacitor/app")
    const supabase = createClient()

    // ── Register appUrlOpen listener ────────────────────────────────────
    // Handles BOTH custom-scheme callbacks (storelib://auth/callback)
    // AND HTTPS App Links / Universal Links (https://storelib.com/reset-password#...)
    console.log(`${TAG} Registering App.addListener("appUrlOpen")…`)
    const appHandle = await App.addListener("appUrlOpen", ({ url }) => {
      console.log(`${TAG} ← appUrlOpen event received, url="${url}"`)

      // HTTPS reset-password links from App Link / Universal Link
      if (isHttpsResetPasswordUrl(url)) {
        handleHttpsResetPasswordLink(url)
        return
      }

      // Custom scheme callbacks (OAuth + recovery deep links)
      handleOAuthCallback(url)
    })
    console.log(`${TAG}   appUrlOpen listener registered ✓`)

    // ── Cold-start: check if the app was launched via a deep link ─────
    // On cold-start, appUrlOpen may fire before the listener is registered.
    // App.getLaunchUrl() returns the URL that launched the app so we can
    // process it now.
    try {
      const launchResult = await App.getLaunchUrl()
      if (launchResult?.url) {
        console.log(`${TAG}   Launch URL detected: "${launchResult.url.slice(0, 120)}"`)
        if (isHttpsResetPasswordUrl(launchResult.url)) {
          console.log(`${TAG}   Cold-start: processing HTTPS reset-password launch URL`)
          handleHttpsResetPasswordLink(launchResult.url)
        } else if (isOAuthCallback(launchResult.url) && isRecoveryCallback(launchResult.url)) {
          console.log(`${TAG}   Cold-start: processing recovery launch URL`)
          handleRecoveryCallback(launchResult.url)
        }
      }
    } catch (e) {
      console.warn(`${TAG}   getLaunchUrl() failed:`, e)
    }

    // ── Register onAuthStateChange listener ─────────────────────────────
    console.log(`${TAG} Registering supabase.auth.onAuthStateChange…`)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(`${TAG} ← onAuthStateChange event="${event}"  hasSession=${!!session}  path="${window.location.pathname}"`)
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          // CRITICAL: if handleOAuthCallback is in progress, do NOT navigate.
          // The callback handler owns the full flow (exchange → sync-session
          // → /app).  Navigating here would race it, skip cookie sync, and
          // cause "Auth session missing!" on the server side.
          // Check both module-level flag and sessionStorage (belt-and-suspenders).
          let nativeAuthFlag = false
          try { nativeAuthFlag = sessionStorage.getItem("nativeAuthInProgress") === "1" } catch {}
          if (isHandling || nativeAuthFlag) {
            console.log(`${TAG}   OAuth callback in progress (isHandling=${isHandling}, flag=${nativeAuthFlag}) — skipping authStateChange navigation.`)
            return
          }
          const path = window.location.pathname
          // Don't redirect away from /reset-password — the recovery
          // flow sets a session but the user must stay on the form.
          if (path === "/reset-password") {
            console.log(`${TAG}   On /reset-password — suppressing SIGNED_IN redirect (recovery flow).`)
            return
          }
          if (path === "/login" || path === "/signup") {
            console.log(`${TAG}   SIGNED_IN on ${path} — forcing navigation to /app`)
            showToast(`Session via authStateChange  ${session.user.email ?? ""}`, "ok")
            window.location.assign("/app")
          } else {
            console.log(`${TAG}   SIGNED_IN but path is "${path}" — no redirect needed.`)
          }
        }
      }
    )
    console.log(`${TAG}   onAuthStateChange listener registered ✓`)
    console.log(`${TAG} All native OAuth listeners active.`)

    return () => {
      appHandle.remove()
      subscription.unsubscribe()
      isSetUp = false
      console.log(`${TAG} Listeners removed (cleanup).`)
    }
  } catch (err) {
    isSetUp = false
    console.warn(`${TAG} Setup failed — plugin missing or non-Capacitor env:`, err)
    return () => {}
  }
}
