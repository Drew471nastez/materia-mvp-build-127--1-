"use client"

/**
 * components/native-startup-router.tsx
 *
 * Native Capacitor (iOS + Android) startup router.
 *
 * On every cold start Capacitor loads index.html → "/" (the marketing page).
 * This module intercepts that, hides the document immediately, determines
 * whether the user is authenticated, and navigates to the correct screen
 * before anything is painted.
 *
 * SESSION DETECTION — defence-in-depth, three layers:
 *
 *   Layer 0 (synchronous, module-level)
 *     Runs before React even mounts. Checks localStorage synchronously for
 *     a Supabase session token. If found, navigates immediately — the React
 *     tree never hydrates for this page load. Handles users whose session
 *     was stored by an older app version that used localStorage directly.
 *
 *   Layer 1 (async, INITIAL_SESSION event + getSession fallback)
 *     supabase.auth.onAuthStateChange fires "INITIAL_SESSION" once the SDK
 *     has finished reading from Capacitor Preferences and (if the network is
 *     available) refreshing an expired access token. Runs in parallel with
 *     a direct getSession() call so whichever resolves first wins.
 *     Timeout: 3 s to avoid blocking on a slow device / no network.
 *
 *   Layer 2 (raw storage check)
 *     INITIAL_SESSION returned null. This happens when the access token is
 *     expired AND the network wasn't ready yet (iOS cold-start race). The
 *     session DATA is still in Preferences — the user IS logged in. We read
 *     the raw auth key from both Preferences and localStorage. If either has
 *     data, the user is authenticated and we route to the cached home screen.
 *
 *   Layer 3
 *     Nothing found anywhere → /welcome (genuinely logged-out user).
 *
 * CATCH BLOCK
 *     Any unexpected error goes here. We try one final synchronous
 *     localStorage read before giving up and sending to /welcome, so a
 *     transient error never logs out an authenticated user.
 */

// ── Layer 0: synchronous fast path ────────────────────────────────────────────
// Executed at bundle-evaluation time, before React hydrates the DOM.
// Using localStorage (synchronous) because Capacitor Preferences is async.
if (typeof window !== "undefined") {
  try {
    const isNative =
      typeof (window as any).Capacitor?.isNativePlatform === "function" &&
      (window as any).Capacitor.isNativePlatform() === true

    if (isNative && window.location.pathname === "/") {
      // Hide immediately so the marketing page is never painted.
      document.documentElement.style.visibility = "hidden"

      // Check localStorage for a Supabase auth session synchronously.
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (supabaseUrl) {
          const ref = new URL(supabaseUrl).hostname.split(".")[0]
          const sessionRaw = localStorage.getItem(`sb-${ref}-auth-token`)
          if (sessionRaw) {
            // Session found — navigate immediately using cached home route.
            // cacheNativeHome() always mirrors the value to localStorage,
            // so this read is instant without any async Preferences call.
            const cachedHome = localStorage.getItem("sb-native-home")
            window.location.replace(cachedHome || "/app")
            // Navigation has started; React mounting is irrelevant.
          }
        }
      } catch {
        // localStorage unavailable or URL parsing failed — async path will handle it.
      }
    }
  } catch {
    // Non-Capacitor environment — ignore entirely.
  }
}

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { cacheNativeHome, getCachedNativeHome } from "@/lib/native-bridge"

export function NativeStartupRouter() {
  const pathname = usePathname()

  useEffect(() => {
    // Only intercept the cold-start root path.
    if (pathname !== "/") return

    async function route() {
      const { Capacitor } = await import("@capacitor/core")

      if (!Capacitor.isNativePlatform()) {
        document.documentElement.style.visibility = ""
        return
      }

      // Derive the Supabase auth storage key.
      let authKey: string | null = null
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (url) authKey = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
      } catch { /* leave authKey null */ }

      // ── Layer 1: INITIAL_SESSION event + getSession() ──────────────────────
      // Run both in parallel; whichever resolves with a session first wins.
      // INITIAL_SESSION is the most authoritative — it fires after the SDK has
      // fully initialised and attempted a token refresh.
      // getSession() is a fallback for SDK versions < 2.60 that don't emit
      // INITIAL_SESSION, and for cases where the SDK was already initialised
      // before this effect runs (in which case INITIAL_SESSION may not re-fire
      // for a new listener).
      const supabase = createClient()
      let subRef: { unsubscribe: () => void } | null = null

      const sessionFromSDK = await new Promise<import("@supabase/supabase-js").Session | null>((resolve) => {
        let settled = false
        const finish = (s: import("@supabase/supabase-js").Session | null) => {
          if (settled) return
          settled = true
          subRef?.unsubscribe()
          resolve(s)
        }

        // A) INITIAL_SESSION event
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "INITIAL_SESSION") finish(session)
        })
        subRef = subscription

        // B) getSession() — also satisfies the promise if it has a session
        supabase.auth.getSession()
          .then(({ data }) => { if (data.session) finish(data.session) })
          .catch(() => { /* ignore — Layer 2 will handle */ })

        // C) Timeout — after 3 s assume no live session, fall through to Layer 2
        setTimeout(() => finish(null), 3000)
      })

      if (sessionFromSDK) {
        // Valid live session — route to cached home or resolve from DB.
        const cached = await getCachedNativeHome()
        if (cached) {
          document.documentElement.style.visibility = ""
          window.location.replace(cached)
          return
        }
        const dest = await resolveAndCacheHome(supabase, sessionFromSDK.user.id)
        document.documentElement.style.visibility = ""
        window.location.replace(dest)
        return
      }

      // ── Layer 2: raw storage check ─────────────────────────────────────────
      // SDK returned null — the token is expired and the network wasn't ready
      // yet (iOS cold-start race). Check both Preferences and localStorage for
      // raw session data. If present the user IS authenticated.
      let hasStoredSession = false

      if (authKey) {
        // Check Capacitor Preferences (where the current app stores sessions).
        try {
          const { Preferences } = await import("@capacitor/preferences")
          const { value } = await Preferences.get({ key: authKey })
          if (value !== null) hasStoredSession = true
        } catch { /* ignore */ }

        // Check localStorage (legacy: sessions from older app versions).
        if (!hasStoredSession) {
          try {
            if (typeof localStorage !== "undefined") {
              hasStoredSession = localStorage.getItem(authKey) !== null
            }
          } catch { /* ignore */ }
        }
      }

      if (hasStoredSession) {
        const cached = await getCachedNativeHome()
        document.documentElement.style.visibility = ""
        window.location.replace(cached || "/app")
        return
      }

      // ── Layer 3: genuinely logged out ──────────────────────────────────────
      document.documentElement.style.visibility = ""
      window.location.replace("/welcome")
    }

    // Catch-all: if route() itself throws, do one final sync localStorage
    // check before falling back to /welcome so a transient error never
    // incorrectly logs out an authenticated user.
    route().catch(() => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (url) {
          const ref = new URL(url).hostname.split(".")[0]
          const sessionRaw = localStorage.getItem(`sb-${ref}-auth-token`)
          if (sessionRaw) {
            const cachedHome = localStorage.getItem("sb-native-home")
            document.documentElement.style.visibility = ""
            window.location.replace(cachedHome || "/app")
            return
          }
        }
      } catch { /* ignore */ }
      document.documentElement.style.visibility = ""
      window.location.replace("/welcome")
    })
  }, [pathname])

  return null
}

/**
 * Query the DB to determine the user's home route, persist it in Capacitor
 * Preferences (and localStorage via cacheNativeHome), and return it.
 * Falls back to /app on any error.
 */
async function resolveAndCacheHome(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  try {
    const { data: creator } = await supabase
      .from("creators")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle()

    if (creator?.onboarding_completed) {
      await cacheNativeHome("/app")
      return "/app"
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_creator, welcome_completed")
      .eq("id", userId)
      .maybeSingle()

    if (profile?.welcome_completed) {
      const dest = profile.is_creator ? "/app" : "/library"
      await cacheNativeHome(dest)
      return dest
    }

    return "/signup/success"
  } catch {
    return "/app"
  }
}
