"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

const LOG = "[CapacitorAuth]"

/**
 * CapacitorAuthHandler — mounted once in the root layout (renders nothing).
 *
 * Listens for the appUrlOpen event that Capacitor's @capacitor/app plugin
 * fires whenever the OS delivers a deep-link URL to the running activity.
 *
 * Flow on Android (custom-scheme redirect):
 *  1. Login page calls signInWithOAuth({ skipBrowserRedirect: true })
 *     → PKCE code-verifier stored in localStorage in this WebView context.
 *  2. Browser.open() opens the Supabase/Google OAuth URL in the system browser.
 *  3. Google redirects to storelib://auth/callback?code=…
 *  4. Android intercepts the URL → delivers intent to MainActivity.onNewIntent.
 *  5. Capacitor's AppPlugin.handleOnNewIntent fires the appUrlOpen JS event.
 *  6. This handler receives the URL, extracts the code, calls
 *     exchangeCodeForSession(code) — the PKCE verifier is in localStorage
 *     in this same WebView context, so the exchange succeeds.
 *  7. Navigates to /app (creator) or /library (buyer) on success, or
 *     to /login?error=… on failure so the UI never stays stuck.
 *
 * Requirements for this to work:
 *  • @capacitor/app and @capacitor/browser must be in capacitor.build.gradle
 *    (i.e. npx cap sync android must have been run after adding them to
 *    package.json — without this, appUrlOpen will never fire).
 *  • storelib://auth/callback must be in Supabase → Auth → Redirect URLs.
 */
export function CapacitorAuthHandler() {
  const handlingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    let removeListener: (() => void) | undefined

    const setup = async () => {
      try {
        const { Capacitor } = await import("@capacitor/core")
        if (!Capacitor.isNativePlatform()) {
          console.log(`${LOG} Not on native platform, skipping setup.`)
          return
        }
        console.log(`${LOG} Native platform detected, registering appUrlOpen listener.`)

        const { App } = await import("@capacitor/app")
        const { Browser } = await import("@capacitor/browser")

        const handle = await App.addListener("appUrlOpen", async ({ url }) => {
          console.log(`${LOG} appUrlOpen received: ${url}`)

          // Only handle our OAuth callback URLs — ignore unrelated deep links
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
            // Close the in-app browser immediately so the user sees the app.
            console.log(`${LOG} Closing browser.`)
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
              // No code and no error = unrelated URL; handlingRef cleared in finally
              return
            }

            console.log(`${LOG} Calling exchangeCodeForSession...`)
            const supabase = createClient()
            const { data, error: exchangeError } =
              await supabase.auth.exchangeCodeForSession(code)

            if (exchangeError) {
              console.error(`${LOG} exchangeCodeForSession error:`, exchangeError)
              throw exchangeError
            }

            console.log(`${LOG} Session exchange succeeded. userId=${data.user?.id}`)

            const userId = data.user?.id
            if (!userId) throw new Error("No user in session after exchange")

            // ── Determine post-login destination ──────────────────────
            console.log(`${LOG} Looking up user type for routing...`)
            const { data: creatorRow } = await supabase
              .from("creators")
              .select("id")
              .eq("user_id", userId)
              .maybeSingle()

            if (creatorRow) {
              console.log(`${LOG} Creator found, navigating to /app`)
              window.location.assign("/app")
              return
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("is_creator")
              .eq("id", userId)
              .maybeSingle()

            const dest = profile?.is_creator ? "/app" : "/library"
            console.log(`${LOG} Profile found (is_creator=${profile?.is_creator}), navigating to ${dest}`)
            window.location.assign(dest)
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
        removeListener = () => handle.remove()
      } catch (err) {
        // Not running in Capacitor, or plugin not available — silently skip
        console.warn(`${LOG} Setup failed (non-native or plugin missing):`, err)
      }
    }

    setup()
    return () => removeListener?.()
  }, [])

  return null
}
