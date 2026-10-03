"use client"

/**
 * /native-start — dedicated native app cold-start entry gate.
 *
 * The server renders this page instantly (no DB queries, no auth checks).
 * All the user sees is a neutral #f2f2f2 screen — never the public homepage.
 *
 * Client-side, we resolve session + role and redirect:
 *   - seller access (lib/account/seller-access.ts) → /app
 *   - any other signed in account                  → the community they used
 *     last, when they are an active member of one and communities are on
 *     (GET /api/native/start, asked on every cold start, never cached),
 *     otherwise /library
 *   - no valid session                             → /welcome
 *
 * Splash hide is NOT called here.  The destination page hides it.
 */

import { useEffect } from "react"
import { accessTokenOf, isCommunityStart, sanitizeNativeHome } from "@/lib/native-bridge"

/**
 * THE COMMUNITY TO OPEN ON, for somebody whose home is the library. Asked of
 * the server with the session's own token (the WebView's cookie may not be
 * fresh yet on a cold start), with a short limit so a slow network costs at
 * most a moment before the library opens as it always did. Sellers never
 * ask: their start is unchanged.
 */
async function communityStart(accessToken: string | null): Promise<string | null> {
  const ctl = new AbortController()
  const limit = setTimeout(() => ctl.abort(), 2500)
  try {
    const res = await fetch("/api/native/start", {
      cache: "no-store",
      credentials: "same-origin",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      signal: ctl.signal,
    })
    if (!res.ok) return null
    const to = ((await res.json()) as { to?: unknown } | null)?.to
    return isCommunityStart(to) ? to : null
  } catch {
    return null
  } finally {
    clearTimeout(limit)
  }
}

/** The library home (a buyer's), which a community may stand in for. */
function isLibraryHome(home: string): boolean {
  return sanitizeNativeHome(home).split(/[?#]/)[0] === "/library"
}

export default function NativeStartPage() {
  useEffect(() => {
    let didRedirect = false

    /**
     * The last line of defence against this screen redirecting to itself.
     *
     * Every destination below is checked, not just the cached one, because the
     * cache is only ONE of the ways "/" got in here. If a target is not a real
     * app destination and not one of the small set of screens this gate is
     * allowed to hand off to, it becomes /app.
     *
     * Redirecting to "/" from here is the specific catastrophe: "/" bounces
     * straight back to /native-start in the native app, so the two ping-pong at
     * a few requests per second and the launch screen never lifts.
     */
    const HANDOFF_OK = ["/welcome", "/login", "/signup", "/reset-password", "/auth/"]

    function safeRedirect(url: string) {
      if (didRedirect) return
      const isHandoff = HANDOFF_OK.some((h) => url === h || url.startsWith(h))
      const target = isHandoff || isCommunityStart(url) ? url : sanitizeNativeHome(url)
      if (target === "/native-start" || target.startsWith("/native-start")) return
      didRedirect = true
      window.location.replace(target)
    }

    async function resolve() {
      // ── PRIORITY: handle reset-password / recovery deep links first ───────
      // Must run BEFORE the synchronous localStorage fast-path to prevent
      // Layer 1 from navigating to /app before the deep link can be processed.
      try {
        /**
         * =====================================================================
         *  THE BRIDGE IS ALREADY HERE. DO NOT FETCH IT AGAIN.
         * =====================================================================
         * This was `await import("@capacitor/app")` on every single cold
         * start: a chunk fetched over the network before the synchronous
         * localStorage read below could run — and that read is what sends an
         * already-signed-in person straight to their home screen. So the
         * common launch, by far, paid for a module it did not need in order
         * to answer a question that was almost always "no deep link".
         *
         * Capacitor injects its bridge into the WebView BEFORE the page
         * loads, so the plugin is reachable as a global with nothing to
         * download. And in a browser there is no launch URL to find at all,
         * so the whole check is skipped rather than attempted and caught.
         *
         * The ORDERING is unchanged, which is the part that matters: a
         * recovery link is still resolved before the fast path can navigate
         * away from it. What changed is how long finding out takes.
         */
        const bridge = (window as unknown as {
          Capacitor?: {
            isNativePlatform?: () => boolean
            Plugins?: { App?: { getLaunchUrl?: () => Promise<{ url?: string } | null> } }
          }
        }).Capacitor

        /* A browser cannot have been launched from a URL. Nothing to ask. */
        if (!bridge?.isNativePlatform?.()) throw new Error("not native")

        const appPlugin = bridge.Plugins?.App
        const launch = appPlugin?.getLaunchUrl
          ? await appPlugin.getLaunchUrl()
          : await (await import("@capacitor/app")).App.getLaunchUrl()

        if (launch?.url) {
          const lu = launch.url
          const isBridgeReset =
            (lu.startsWith("storelib://reset-password") ||
              lu.startsWith("com.storelib.app://reset-password")) &&
            lu.includes("code=")
          const isRecovery =
            (lu.startsWith("storelib://auth/callback") ||
              lu.startsWith("com.storelib.app://auth/callback")) &&
            lu.includes("type=recovery") &&
            lu.includes("access_token=")
          if (isBridgeReset || isRecovery) {
            try { sessionStorage.setItem("nativeAuthInProgress", "1") } catch { /* ignore */ }
            if (isBridgeReset) {
              try {
                const launchParams = new URL(lu).searchParams
                const code = launchParams.get("code")
                if (code) {
                  /* Sell on Storelib and the return page ride along from the email's link (lib/auth/continue.ts). */
                  const { readCarry, withCarry } = await import("@/lib/auth/continue")
                  const { getMainDomain } = await import("@/lib/url-helpers")
                  safeRedirect(withCarry(`/reset-password?code=${encodeURIComponent(code)}`, readCarry(launchParams, getMainDomain())))
                  return
                }
              } catch { /* ignore */ }
            } else {
              try { sessionStorage.setItem("nativeRecoveryUrl", lu) } catch { /* ignore */ }
            }
            safeRedirect("/reset-password")
            return
          }
        }
      } catch { /* Capacitor not available */ }

      // ── Layer 1: synchronous localStorage fast-path ───────────────────────
      // Only redirect here if we have BOTH a valid session token AND a cached
      // destination.  If there is a session but no cached home (e.g. first
      // launch after login on a new device) fall through to Layer 2 for a
      // proper DB-backed role resolution so buyers are not sent to /app.
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (supabaseUrl) {
          const ref = new URL(supabaseUrl).hostname.split(".")[0]
          const sessionRaw = localStorage.getItem(`sb-${ref}-auth-token`)
          const cachedHome = localStorage.getItem("sb-native-home")
          if (sessionRaw && cachedHome) {
            /* A buyer's home: the community they used last opens instead, when there is one. */
            if (isLibraryHome(cachedHome)) {
              safeRedirect((await communityStart(accessTokenOf(sessionRaw))) || cachedHome)
              return
            }
            safeRedirect(cachedHome)
            return
          }
        }
      } catch { /* ignore */ }

      // ── Layer 2: Supabase SDK session + DB role resolution ────────────────
      try {
        const { createClient } = await import("@/lib/supabase/client")
        const { getCachedNativeHome, cacheNativeHome } = await import("@/lib/native-bridge")
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          // Use cached destination if available — avoids a DB round-trip.
          const cached = await getCachedNativeHome()
          if (cached) {
            safeRedirect((isLibraryHome(cached) && (await communityStart(session.access_token))) || cached)
            return
          }

          // No cache — query DB to determine creator vs buyer.
          /*
            SELLER ACCESS DECIDES THE HOME (lib/account/seller-access.ts): the
            dashboard for a seller, the library for everybody else. There is
            no creator or buyer question to send a new account to any more.
            The library rather than Discover because the offline shell in
            the installed apps (out/index.html) only knows the homes in
            NATIVE_HOME_ALLOWED, and anything else there becomes /app.
          */
          const { hasSellerAccess, readSellerAccess } = await import("@/lib/account/seller-access")
          const home = hasSellerAccess(await readSellerAccess(supabase, session.user.id)) ? "/app" : "/library"
          await cacheNativeHome(home)
          /* The library is cached as the home; the community they used last is asked for on each start. */
          safeRedirect((home === "/library" && (await communityStart(session.access_token))) || home)
          return
        }

        // ── Layer 3: raw Preferences (expired token / no network) ───────────
        // The SDK returned null but the raw token bytes may still be in
        // Preferences — the user IS logged in, just offline.
        const { Preferences } = await import("@capacitor/preferences")
        const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]
        const authKey = `sb-${projectRef}-auth-token`
        const { value: rawPrefs } = await Preferences.get({ key: authKey })
        let rawLocal: string | null = null
        try { rawLocal = localStorage.getItem(authKey) } catch { /* ignore */ }

        if (rawPrefs || rawLocal) {
          const cached = await getCachedNativeHome()
          safeRedirect(cached || "/app")
          return
        }
      } catch (err) {
        // Layer 2/3 failed — don't silently swallow. Try cached home or fall
        // through to /welcome below.
        console.warn("[native-start] session resolution error:", err)
        try {
          const cachedHome = localStorage.getItem("sb-native-home")
          if (cachedHome) {
            safeRedirect(cachedHome)
            return
          }
        } catch { /* ignore */ }
      }

      // ── No session — send to welcome screen ───────────────────────────────
      safeRedirect("/welcome")
    }

    // ── Timeout safety net ──────────────────────────────────────────────────
    // If resolve() hasn't redirected within 8 seconds (network hang, Supabase
    // unreachable, Preferences stuck, etc.), force a redirect so the user is
    // never stuck on the spinner indefinitely.
    const timeout = setTimeout(() => {
      if (didRedirect) return
      console.warn("[native-start] resolve() timed out after 8 s — forcing redirect")
      try {
        const cachedHome = localStorage.getItem("sb-native-home")
        if (cachedHome) {
          safeRedirect(cachedHome)
          return
        }
      } catch { /* ignore */ }
      safeRedirect("/welcome")
    }, 8000)

    resolve().finally(() => clearTimeout(timeout))

    return () => clearTimeout(timeout)
  }, [])

  return (
    <>
      <style>{`
        @keyframes ns-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .ns-spinner {
          width: 28px; height: 28px;
          border: 2.5px solid rgba(0,0,0,.08);
          border-top-color: rgba(0,0,0,.35);
          border-radius: 50%;
          animation: ns-spin 0.75s linear infinite;
          will-change: transform;
          transform-origin: 50% 50%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#f2f2f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: "72px",
        }}
      >
        <div className="ns-spinner" />
      </div>
    </>
  )
}
