"use client"

/**
 * /native-start — dedicated native app cold-start entry gate.
 *
 * The server renders this page instantly (no DB queries, no auth checks).
 * All the user sees is a neutral #f2f2f2 screen — never the public homepage.
 *
 * Client-side, we resolve session + role and redirect:
 *   - signed in: the page they were on when they last used the app, when it
 *     is one that is safe to open cold (lib/native-resume.ts: Discover, a
 *     community, the library, the account, a creator's page or product, the
 *     dashboard; never checkout, a receipt or sign in), kept on every
 *     navigation inside the app (components/platform/native-place-keeper.tsx)
 *   - signed in with nothing kept: seller access (lib/account/seller-access.ts)
 *     → /app, anybody else → /explore (the library when Discover is off)
 *   - no valid session → /welcome
 *
 * This replaces "open the community they used last": somebody who was last
 * in a community reopens there, because that is the page that was kept.
 *
 * Splash hide is NOT called here.  The destination page hides it.
 */

import { useEffect } from "react"
import { sanitizeNativeHome } from "@/lib/native-bridge"
import { isResumablePlace, readLastPlace, startTarget } from "@/lib/native-resume"
import { useExploreMarketplaceEnabled } from "@/components/platform/explore-marketplace-context"

/**
 * A START THAT COMES BACK HERE IS NOT TRIED TWICE. A kept page that answers
 * by sending the app to "/" (a page that has since closed, Discover switched
 * off) lands back on /native-start, which would pick the same page again.
 * The second start within a few seconds skips the kept page and goes to the
 * home, which always resolves.
 */
const RETRY_KEY = "native-start-at"
const RETRY_MS = 8000

/* Asked once per load of this page, so an effect that runs twice (React's development checks) does not read its own mark. */
let startedAgain: boolean | null = null
function startedJustNow(): boolean {
  if (startedAgain !== null) return startedAgain
  try {
    const at = Number(sessionStorage.getItem(RETRY_KEY) || 0)
    sessionStorage.setItem(RETRY_KEY, String(Date.now()))
    startedAgain = Date.now() - at < RETRY_MS
  } catch {
    startedAgain = false
  }
  return startedAgain
}

/**
 * ONLY A START OPENS THE KEPT PAGE. This screen is also where "/" lands from
 * inside the app (the header's logo, a Storelib link to the home page), and
 * there the person means home, not the page they are already on, which is
 * the page that was just kept. A start is a document that opened at
 * /native-start: the app's launch, or the proxy sending a fresh load of "/"
 * here. A client navigation to it is a visit.
 */
function documentOpenedHere(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    if (nav?.name) return new URL(nav.name).pathname === "/native-start"
  } catch {
    /* No timing to read: taken as a start, which is what this screen mostly is. */
  }
  return true
}

export default function NativeStartPage() {
  const exploreOn = useExploreMarketplaceEnabled()
  useEffect(() => {
    let didRedirect = false
    /* Where a signed in start goes for this home: the kept page, else the home's own default. */
    const kept = documentOpenedHere() && !startedJustNow()
    const go = (home: string | null | undefined) => startTarget({ last: kept ? readLastPlace() : null, home, exploreOn })

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
      /* A tap on a push already chose the page (lib/push/client.ts): that navigation stands. */
      if ((window as unknown as { __storelibPushTap?: string }).__storelibPushTap) return
      const isHandoff = HANDOFF_OK.some((h) => url === h || url.startsWith(h))
      const target = isHandoff || isResumablePlace(url) ? url : sanitizeNativeHome(url)
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
            safeRedirect(go(cachedHome))
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
            safeRedirect(go(cached))
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
          /* The library stays the cached home (the offline shell knows it); the start itself is Discover, or the kept page. */
          safeRedirect(go(home))
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
          safeRedirect(cached ? go(cached) : "/app")
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
  }, [exploreOn])

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
