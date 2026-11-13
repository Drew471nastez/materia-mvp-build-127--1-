"use client"

/**
 * /native-start: dedicated native app cold-start entry gate.
 *
 * The server renders this page instantly (no DB queries, no auth checks).
 * All the user sees is a neutral #f2f2f2 screen, never the public homepage.
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

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { sanitizeNativeHome } from "@/lib/native-bridge"
import { isResumablePlace, readLastPlace, startTarget } from "@/lib/native-resume"
import { landInPlace } from "@/lib/native-start-landing"
import { hasStoredSessionToken, storedSessionKey } from "@/lib/auth/session-read"
import { useExploreMarketplaceEnabled } from "@/components/platform/explore-marketplace-context"
import { releaseLaunchScreen } from "@/lib/native-chrome"
import { deviceOffline } from "@/lib/native-offline"
import { tt } from "@/lib/i18n/text"

/**
 * ROUND AU: A START THAT CANNOT LAND SAYS SO. The gate hands over to the page
 * and the launch screen stays up until that page draws. On a phone that was
 * offline by then, or whose page never answered, nothing drew: the launch
 * screen stayed up for good, or (the router falling back to a document load
 * that failed) Android's own "Webpage not available" page replaced the app
 * (scripts/check-app-network-au1.mjs). Now:
 *   offline   no hand over is tried; the launch screen comes down on "No
 *             internet connection" with Try again, and the start goes on by
 *             itself the moment the phone is back online
 *   failed    the router's fallback document load is held back and the
 *             page asked for once; unreachable, the same screen
 *   slow      past STALL_MS still on the gate, the launch screen comes down
 *             on "Still loading" with Try again; the page that is on its way
 *             still replaces it when it arrives
 */
const STALL_MS = 10_000
const REACH_MS = 6_000

/** Whether the page answers at all (any status: a redirect to sign in is an answer). */
async function reachable(target: string): Promise<boolean> {
  if (deviceOffline()) return false
  const stop = new AbortController()
  const timer = window.setTimeout(() => stop.abort(), REACH_MS)
  try {
    await fetch(target, { method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "manual", signal: stop.signal })
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

type Trouble = "offline" | "slow" | "unreachable" | null

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

/**
 * ONE START PER DOCUMENT. The start lands on its page in this same document
 * now (lib/native-start-landing.ts), so the document's navigation entry says
 * /native-start for as long as the app is open, and a later visit (the
 * header's logo sending "/" here) would read as a start too. The first
 * resolution uses it up.
 */
let startUsed = false

/**
 * ROUND AT: NOBODY SIGNED IN GOES STRAIGHT TO WELCOME. A phone holding no
 * session anywhere (not in localStorage, not in the session cookie, not in
 * Preferences, where the app keeps its backup) used to download the whole
 * Supabase client to be told "no session", then the Preferences plugin to be
 * told it again, before /welcome was even asked for: about a second and a
 * half of launch screen on a 4G phone (scripts/check-app-launch-at3.mjs).
 * The outcome is the same /welcome; only the evidence is read without a
 * download. Preferences is asked through the bridge the shell injects, as the
 * launch URL is above. "unknown" (no bridge, a plugin that did not answer)
 * never takes the shortcut: the full reads below decide, as before.
 */
async function preferencesHoldSession(): Promise<boolean | "unknown"> {
  const key = storedSessionKey()
  if (!key) return "unknown"
  const prefs = (window as unknown as {
    Capacitor?: { Plugins?: { Preferences?: { get?: (o: { key: string }) => Promise<{ value?: string | null } | null> } } }
  }).Capacitor?.Plugins?.Preferences
  if (!prefs?.get) return "unknown"
  try {
    const [whole, first] = await Promise.all([prefs.get({ key }), prefs.get({ key: `${key}.0` })])
    return Boolean(whole?.value || first?.value)
  } catch {
    return "unknown"
  }
}

export default function NativeStartPage() {
  const exploreOn = useExploreMarketplaceEnabled()
  const router = useRouter()
  /* One hand over per visit, even if the effect runs again (Discover's switch answering late): never two router.replace calls. */
  const landed = useRef(false)
  /*
    ROUND AT: NO SPINNER UNDER THE LAUNCH SCREEN. On a start the launch screen
    stays up until the page this sends to has drawn (iOS: SplashScreen.hide,
    Android: StorelibNative.appReady, neither called here), so a spinner here
    was a second loader, and on Android, where the overlay used to drop on
    this screen, it was seen. A visit ("/" from inside the app) has no launch
    screen over it, so it keeps the late spinner.
  */
  const [visit, setVisit] = useState(false)
  /* Round AU: what stopped the start, if anything, and where it was going. */
  const [trouble, setTrouble] = useState<Trouble>(null)
  const goingTo = useRef<string | null>(null)
  const stall = useRef<number | undefined>(undefined)

  /** Hand over to `target` in this document, and watch that it arrives. */
  const handOver = useCallback(
    (target: string) => {
      goingTo.current = target
      window.clearTimeout(stall.current)
      if (deviceOffline()) {
        setTrouble("offline")
        releaseLaunchScreen()
        return
      }
      setTrouble(null)
      landInPlace(target, router)
      stall.current = window.setTimeout(() => {
        if (window.location.pathname !== "/native-start") return
        setTrouble(deviceOffline() ? "offline" : "slow")
        releaseLaunchScreen()
      }, STALL_MS)
    },
    [router],
  )

  /* Back online with a start waiting: it goes on by itself. Unmounted (the page arrived): nothing left to watch. */
  useEffect(() => {
    const online = () => {
      if (trouble === "offline" && goingTo.current) handOver(goingTo.current)
    }
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [trouble, handOver])
  useEffect(() => () => window.clearTimeout(stall.current), [])

  /*
    THE ROUTER'S FALLBACK IS ASKED FIRST. When the page's payload cannot be
    fetched, the router loads the address as a document instead, and when
    that fails too Android's web view draws its own error page in place of
    the app. While the gate is up, that document load waits until the page
    has answered once; it goes ahead only if it did. In Android's web view and
    iOS 26 (the Navigation API); elsewhere WKWebView keeps the gate on screen
    and the stall above ends it.
  */
  useEffect(() => {
    const nav = (window as unknown as { navigation?: EventTarget }).navigation
    if (!nav?.addEventListener) return
    let allowed: string | null = null
    const onNavigate = (event: Event) => {
      const e = event as Event & { cancelable?: boolean; hashChange?: boolean; destination?: { sameDocument?: boolean; url?: string } }
      const target = goingTo.current
      if (!target || !e.cancelable || e.hashChange || e.destination?.sameDocument) return
      const url = e.destination?.url ?? ""
      if (url === allowed) return
      let path = ""
      try {
        const u = new URL(url)
        if (u.origin !== window.location.origin) return
        path = u.pathname + u.search
      } catch {
        return
      }
      if (path !== target) return
      e.preventDefault()
      void reachable(target).then((ok) => {
        if (window.location.pathname !== "/native-start") return
        if (ok) {
          allowed = url
          window.location.replace(url)
          return
        }
        window.clearTimeout(stall.current)
        setTrouble(deviceOffline() ? "offline" : "unreachable")
        releaseLaunchScreen()
      })
    }
    nav.addEventListener("navigate", onNavigate)
    return () => nav.removeEventListener("navigate", onNavigate)
  }, [])

  useEffect(() => {
    /* Where a signed in start goes for this home: the kept page, else the home's own default. */
    const isStart = !startUsed && documentOpenedHere()
    const kept = isStart && !startedJustNow()
    startUsed = true
    if (!isStart) setVisit(true)
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
      if (landed.current) return
      /* A tap on a push already chose the page (lib/push/client.ts): that navigation stands. */
      if ((window as unknown as { __storelibPushTap?: string }).__storelibPushTap) return
      const isHandoff = HANDOFF_OK.some((h) => url === h || url.startsWith(h))
      const target = isHandoff || isResumablePlace(url) ? url : sanitizeNativeHome(url)
      if (target === "/native-start" || target.startsWith("/native-start")) return
      landed.current = true
      /* In this document, not a second one: see lib/native-start-landing.ts. Watched, and held while offline (handOver). */
      handOver(target)
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
         * localStorage read below could run, and that read is what sends an
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

      // ── Layer 1b: nothing stored anywhere, so nobody is signed in ─────────
      // See preferencesHoldSession above: the same /welcome the layers below
      // end on, without downloading them first.
      try {
        if (!hasStoredSessionToken() && (await preferencesHoldSession()) === false) {
          safeRedirect("/welcome")
          return
        }
      } catch { /* the full reads below decide */ }

      // ── Layer 2: Supabase SDK session + DB role resolution ────────────────
      try {
        const { createClient } = await import("@/lib/supabase/client")
        const { getCachedNativeHome, cacheNativeHome } = await import("@/lib/native-bridge")
        const supabase = createClient()

        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
          // Use cached destination if available: avoids a DB round-trip.
          const cached = await getCachedNativeHome()
          if (cached) {
            safeRedirect(go(cached))
            return
          }

          // No cache: query DB to determine creator vs buyer.
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
        // Preferences: the user IS logged in, just offline.
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
        // Layer 2/3 failed: don't silently swallow. Try cached home or fall
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

      // ── No session: send to welcome screen ───────────────────────────────
      safeRedirect("/welcome")
    }

    // ── Timeout safety net ──────────────────────────────────────────────────
    // If resolve() hasn't redirected within 8 seconds (network hang, Supabase
    // unreachable, Preferences stuck, etc.), force a redirect so the user is
    // never stuck on the spinner indefinitely.
    const timeout = setTimeout(() => {
      if (landed.current) return
      console.warn("[native-start] resolve() timed out after 8 s: forcing redirect")
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
  }, [exploreOn, router, handOver])

  return (
    <>
      <style>{`
        @keyframes ns-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        /* A start that lands quickly never shows a spinner at all: it only
           fades in once the start has taken longer than a launch should. */
        @keyframes ns-show {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .ns-spinner {
          width: 28px; height: 28px;
          border: 2.5px solid rgba(0,0,0,.08);
          border-top-color: rgba(0,0,0,.35);
          border-radius: 50%;
          animation: ns-spin 0.75s linear infinite, ns-show 160ms ease-out 700ms both;
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
        {trouble ? (
          <div data-native-start-trouble={trouble} role="alert" style={{ width: "100%", maxWidth: 360, padding: "0 24px", textAlign: "center", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700, color: "#1a1a2e" }}>
              {trouble === "offline" ? tt("No internet connection") : trouble === "unreachable" ? tt("Cannot reach Storelib") : tt("Still loading")}
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: "#6b7280" }}>
              {trouble === "offline" ? tt("Storelib opens as soon as your phone is back online.") : trouble === "unreachable" ? tt("Check your connection and try again.") : tt("The connection is slow right now.")}
            </p>
            <button
              type="button"
              onClick={() => {
                /* The launch screen is down by now: the spinner says it is trying. */
                setVisit(true)
                if (goingTo.current) handOver(goingTo.current)
              }}
              style={{ marginTop: 20, height: 44, width: "100%", border: 0, borderRadius: 999, background: "#1a1a2e", color: "#ffffff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              {tt("Try again")}
            </button>
          </div>
        ) : visit ? (
          <div className="ns-spinner" data-native-start-spinner="" />
        ) : null}
      </div>
    </>
  )
}
