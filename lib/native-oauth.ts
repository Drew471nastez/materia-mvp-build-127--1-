/**
 * lib/native-oauth.ts
 *
 * Singleton module — owns the entire Android / Capacitor Google OAuth flow.
 * Called once from app/NativeOAuthBridge.tsx (root layout).
 *
 * Flow:
 *  1. Login: signInWithOAuth({ skipBrowserRedirect:true,
 *              redirectTo:"storelib://auth/callback" })
 *     → PKCE code-verifier written to localStorage by supabase-js
 *  2. Browser.open(authUrl) → Chrome Custom Tab
 *  3. Google → storelib://auth/callback?code=…&state=…
 *  4. Android intent-filter → onNewIntent → Capacitor appUrlOpen event
 *  5. handleOAuthCallback(fullUrl)
 *       → exchangeCodeForSession(fullUrl)   ← FULL URL, not just code param
 *       → session stored in localStorage
 *       → window.location.assign("/app")
 *
 * Debug toasts: set NEXT_PUBLIC_OAUTH_DEBUG=true in .env.local
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
  return (
    url.startsWith("storelib://auth/callback") ||
    url.includes("/app/auth/callback")
  )
}

// ── Core handler (exported so it can be called manually for testing) ──────────
export async function handleOAuthCallback(rawUrl: string): Promise<void> {
  // ── LOG 1: received ──────────────────────────────────────────────────────
  console.log(`${TAG} ▶ appUrlOpen fired`)
  console.log(`${TAG}   raw URL : "${rawUrl}"`)
  console.log(`${TAG}   isOAuthCallback: ${isOAuthCallback(rawUrl)}`)
  showToast(`Got callback\n${rawUrl.slice(0, 120)}`, "info")

  if (!isOAuthCallback(rawUrl)) {
    console.log(`${TAG}   → Not an OAuth callback — ignoring.`)
    return
  }

  if (isHandling) {
    console.warn(`${TAG}   → Already handling a callback — duplicate ignored.`)
    return
  }
  isHandling = true

  try {
    // ── LOG 2: closing browser ─────────────────────────────────────────────
    console.log(`${TAG} Closing Chrome Custom Tab…`)
    try {
      const { Browser } = await import("@capacitor/browser")
      await Browser.close()
      console.log(`${TAG}   Browser.close() ✓`)
    } catch (e) {
      console.warn(`${TAG}   Browser.close() failed (already closed?):`, e)
    }

    // ── LOG 3: parse URL params ────────────────────────────────────────────
    const u = new URL(rawUrl)
    const code         = u.searchParams.get("code")
    const state        = u.searchParams.get("state")
    const oauthErr     = u.searchParams.get("error")
    const oauthErrDesc = u.searchParams.get("error_description")
    // StorelibApp path — tokens embedded by /auth/callback server route
    const embeddedToken   = u.searchParams.get("token")
    const embeddedRefresh = u.searchParams.get("refresh_token")
    const nextParam       = u.searchParams.get("next") || "/app"

    console.log(`${TAG} URL params:`)
    console.log(`${TAG}   token : ${embeddedToken  ? `"${embeddedToken.slice(0, 12)}…"` : "none"}`)
    console.log(`${TAG}   code  : ${code  ? `"${code.slice(0, 12)}…"` : "MISSING"}`)
    console.log(`${TAG}   state : ${state ? `"${state.slice(0, 12)}…"` : "MISSING"}`)
    console.log(`${TAG}   error : ${oauthErr ?? "none"}`)
    console.log(`${TAG}   next  : ${nextParam}`)

    if (oauthErr) {
      const desc = oauthErrDesc ?? (oauthErr === "access_denied" ? "Sign-in was cancelled." : oauthErr)
      console.error(`${TAG} OAuth provider returned error: "${desc}"`)
      showToast(`Error: ${desc}`, "err")
      window.location.assign(`/login?error=${encodeURIComponent(desc)}`)
      return
    }

    const supabase = createClient()

    // ── StorelibApp path: tokens are embedded in the deep-link URL ─────────
    // The server-side /auth/callback route detected our custom UA and
    // encoded the session tokens directly into the storelib:// URL.
    // We call setSession() to establish the session in this WebView context.
    if (embeddedToken && embeddedRefresh) {
      console.log(`${TAG} ── StorelibApp token path — calling setSession() ──────`)
      console.log(`${TAG}   access_token  : "${embeddedToken.slice(0, 16)}…"`)
      console.log(`${TAG}   refresh_token : "${embeddedRefresh.slice(0, 12)}…"`)

      const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
        access_token: embeddedToken,
        refresh_token: embeddedRefresh,
      })

      console.log(`${TAG} ── setSession returned ──────────────────────────────`)
      console.log(`${TAG}   error      : ${sessionErr ? sessionErr.message : "null"}`)
      console.log(`${TAG}   hasSession : ${!!sessionData?.session}`)
      console.log(`${TAG}   userId     : ${sessionData?.session?.user?.id ?? "null"}`)
      console.log(`${TAG}   email      : ${sessionData?.session?.user?.email ?? "null"}`)

      if (sessionErr || !sessionData?.session) {
        const msg = sessionErr?.message ?? "No session returned after setSession."
        console.error(`${TAG} setSession FAILED:`, sessionErr)
        showToast(`Error: ${msg}`, "err")
        window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
        return
      }

      const email = sessionData.session.user.email ?? sessionData.session.user.id
      console.log(`${TAG} ✓ Session confirmed for ${email} → navigating to ${nextParam}`)
      showToast(`Session OK  ${email}`, "ok")
      window.location.assign(nextParam)
      return
    }

    // ── PKCE path: exchange the auth code using the full URL ───────────────
    if (!code) {
      console.warn(`${TAG} No "code" or "token" param in URL — cannot proceed. Full URL was: "${rawUrl}"`)
      return
    }

    // IMPORTANT: we pass the FULL URL string, not just the code value.
    //
    // Why? The Supabase GoTrue /token?grant_type=pkce endpoint expects both
    // the authorization `code` AND the `state` parameter for PKCE validation.
    // Passing only `code` causes the exchange to fail on some project configs.
    // Official Supabase Capacitor guide: https://supabase.com/docs/guides/auth/
    //   native-mobile-login/oauth-login?platform=capacitor
    console.log(`${TAG} ── calling exchangeCodeForSession ──────────────────`)
    console.log(`${TAG}   argument type  : ${typeof rawUrl}`)
    console.log(`${TAG}   argument value : "${rawUrl}"`)
    console.log(`${TAG}   (this is the FULL URL, not just the code param)`)

    const { data, error: exchangeErr } =
      await supabase.auth.exchangeCodeForSession(rawUrl)

    // ── LOG 5: after exchangeCodeForSession ────────────────────────────────
    console.log(`${TAG} ── exchangeCodeForSession returned ──────────────────`)
    console.log(`${TAG}   error       : ${exchangeErr ? exchangeErr.message : "null"}`)
    console.log(`${TAG}   hasSession  : ${!!data?.session}`)
    console.log(`${TAG}   userId      : ${data?.session?.user?.id ?? "null"}`)
    console.log(`${TAG}   email       : ${data?.session?.user?.email ?? "null"}`)
    console.log(`${TAG}   accessToken : ${data?.session?.access_token ? data.session.access_token.slice(0, 16) + "…" : "null"}`)

    if (exchangeErr) {
      const msg = exchangeErr.message.includes("code verifier")
        ? "Session expired — please sign in again."
        : exchangeErr.message
      console.error(`${TAG} Exchange FAILED:`, exchangeErr)
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

    // ── LOG 6: success ─────────────────────────────────────────────────────
    const email = data.session.user.email ?? data.session.user.id
    console.log(`${TAG} ✓ Session confirmed for ${email} → navigating to /app`)
    showToast(`Session OK  ${email}`, "ok")
    window.location.assign("/app")

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error."
    console.error(`${TAG} Handler threw:`, err)
    showToast(`Error: ${msg}`, "err")
    window.location.assign(`/login?error=${encodeURIComponent(msg)}`)
  } finally {
    isHandling = false
  }
}

// ── Listener setup ────────────────────────────────────────────────────────────
/**
 * Call once at app boot (via NativeOAuthBridge in root layout).
 * Returns a cleanup function.  Idempotent — safe to call multiple times.
 */
export async function setupNativeOAuthListeners(): Promise<() => void> {
  // ── LOG A: entry ──────────────────────────────────────────────────────────
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

    // ── LOG B: registering appUrlOpen ────────────────────────────────────
    console.log(`${TAG} Registering App.addListener("appUrlOpen")…`)
    const appHandle = await App.addListener("appUrlOpen", ({ url }) => {
      console.log(`${TAG} ← appUrlOpen event received, url="${url}"`)
      handleOAuthCallback(url)
    })
    console.log(`${TAG}   appUrlOpen listener registered ✓`)

    // ── LOG C: registering onAuthStateChange ─────────────────────────────
    console.log(`${TAG} Registering supabase.auth.onAuthStateChange…`)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log(`${TAG} ← onAuthStateChange event="${event}"  hasSession=${!!session}  path="${window.location.pathname}"`)
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          const path = window.location.pathname
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
    console.log(`${TAG} All native OAuth listeners active. 🎯`)

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
