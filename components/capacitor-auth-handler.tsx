"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

const LOG = "[CapacitorAuth]"

/**
 * CapacitorAuthHandler — mounted once in the root layout (renders nothing).
 *
 * Handles Google OAuth callbacks on Android (Capacitor custom-scheme PKCE flow):
 *
 *  1. Login page calls signInWithOAuth({ skipBrowserRedirect: true,
 *       redirectTo: "storelib://auth/callback" })
 *     → PKCE code-verifier is stored in localStorage in this WebView context.
 *  2. Browser.open() opens the Supabase/Google OAuth URL in the system browser.
 *  3. Google redirects to storelib://auth/callback?code=…
 *  4. Android intercepts the URL → delivers intent to MainActivity.onNewIntent.
 *  5. Capacitor's AppPlugin fires the appUrlOpen JS event in the WebView.
 *  6. This handler receives the URL, calls exchangeCodeForSession(code) —
 *     the PKCE verifier is in localStorage (same WebView context) → exchange succeeds.
 *  7. Navigates immediately to /app on success (server-side routing decides the
 *     final destination: creator → /app, buyer → /library, new → /onboarding).
 *     On error → /login?error=… so the UI never stays stuck.
 *
 *  FALLBACK: onAuthStateChange listener covers the case where appUrlOpen fires
 *  but the appUrlOpen handler already ran or the session was established by
 *  another code path.
 */
export function CapacitorAuthHandler() {
  const handlingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    let removeAppListener: (() => void) | undefined
    let removeAuthListener: (() => void) | undefined

    const setup = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core")
        if (!Capacitor.isNativePlatform()) {
          console.log(`${LOG} Not on native platform, skipping setup.`)
          return
        }
        console.log(`${LOG} Native platform detected, registering listeners.`)

        const { App } = await import("@capacitor/app")
        const { Browser } = await import("@capacitor/browser")
        const supabase = createClient()

        // ── onAuthStateChange fallback ────────────────────────────────────
        // If the session gets established (by appUrlOpen or any other path)
        // and we're still on /login, navigate away. This is the safety net for
        // cases where appUrlOpen fires but navigation hasn't happened yet.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
              const onLogin =
                window.location.pathname === "/login" ||
                window.location.pathname === "/signup"
              if (onLogin) {
                console.log(`${LOG} onAuthStateChange(${event}): navigating to /app`)
                window.location.assign("/app")
              }
            }
          }
        )
        removeAuthListener = () => subscription.unsubscribe()

        // ── appUrlOpen (primary path) ─────────────────────────────────────
        const handle = await App.addListener("appUrlOpen", async ({ url }) => {
          console.log(`${LOG} appUrlOpen received: ${url}`)

          // Only handle our OAuth callback URLs — ignore all other deep links
          const isOAuthCallback =
            url.startsWith("storelib://auth/callback") ||
            url.includes("/app/auth/callback")

          if (!isOAuthCallback) {
            console.log(`${LOG} URL is not an OAuth callback, ignoring.`)
            return
          }

          if (handlingRef.current) {
            console.log(`${LOG} Already handling a callback, ignoring duplicate.`)
            return
          }
          handlingRef.current = true

          try {
            // Close the in-app browser so the user sees the app immediately.
            await Browser.close().catch((e: unknown) => {
              console.warn(`${LOG} Browser.close() failed (already closed?):`, e)
            })

            const u = new URL(url)
            const code = u.searchParams.get("code")
            const oauthError = u.searchParams.get("error")
            const errorDescription = u.searchParams.get("error_description")

            console.log(`${LOG} code=${code ? "present" : "missing"} error=${oauthError ?? "none"}`)

            if (!code) {
              if (oauthError) {
                const msg =
                  oauthError === "access_denied"
                    ? "Sign in was cancelled."
                    : errorDescription ?? oauthError
                console.error(`${LOG} OAuth error from provider: ${msg}`)
                window.location.assign(
                  `/login?error=${encodeURIComponent(msg)}`
                )
              }
              // No code and no error = unrelated URL; let handlingRef clear in finally
              return
            }

            // Exchange the PKCE authorization code for a session.
            // The code verifier was stored in localStorage by signInWithOAuth().
            // Do NOT make any additional DB queries here — just navigate to /app
            // and let the server-side page handle routing (creator/buyer/onboarding).
            // Extra DB queries were the #1 cause of "Connecting…" getting stuck.
            console.log(`${LOG} Calling exchangeCodeForSession...`)
            const { error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code)

            if (exchangeError) {
              console.error(`${LOG} exchangeCodeForSession error:`, exchangeError)
              // AuthPKCECodeVerifierMissingError means the verifier was lost
              // (e.g. WebView restarted). Surface a clear message.
              const msg = exchangeError.message.includes("code verifier")
                ? "Session expired. Please sign in again."
                : exchangeError.message
              window.location.assign(
                `/login?error=${encodeURIComponent(msg)}`
              )
              return
            }

            // Session is now stored in localStorage. Navigate to /app.
            // The Next.js /app page (server-side) will redirect to /library or
            // /onboarding as appropriate for the user's account type.
            console.log(`${LOG} Exchange succeeded — navigating to /app`)
            window.location.assign("/app")
          } catch (err) {
            console.error(`${LOG} OAuth callback handler threw:`, err)
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

        console.log(`${LOG} appUrlOpen listener registered.`)
        removeAppListener = () => handle.remove()
      } catch (err) {
        // Not running in Capacitor, or plugin not available — silently skip
        console.warn(`${LOG} Setup failed (non-native or plugin missing):`, err)
      }
    }

    setup()
    return () => {
      removeAppListener?.()
      removeAuthListener?.()
    }
  }, [])

  return null
}
