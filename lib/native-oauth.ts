/**
 * lib/native-oauth.ts
 *
 * Singleton module that owns the entire Android/Capacitor OAuth callback flow.
 * Import setupNativeOAuthListeners() once at app boot (see CapacitorAuthHandler).
 *
 * Flow:
 *  1. Login page calls signInWithOAuth({ skipBrowserRedirect:true,
 *       redirectTo:"storelib://auth/callback" })          → PKCE verifier stored in localStorage
 *  2. Browser.open(url)                                   → Chrome Custom Tab opens
 *  3. User signs in → Google redirects to storelib://auth/callback?code=…&state=…
 *  4. Android intent-filter intercepts → onNewIntent → Capacitor fires appUrlOpen
 *  5. handleOAuthCallback(fullUrl)                        → exchangeCodeForSession(fullUrl)
 *     NOTE: pass the FULL URL string, not just the code param. The GoTrue server
 *     validates both code + state for PKCE; passing only the code loses the state.
 *  6. Session stored in localStorage → window.location.assign("/app")
 *  7. /app server-side page routes to /library or /onboarding as needed
 *
 * Debug toasts:
 *  Set NEXT_PUBLIC_OAUTH_DEBUG=true in .env.local to see on-screen toasts.
 *  They auto-dismiss after 6 s and are only shown on native platform.
 */

import { createClient } from "@/lib/supabase/client"

const TAG = "[NativeOAuth]"

// ── Debug flag ──────────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_OAUTH_DEBUG=true in .env.local / Vercel env to enable toasts.
const DEBUG =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_OAUTH_DEBUG === "true"

// ── Singleton guards ────────────────────────────────────────────────────────
let isHandling = false     // prevent concurrent duplicate callbacks
let isSetUp = false        // prevent registering listeners more than once

// ── Debug toast (DOM-injected, no React required) ───────────────────────────
let toastRoot: HTMLDivElement | null = null

function showToast(msg: string, variant: "info" | "ok" | "err") {
  if (!DEBUG || typeof document === "undefined") return

  if (!toastRoot) {
    toastRoot = document.createElement("div")
    toastRoot.setAttribute("id", "oauth-debug-toasts")
    Object.assign(toastRoot.style, {
      position: "fixed",
      top: "env(safe-area-inset-top, 60px)",
      left: "12px",
      right: "12px",
      zIndex: "999999",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      pointerEvents: "none",
      paddingTop: "60px",
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

// ── URL helpers ─────────────────────────────────────────────────────────────
function isOAuthCallback(url: string): boolean {
  return (
    url.startsWith("storelib://auth/callback") ||
    url.includes("/app/auth/callback")
  )
}

// ── Core callback handler (exported for testing / manual invocation) ─────────
export async function handleOAuthCallback(url: string): Promise<void> {
  console.log(`${TAG} appUrlOpen →`, url)
  showToast(`Got callback\n${url.slice(0, 100)}`, "info")

  if (!isOAuthCallback(url)) {
    console.log(`${TAG} Not an OAuth callback — ignoring.`)
    return
  }

  if (isHandling) {
    console.warn(`${TAG} Already handling a callback — duplicate ignored.`)
    return
  }
  isHandling = true

  try {
    // ── 1. Close the Chrome Custom Tab ──────────────────────────────────────
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.close()
      console.log(`${TAG} Browser.close() done.`)
    } catch (e) {
      // Custom Tab may have already closed (e.g. user swiped it away)
      console.warn(`${TAG} Browser.close() skipped:`, e)
    }

    // ── 2. Parse OAuth error params ─────────────────────────────────────────
    const u = new URL(url)
    const oauthErr = u.searchParams.get("error")
    if (oauthErr) {
      const desc =
        u.searchParams.get("error_description") ??
        (oauthErr === "access_denied" ? "Sign-in was cancelled." : oauthErr)
      console.error(`${TAG} Provider returned error: ${desc}`)
      showToast(`Error: ${desc}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    // ── 3. Confirm code is present (guard only — full URL is passed below) ──
    const code = u.searchParams.get("code")
    console.log(`${TAG} code param: ${code ? "present" : "MISSING"}`)
    if (!code) {
      console.warn(`${TAG} No code in URL — ignoring.`)
      return
    }

    // ── 4. Exchange PKCE code for session ────────────────────────────────────
    // IMPORTANT: pass the FULL URL string.
    // The GoTrue /token?grant_type=pkce endpoint validates both the code AND
    // the state param for PKCE. Passing only `code` loses the state, causing
    // the exchange to fail on some Supabase project configurations.
    // Reference: https://supabase.com/docs/guides/auth/native-mobile-login/oauth-login?platform=capacitor
    const supabase = createClient()
    console.log(`${TAG} Calling exchangeCodeForSession(fullUrl)…`)

    const { data, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(url)

    console.log(`${TAG} exchangeCodeForSession →`, {
      hasSession: !!data?.session,
      userId: data?.session?.user?.id ?? null,
      email: data?.session?.user?.email ?? null,
      error: exchangeErr?.message ?? null,
    })

    // ── 5. Handle exchange failure ───────────────────────────────────────────
    if (exchangeErr) {
      const msg = exchangeErr.message.includes("code verifier")
        ? "Session expired — please sign in again."
        : exchangeErr.message
      console.error(`${TAG} Exchange failed:`, exchangeErr)
      showToast(`Error: ${msg}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
      return
    }

    if (!data?.session) {
      const msg = "No session returned after code exchange."
      console.error(`${TAG} ${msg}`)
      showToast(`Error: ${msg}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
      return
    }

    // ── 6. Success → navigate ────────────────────────────────────────────────
    const email = data.session.user.email ?? data.session.user.id
    showToast(`Session OK  ${email}`, "ok")
    console.log(`${TAG} ✓ Session confirmed for ${email} — navigating to /app`)
    window.location.assign("/app")
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error during sign-in."
    console.error(`${TAG} Handler threw:`, err)
    showToast(`Error: ${msg}`, "err")
    window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
  } finally {
    isHandling = false
  }
}

// ── Listener setup (call once at app boot) ───────────────────────────────────
/**
 * Registers two listeners on native platforms:
 *   1. App.addListener("appUrlOpen") — primary OAuth callback path
 *   2. supabase.auth.onAuthStateChange — fallback: if the session lands while
 *      the user is still on /login or /signup, navigate immediately.
 *
 * Returns a cleanup function — call it when the root component unmounts
 * (which in practice never happens for the root layout).
 *
 * The function is idempotent: calling it a second time is a no-op.
 */
export async function setupNativeOAuthListeners(): Promise<() => void> {
  if (isSetUp) {
    console.log(`${TAG} Listeners already set up — skipping.`)
    return () => {}
  }

  if (typeof window === "undefined") return () => {}

  try {
    const { Capacitor } = await import("@capacitor/core")
    if (!Capacitor.isNativePlatform()) {
      console.log(`${TAG} Not on a native platform — no listeners needed.`)
      return () => {}
    }

    console.log(`${TAG} Native platform confirmed — registering listeners.`)
    isSetUp = true

    const { App } = await import("@capacitor/app")
    const supabase = createClient()

    // Listener 1: appUrlOpen (primary path)
    const appHandle = await App.addListener("appUrlOpen", ({ url }) => {
      handleOAuthCallback(url)
    })
    console.log(`${TAG} appUrlOpen listener registered.`)

    // Listener 2: onAuthStateChange (safety net)
    // If the session is established via any code path while the user is still
    // on /login or /signup, force navigation to /app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          const path = window.location.pathname
          if (path === "/login" || path === "/signup") {
            console.log(
              `${TAG} onAuthStateChange(${event}) on ${path} — navigating to /app`
            )
            showToast(`Session via authStateChange  ${session.user.email ?? ""}`, "ok")
            window.location.assign("/app")
          }
        }
      }
    )
    console.log(`${TAG} onAuthStateChange listener registered.`)

    return () => {
      appHandle.remove()
      subscription.unsubscribe()
      isSetUp = false
      console.log(`${TAG} Listeners removed.`)
    }
  } catch (err) {
    isSetUp = false
    console.warn(`${TAG} Setup failed (plugin missing or non-native?):`, err)
    return () => {}
  }
}
