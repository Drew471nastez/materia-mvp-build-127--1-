"use client"

/**
 * /native-start — dedicated native app cold-start entry gate.
 *
 * The server renders this page instantly (no DB queries, no auth checks).
 * All the user sees is a neutral #f2f2f2 screen — never the public homepage.
 *
 * Client-side, we resolve session + role and redirect:
 *   - creator with onboarding done  → /app
 *   - buyer with welcome done        → /library
 *   - no valid session               → /welcome
 *   - new user (no profile complete) → /signup/success
 *
 * Splash hide is NOT called here.  The destination page hides it.
 */

import { useEffect } from "react"

export default function NativeStartPage() {
  useEffect(() => {
    async function resolve() {
      // ── PRIORITY: handle reset-password / recovery deep links first ───────
      // Must run BEFORE the synchronous localStorage fast-path to prevent
      // Layer 1 from navigating to /app before the deep link can be processed.
      try {
        const { App } = await import("@capacitor/app")
        const launch = await App.getLaunchUrl()
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
                const code = new URL(lu).searchParams.get("code")
                if (code) {
                  window.location.replace(`/reset-password?code=${encodeURIComponent(code)}`)
                  return
                }
              } catch { /* ignore */ }
            } else {
              try { sessionStorage.setItem("nativeRecoveryUrl", lu) } catch { /* ignore */ }
            }
            window.location.replace("/reset-password")
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
            window.location.replace(cachedHome)
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
            window.location.replace(cached)
            return
          }

          // No cache — query DB to determine creator vs buyer.
          const userId = session.user.id

          const { data: creator } = await supabase
            .from("creators")
            .select("onboarding_completed")
            .eq("user_id", userId)
            .maybeSingle()

          if (creator?.onboarding_completed) {
            await cacheNativeHome("/app")
            window.location.replace("/app")
            return
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("is_creator, welcome_completed")
            .eq("id", userId)
            .maybeSingle()

          if (profile?.welcome_completed) {
            const dest = profile.is_creator ? "/app" : "/library"
            await cacheNativeHome(dest)
            window.location.replace(dest)
            return
          }

          // Authenticated but hasn't finished onboarding.
          window.location.replace("/signup/success")
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
          window.location.replace(cached || "/app")
          return
        }
      } catch { /* ignore */ }

      // ── No session — send to welcome screen ───────────────────────────────
      window.location.replace("/welcome")
    }

    resolve()
  }, [])

  return (
    <>
      <style>{`
        @keyframes ns-spin { to { transform: rotate(360deg); } }
        .ns-spinner {
          width: 26px; height: 26px;
          border: 2.5px solid rgba(0,0,0,.10);
          border-top-color: rgba(0,0,0,.30);
          border-radius: 50%;
          animation: ns-spin 0.75s linear infinite;
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
        }}
      >
        <div className="ns-spinner" />
      </div>
    </>
  )
}
