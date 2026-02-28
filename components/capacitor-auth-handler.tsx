"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"

/**
 * CapacitorAuthHandler — mounted once in the root layout (renders nothing).
 *
 * Listens for App Links that arrive after Google OAuth completes inside
 * @capacitor/browser's system browser. When the OS fires the App Link for
 * https://storelib.com/app/auth/callback?code=... this listener:
 *
 *  1. Closes the in-app browser tab (Browser.close).
 *  2. Extracts the `code` query param from the URL.
 *  3. Calls supabase.auth.exchangeCodeForSession(code) IN THE WEBVIEW JS
 *     CONTEXT — which is the same context where signInWithOAuth stored the
 *     PKCE code-verifier. No cookie-jar isolation problem. ✅
 *  4. Determines the post-login route (creator/seller → /app, buyer → /library).
 *  5. Navigates via window.location.assign.
 *
 * On error or user-cancel (error param / missing code), navigates to
 * /login?error=<message> so the form can display it.
 *
 * The guard ref prevents double-invocation if the OS fires the intent twice.
 */
export function CapacitorAuthHandler() {
  const handlingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    let removeListener: (() => void) | undefined

    const setup = async () => {
      try {
        // Dynamic imports — tree-shaken on web builds; only bundle in native
        const { Capacitor } = await import("@capacitor/core")
        if (!Capacitor.isNativePlatform()) return

        const { App } = await import("@capacitor/app")
        const { Browser } = await import("@capacitor/browser")

        const handle = await App.addListener("appUrlOpen", async ({ url }) => {
          console.log("APP URL OPEN:", url)

          // Only handle our OAuth callback URLs — ignore unrelated deep links
          const isOAuthCallback =
            url.startsWith("storelib://auth/callback") ||
            url.includes("/app/auth/callback")
          if (!isOAuthCallback) return

          if (handlingRef.current) return
          handlingRef.current = true

          try {
            // Close the in-app browser before anything else so the user
            // sees the app immediately rather than a blank browser tab.
            await Browser.close().catch(() => {})

            const u = new URL(url)
            const code = u.searchParams.get("code")
            const oauthError = u.searchParams.get("error")

            // User cancelled consent or provider returned an error
            if (!code) {
              if (oauthError) {
                const msg =
                  oauthError === "access_denied"
                    ? "Sign in was cancelled."
                    : oauthError
                window.location.assign(
                  `/login?error=${encodeURIComponent(msg)}`
                )
              }
              // No code and no error = unrelated URL open; ignore
              return
            }

            const supabase = createClient()

            // Exchange the code using the WebView's own Supabase client.
            // The PKCE code-verifier was stored here by signInWithOAuth
            // (skipBrowserRedirect: true), so exchangeCodeForSession finds it. ✅
            const { data, error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code)

            if (exchangeError) throw exchangeError

            const userId = data.user?.id
            if (!userId) throw new Error("No user in session")

            // ── Determine post-login destination ──────────────────────
            const { data: creatorRow } = await supabase
              .from("creators")
              .select("id")
              .eq("user_id", userId)
              .maybeSingle()

            if (creatorRow) {
              window.location.assign("/app")
              return
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("is_creator")
              .eq("id", userId)
              .maybeSingle()

            window.location.assign(profile?.is_creator ? "/app" : "/library")
          } catch (err) {
            console.error("OAuth callback failed", err)
            const msg =
              err instanceof Error
                ? err.message
                : "Sign in failed. Please try again."
            window.location.assign(
              `/login?error=${encodeURIComponent(msg)}`
            )
          } finally {
            handlingRef.current = false
          }
        })

        removeListener = () => handle.remove()
      } catch {
        // Not running in Capacitor — silently skip
      }
    }

    setup()
    return () => removeListener?.()
  }, [])

  return null
}
