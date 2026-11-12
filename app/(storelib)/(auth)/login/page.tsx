"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { isAbsoluteTarget } from "@/lib/auth/return-to"
import { getMainDomain } from "@/lib/url-helpers"
import { useState, useEffect, useRef, useMemo } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { AuthPhoto, LOGIN_PHOTO } from "@/components/auth/auth-photo"
import { AuthLogo } from "@/components/auth/auth-logo"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { useMaybeSignedIn } from "@/components/auth/auth-arrival"
import { AppleSignInButton } from "@/components/auth/apple-sign-in-button"
import { useAuthGate } from "@/lib/use-auth-gate"
import { nativeAuthStart, nativeAppReady } from "@/lib/native-bridge"
import { useNativeScrollLock } from "@/lib/use-native-scroll-lock"
import { classifyOAuthError, existingAccountHint, messageForCode, type OAuthErrorCode, type OAuthProvider, type SignInMethod } from "@/lib/auth/oauth-errors"
import { openAuthSheet, signInWithNativeGoogle } from "@/lib/auth/native-sign-in"
import { goToAuthHref } from "@/lib/auth/session-sync"
import { GOOGLE_OAUTH_QUERY } from "@/lib/auth/google-oauth-params"
import { HtmlClass } from "@/components/platform/html-class"
import { readCarry, withCarry } from "@/lib/auth/continue"
import { inviteEmailFrom } from "@/lib/team/invite-links"
import { goOnAfterAuth, rememberNativeCarry } from "@/lib/auth/continue-client"
import { EXISTS_PARAM, takeExistingEmail } from "@/lib/auth/existing-account"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"
import { rememberVerifyAddress } from "@/lib/account/verify-address"

/**
 * ===========================================================================
 *  WHICH BUTTON WAS PRESSED, AND ONE MORE GO
 * ===========================================================================
 * Supabase's error redirect does not say which provider failed, and the
 * redirect URL cannot carry it: Supabase validates redirectTo against an
 * allow-list, and an entry written as an exact URL stops matching the moment
 * a parameter is added. Risking every social sign in on the site to name one
 * in a sentence is not a trade worth making.
 *
 * So the tab remembers. It is the tab that pressed the button and the tab
 * that gets the answer back, on web and inside the WebView alike.
 */
const PROVIDER_KEY = "storelib_oauth_provider"
/**
 * ONE RETRY, AND IT HAS TO BE ONE.
 *
 * "Unable to exchange external code" is Supabase failing to trade Apple's
 * authorization code for a token. Apple's codes are single use and last five
 * minutes, so the ordinary causes are a person who spent longer than that on
 * the Apple screen and a callback that arrived twice, and both are fixed by
 * starting over. Doing that automatically is the difference between a dead
 * end and a hiccup.
 *
 * It is also the exact shape of an infinite redirect loop, so: sessionStorage,
 * per provider, set BEFORE the retry starts and never during a render. A
 * second failure shows the sentence and stops.
 */
const RETRY_KEY = "storelib_oauth_retry"

/** Kept beside the classifier's own list so a code in a URL agrees with it. */
const RETRYABLE_CODES = new Set<OAuthErrorCode>(["exchange_failed", "flow_lost", "expired", "unknown"])

function readProvider(): OAuthProvider | null {
  try {
    const v = sessionStorage.getItem(PROVIDER_KEY)
    return v === "apple" || v === "google" ? v : null
  } catch {
    return null
  }
}

function rememberProvider(provider: OAuthProvider) {
  try {
    sessionStorage.setItem(PROVIDER_KEY, provider)
  } catch {
    /* a WebView with storage disabled loses the name, not the sign in */
  }
}

/** True the first time it is asked for a provider, false every time after. */
function claimRetry(provider: OAuthProvider | null): boolean {
  if (!provider) return false
  try {
    const key = `${RETRY_KEY}:${provider}`
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, "1")
    return true
  } catch {
    return false
  }
}

function clearRetries() {
  try {
    sessionStorage.removeItem(`${RETRY_KEY}:apple`)
    sessionStorage.removeItem(`${RETRY_KEY}:google`)
  } catch {}
}

function LoginFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
  const [isAppleRedirecting, setIsAppleRedirecting] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [googleOnlyEmail, setGoogleOnlyEmail] = useState<string | null>(null)
  /** Set when a retryable failure came back and this tab has a go left. */
  const [retryingProvider, setRetryingProvider] = useState<OAuthProvider | null>(null)
  const { loading: authGateLoading, session: gateSession, nativeAuthInProgress } = useAuthGate()
  const maybeSignedIn = useMaybeSignedIn()
  const redirectTimeoutRef = useRef<number | null>(null)
  // Prevent elastic / rubber-band body scroll in the native WebView.
  // No-op in a regular browser — does not affect desktop behaviour.
  useNativeScrollLock()
  const router = useRouter()
  const searchParams = useSearchParams()
  /* On the way back to a team invite (app/team/join): the invited email, filled in and kept, since no other account can accept it. */
  const inviteEmail = inviteEmailFrom(searchParams)
  useEffect(() => {
    if (inviteEmail) setEmail(inviteEmail)
  }, [inviteEmail])
  /*
    SENT HERE FROM SIGN UP, because the address already has an account
    (lib/auth/existing-account.ts): it is filled in, the page says why it is
    a sign in, and the way in for that address is asked for at once, so the
    next thing on screen is the password field or the button that works.
  */
  const cameFromSignUp = searchParams.get(EXISTS_PARAM) === "1"
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  useEffect(() => {
    if (!cameFromSignUp || inviteEmail) return
    const handed = takeExistingEmail()
    if (!handed) return
    setExistingEmail(handed)
    setEmail(handed)
  }, [cameFromSignUp, inviteEmail])

  const navigateWithFallback = (url: string) => {
    setIsRedirecting(true)
    /* An address on another host is not something the app router can push:
       it would sit here for a second and a half and then be rescued by the
       fallback below. A shop on its own domain is exactly that case, so it
       leaves straight away. */
    if (isAbsoluteTarget(url)) {
      window.location.assign(url)
      return
    }
    router.push(url)
    if (typeof window !== "undefined") {
      if (redirectTimeoutRef.current) {
        window.clearTimeout(redirectTimeoutRef.current)
      }
      redirectTimeoutRef.current = window.setTimeout(() => {
        window.location.assign(url)
      }, 1500)
    }
  }

  /*
    WHERE TO GO AFTERWARDS, AND WHY IT IS CHECKED NOW.

    `redirect` is the old name, used to come back to a receipt. `next` is
    what a creator's built site sends when a visitor there presses Account:
    the site is on its own host and the session lives here, so they have to
    leave to sign in, and this is how they get back.

    Both were, and `redirect` had been, followed as given. A target that is
    followed without being checked turns this page into a laundering service
    for somebody else's link: the address bar says storelib.com, the visitor
    types their password, and they are handed to a page that looks like this
    one. Both go through the same check now, and anything that is not ours
    is dropped rather than followed. See lib/auth/return-to.ts.
  */
  /*
    WHY THEY CAME AND WHERE THEY WERE (lib/auth/continue.ts). `intent=sell`
    is Sell on Storelib or Become a seller; `next` is the page to go back to.
    Both ride on every link off this page (Sign up, Forgot password, Google,
    Apple) and are handed to /auth/continue once somebody is in, which
    decides on the server: onboarding, the dashboard, the page they were on,
    or Discover. A review left pending on a receipt goes along on `next`.
  */
  const carry = useMemo(() => {
    const c = readCarry(searchParams, getMainDomain())
    if (c.next && searchParams.get("pendingReview") === "true" && !c.next.includes("pendingReview")) {
      c.next += (c.next.includes("?") ? "&" : "?") + "pendingReview=true"
    }
    return c
  }, [searchParams])

  /**
   * A FAILED SIGN IN, ARRIVING BACK HERE.
   *
   * `?authError=<code>` is what every auth route now redirects with: a code
   * we wrote, never a sentence somebody upstream wrote. `?error=` is the old
   * shape and still reaches this page from a tab that was already open, from
   * a bookmark, and from the handful of routes whose messages are our own; it
   * goes through the same classifier, so even a raw upstream string arriving
   * from anywhere is read, identified, and dropped rather than rendered.
   *
   * THE RETRY. For the failures that a second attempt fixes, and only on the
   * first one, the flow starts again by itself instead of leaving somebody on
   * a form that has just told them in red that they cannot come in.
   */
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress) return

    const code = searchParams.get("authError")
    const legacy = searchParams.get("error")
    if (!code && !legacy) {
      /** A clean arrival is the end of any retry that was in flight. */
      clearRetries()
      return
    }

    const provider = readProvider()
    const failure = code
      ? { code: code as OAuthErrorCode, message: messageForCode(code as OAuthErrorCode, provider), retryable: RETRYABLE_CODES.has(code as OAuthErrorCode) }
      : classifyOAuthError(legacy, provider)

    setIsGoogleLoading(false)
    setIsAppleLoading(false)

    /**
     * Cancelling is not an error. Somebody who pressed cancel knows what they
     * did and does not need it in red.
     */
    if (failure.code === "cancelled") {
      setError(null)
      return
    }

    if (failure.retryable && provider) {
      if (claimRetry(provider)) {
        setError(null)
        setRetryingProvider(provider)
        return
      }

      /**
       * THE SECOND FAILURE IN A ROW, AND IT MUST NOT SAY "TRY ONCE MORE".
       *
       * The retry has already happened by the time this runs, silently,
       * which is the whole point of it. Repeating the first sentence asks
       * somebody to do a thing that has just been done for them and failed,
       * and they will do it several times before giving up.
       *
       * Twice is past the transient causes: a code that aged out or arrived
       * twice works on the next go. What is left is the provider being down
       * or misconfigured at our end, so the advice becomes the one that
       * actually gets them in, and the buttons it names are directly below.
       */
      setError(messageForCode("provider_unavailable", provider))
      return
    }

    setError(failure.message)
  }, [authGateLoading, nativeAuthInProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The retry itself, in its own effect so it runs after the handlers exist
   * and after the state above has settled. A tick of delay keeps it off the
   * same frame as the paint, so the overlay is on screen before the browser
   * or the redirect takes over.
   */
  useEffect(() => {
    if (!retryingProvider) return
    const id = window.setTimeout(() => {
      if (retryingProvider === "apple") handleAppleSignIn()
      else handleGoogleSignIn()
    }, 60)
    return () => window.clearTimeout(id)
  }, [retryingProvider]) // eslint-disable-line react-hooks/exhaustive-deps

  // If user is already authenticated, redirect — never show the form.
  // Uses the session resolved by useAuthGate() instead of a manual getSession().
  // Includes loop detection to prevent infinite redirect cycles.
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress) return

    if (!gateSession) {
      // No session — clear loop counter and show form
      sessionStorage.removeItem("storelib_login_hits")
      sessionStorage.removeItem("storelib_login_ts")
      return
    }

    // ── Loop detection ──────────────────────────────────────────────────
    const now = Date.now()
    const lastTs = parseInt(sessionStorage.getItem("storelib_login_ts") || "0")
    const hitCount = parseInt(sessionStorage.getItem("storelib_login_hits") || "0")

    if (now - lastTs < 6000) {
      const newHits = hitCount + 1
      sessionStorage.setItem("storelib_login_hits", String(newHits))
      sessionStorage.setItem("storelib_login_ts", String(now))

      if (newHits >= 3) {
        console.warn("[login] Redirect loop detected, showing login form")
        sessionStorage.removeItem("storelib_login_hits")
        sessionStorage.removeItem("storelib_login_ts")
        return
      }
    } else {
      sessionStorage.setItem("storelib_login_hits", "1")
      sessionStorage.setItem("storelib_login_ts", String(now))
    }

    // ── Session exists: the server decides where to (app/auth/continue) ──
    /*
      ONE HARD NAVIGATION, AND THE SERVER ANSWERS. This used to read the
      creator row and the profile here, pick /app, /library or the old role
      chooser, and push there, with a six second timer that sent everybody to
      /app if the reads were slow. /auth/continue reads the same rows on the
      server and replies with one redirect, so there is nothing to wait for
      here and no second page drawn on the way.
    */
    setIsRedirecting(true)
    void goOnAfterAuth(carry, gateSession)
  }, [authGateLoading, nativeAuthInProgress, gateSession]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [])

  const lookupAccountOrigin = async (rawEmail: string) => {
    const emailToCheck = rawEmail.trim().toLowerCase()
    const res = await fetch("/api/auth/account-origin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailToCheck }),
    })

    if (!res.ok) return null
    return res.json()
  }

  /* The address handed over by sign up: its way in, asked for once it is in the field. */
  useEffect(() => {
    if (existingEmail && email === existingEmail && !showPasswordField) void askWayIn(existingEmail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEmail])

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!showPasswordField) {
      await askWayIn(email)
      return
    }
    await signInWithEmail()
  }

  /** The first step: the address, and which way in it has (a password, Google, Apple). */
  const askWayIn = async (address: string) => {
    {
      if (!address.trim()) {
        setError("Please enter your email")
        return
      }

      setIsContinueLoading(true)
      try {
        const origin = await lookupAccountOrigin(address)
        /**
         * NAME THE WAY IN, WHICHEVER IT IS.
         *
         * This used to ask only "is it Google?", so an account created with
         * Sign in with Apple fell through to the password field and then to
         * "Invalid login credentials" — their own account, telling them they
         * had the wrong one.
         */
        const hint = existingAccountHint((origin?.methods ?? []) as SignInMethod[])
        if (hint) {
          setGoogleOnlyEmail(address.trim().toLowerCase())
          setShowPasswordField(false)
          setError(hint)
          return
        }
      } catch {}
      finally {
        setIsContinueLoading(false)
      }

      setGoogleOnlyEmail(null)
      setShowPasswordField(true)
      setError(null)
      return
    }
  }

  /** The second step: the password. */
  const signInWithEmail = async () => {
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password

    try {
      const origin = await lookupAccountOrigin(trimmedEmail)
      const hint = existingAccountHint((origin?.methods ?? []) as SignInMethod[])
      if (hint) {
        setGoogleOnlyEmail(trimmedEmail)
        setError(hint)
        setIsLoading(false)
        return
      }
      const { error, data } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      })

      if (error) {
        // Handle specific error messages
        if (error.message.includes("Email not confirmed")) {
          // User hasn't verified email — redirect to our custom verify page
          /* The id, from the server, which asks for the password too (app/api/auth/unconfirmed-account). */
          const userData = await fetch("/api/auth/unconfirmed-account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
          })
            .then((r) => (r.ok ? (r.json() as Promise<{ userId?: string }>) : null))
            .then((j) => (j?.userId ? { id: j.userId } : null))
            .catch(() => null)

          if (userData) {
            rememberVerifyAddress(userData.id, trimmedEmail)
            navigateWithFallback(
              withCarry(`/signup/verify?userId=${encodeURIComponent(userData.id)}`, carry)
            )
            router.refresh()
            return
          }
        }
        throw error
      }

      if (data.user) {
        /*
          SIGNED IN. Where to is not this page's call any more: an address
          still to verify, Sell on Storelib, a seller, a buyer and the page
          they came from are all decided by /auth/continue on the server
          (lib/auth/continue.ts), in one redirect. The unverified case gets a
          fresh code from the verify page itself, which sends one when it
          opens without `sent`.
        */
        try { localStorage.setItem("storelib_welcome_shown", "true") } catch {}
        localStorage.removeItem("storelib_auth_redirect")
        setIsRedirecting(true)
        await goOnAfterAuth(carry, data.session)
        return
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Invalid email or password"
      // Clean up error message
      if (errorMessage.includes("Invalid login credentials")) {
        setError("Invalid email or password")
      } else if (errorMessage.includes("Email not confirmed")) {
        setError("Please verify your email first")
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return
    // Single-flight lock: prevent double-tap from calling signInWithOAuth()
    // twice, which would overwrite the stored PKCE code-verifier and cause
    // "invalid flow state" on the callback.
    if ((window as any).__oauthStarting) return
    ;(window as any).__oauthStarting = true
    rememberProvider("google")
    setIsGoogleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

    // Detect native synchronously (before any async work) so we can show
    // the full-screen loading overlay on web immediately — without waiting
    // for the dynamic import which adds a visible delay.
    const isNativeSync =
      typeof (window as any).Capacitor?.isNativePlatform === "function" &&
      (window as any).Capacitor.isNativePlatform()

    if (!isNativeSync) {
      // Web: show full-screen loading overlay now so the user sees continuous
      // feedback from click → OAuth redirect → callback → app. The page will
      // navigate away in the next microtask, keeping this state alive until
      // the browser navigates.
      setIsGoogleRedirecting(true)
    }

    try {
      // Use the current browser origin so /auth/start runs on the same host.
      // This is critical on Vercel preview deployments where the host differs
      // from NEXT_PUBLIC_SITE_URL — the PKCE cookie must be set and read on
      // the same origin.
      const canonicalUrl = window.location.origin

      // Dynamic import — @capacitor/core is already bundled in the native build
      const { Capacitor } = await import("@capacitor/core")

      if (Capacitor.isNativePlatform()) {
        // ── Native (iOS + Android) — client-side PKCE flow ───────────
        // 1. signInWithOAuth with skipBrowserRedirect stores the PKCE
        //    code-verifier in Capacitor Preferences (SharedPreferences /
        //    NSUserDefaults).
        // 2. Browser.open() opens the OAuth URL in SFSafariViewController
        //    (iOS) or Chrome Custom Tab (Android).
        // 3. After OAuth, Supabase redirects to the native callback URL:
        //    iOS:     com.storelib.app://auth/callback?code=…
        //    Android: storelib://auth/callback?code=…
        //    The OS intercepts → Capacitor appUrlOpen event fires.
        // 4. native-oauth.ts handler exchanges the code for a session.
        // 5. Safety nets ensure loading state always clears:
        //    - browserFinished fires if the user dismisses the browser early.
        //    - A 20 s timeout clears loading if nothing else fires first.
        //
        // IMPORTANT: BOTH URLs must be listed in Supabase dashboard:
        //   Auth → URL Configuration → Redirect URLs:
        //     storelib://auth/callback
        //     com.storelib.app://auth/callback

        // Platform-specific callback URL: iOS uses the bundle-ID scheme so
        // the OS can route the redirect back into the app via Universal Links /
        // custom URL scheme. Android uses the legacy storelib:// scheme.
        const platform = Capacitor.getPlatform() // 'ios' | 'android' | 'web'
        const nativeCallbackUrl =
          platform === "ios"
            ? "com.storelib.app://auth/callback"
            : "storelib://auth/callback"

        const supabase = createClient()

        /*
          THE PHONE'S OWN SHEET FIRST (lib/auth/native-sign-in.ts): Google's
          bottom sheet on Android, Google's sheet on iOS, no browser and no
          deep link. A build without the native plugin says so and the Safari
          sheet below runs exactly as before.
        */
        rememberNativeCarry(carry)
        const sheet = await signInWithNativeGoogle(supabase)
        if (sheet.result === "done" && sheet.href) {
          nativeAuthStart()
          goToAuthHref(sheet.href)
          return
        }
        if (sheet.result === "cancelled") {
          ;(window as any).__oauthStarting = false
          setIsGoogleLoading(false)
          nativeAppReady()
          return
        }
        if (sheet.result === "failed") {
          ;(window as any).__oauthStarting = false
          setIsGoogleLoading(false)
          nativeAppReady()
          setError(classifyOAuthError({ message: sheet.message ?? null }, "google").message)
          return
        }
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            // Supabase will 302 to nativeCallbackUrl?code=… after Google
            // OAuth completes. PKCE code-verifier is stored in Capacitor
            // Preferences and survives the SFSafariViewController /
            // Chrome Custom Tab round-trip.
            redirectTo: nativeCallbackUrl,
            /* Nothing extra: Google continues with the account it already has (lib/auth/google-oauth-params.ts). */
            queryParams: GOOGLE_OAUTH_QUERY,
            skipBrowserRedirect: true,
          },
        })
        if (oauthError || !data.url) throw oauthError ?? new Error("OAuth init failed")

        const { Browser } = await import("@capacitor/browser")

        // Listen for user dismissing the browser WITHOUT completing OAuth.
        // The handle must be removed once we're done (success or error) to
        // avoid leaking. CapacitorAuthHandler handles the success path and
        // navigates away; the browserFinished listener covers the cancel path.
        let browserFinishedHandle: { remove: () => void } | undefined
        const timeoutId = window.setTimeout(() => {
          // 20-second hard safety: if neither appUrlOpen nor browserFinished
          // has fired, give up and let the user try again.
          browserFinishedHandle?.remove()
          ;(window as any).__oauthStarting = false
          setIsGoogleLoading(false)
          setError(messageForCode("expired", "apple"))
        /**
         * TWENTY SECONDS WAS NOT ENOUGH TIME TO SIGN IN.
         *
         * This fires while the Apple or Google sheet is still open, sets an
         * error behind it, and clears the loading state. Sign in with Apple
         * routinely takes longer than twenty seconds: Face ID, then the
         * "Share My Email" choice, then two factor to another device that has
         * to be fetched from another room. The sign in then completes anyway
         * and the deep link navigates away, so the only thing the timeout
         * achieved was an error message on the way past.
         *
         * Two minutes is the ceiling for a person who has genuinely walked
         * off, and the browser closing still cancels it immediately, which is
         * the case this was really for.
         */
        }, 120_000)

        try {
          browserFinishedHandle = await Browser.addListener(
            "browserFinished",
            () => {
              // Browser closed. If CapacitorAuthHandler already navigated
              // away, this won't fire. If it fires, the user cancelled.
              window.clearTimeout(timeoutId)
              browserFinishedHandle?.remove()
              // Small delay: appUrlOpen can arrive just after browserFinished
              // on some Android versions. Only clear loading if we're still here.
              window.setTimeout(() => {
                ;(window as any).__oauthStarting = false
                setIsGoogleLoading(false)
                // User cancelled — dismiss the native overlay so the form is
                // interactive again (overlay was shown before Browser.open()).
                nativeAppReady()
              }, 400)
            }
          )
        } catch {
          // addListener may throw if the plugin isn't loaded — ignore
        }

        // Show the native loading overlay NOW, before the browser opens.
        // When the Chrome Custom Tab closes and the WebView Activity resumes,
        // the overlay will already be visible — preventing the brief flash of
        // the login form between browser close and appUrlOpen handler start.
        nativeAuthStart()

        /* Why they came, for lib/native-oauth.ts to hand on once the deep link is back. */
        rememberNativeCarry(carry)
        await openAuthSheet(data.url)

        // isGoogleLoading stays true while the browser is open.
        // It will be cleared by one of: CapacitorAuthHandler navigation,
        // browserFinished, or the 20 s timeout above.
        return // avoid the finally setIsGoogleLoading(false) below
      } else {
        // ── Web ───────────────────────────────────────────────────────
        // Full-screen overlay already shown above (before dynamic import).
        // Navigate to auth/start which redirects to Google OAuth.
        window.location.href = `${canonicalUrl}${withCarry("/auth/start?provider=google", carry)}`
        return
      }
    } catch (err: unknown) {
      setError(classifyOAuthError({ message: err instanceof Error ? err.message : null }, "google").message)
    }
    ;(window as any).__oauthStarting = false
    setIsGoogleLoading(false)
  }

  const handleAppleSignIn = async () => {
    // Single-flight lock — prevents double-tap and conflicts with Google flow
    if (isAppleLoading || (window as any).__appleOAuthStarting || (window as any).__oauthStarting) return
    ;(window as any).__appleOAuthStarting = true
    rememberProvider("apple")
    setIsAppleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

    // Detect native synchronously before any async work so we can show the
    // full-screen loading overlay on web without waiting for the dynamic import.
    const isNativeSync =
      typeof (window as any).Capacitor?.isNativePlatform === "function" &&
      (window as any).Capacitor.isNativePlatform()

    if (!isNativeSync) {
      setIsAppleRedirecting(true)
    }

    try {
      const canonicalUrl = window.location.origin
      const { Capacitor } = await import("@capacitor/core")

      if (Capacitor.isNativePlatform()) {
        // ── Native (iOS + Android) — client-side PKCE flow ───────────────
        // Same pattern as Google: store PKCE verifier in Capacitor Preferences,
        // open the OAuth URL in SFSafariViewController (iOS) or Chrome Custom
        // Tab (Android), then let native-oauth.ts exchange the code on callback.
        const platform = Capacitor.getPlatform() // 'ios' | 'android'
        const nativeCallbackUrl =
          platform === "ios"
            ? "com.storelib.app://auth/callback"
            : "storelib://auth/callback"

        const supabase = createClient()
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: nativeCallbackUrl,
            // No queryParams for Apple — access_type / prompt are Google-specific
            skipBrowserRedirect: true,
          },
        })
        if (oauthError || !data.url) throw oauthError ?? new Error("OAuth init failed")

        const { Browser } = await import("@capacitor/browser")

        let browserFinishedHandle: { remove: () => void } | undefined
        const timeoutId = window.setTimeout(() => {
          browserFinishedHandle?.remove()
          ;(window as any).__appleOAuthStarting = false
          setIsAppleLoading(false)
          setError(messageForCode("expired", "apple"))
        /** Two minutes, for the reason given on the other handler. */
        }, 120_000)

        try {
          browserFinishedHandle = await Browser.addListener("browserFinished", () => {
            // Browser closed by user before completing OAuth (cancel path)
            window.clearTimeout(timeoutId)
            browserFinishedHandle?.remove()
            window.setTimeout(() => {
              ;(window as any).__appleOAuthStarting = false
              setIsAppleLoading(false)
              nativeAppReady()
            }, 400)
          })
        } catch {
          // addListener may throw if the plugin isn't loaded — ignore
        }

        nativeAuthStart()
        /* Why they came, for lib/native-oauth.ts to hand on once the deep link is back. */
        rememberNativeCarry(carry)
        await openAuthSheet(data.url)
        // isAppleLoading stays true while browser is open.
        // Cleared by: CapacitorAuthHandler navigation, browserFinished, or timeout.
        return
      } else {
        // ── Web — server-side PKCE via /auth/start ────────────────────────
        // /auth/start writes the PKCE cookie on the server and redirects to
        // the Apple OAuth URL. Full-screen overlay already shown above.
        window.location.href = `${canonicalUrl}${withCarry("/auth/start?provider=apple", carry)}`
        return
      }
    } catch (err: unknown) {
      setError(classifyOAuthError({ message: err instanceof Error ? err.message : null }, "apple").message)
    }
    ;(window as any).__appleOAuthStarting = false
    setIsAppleLoading(false)
  }

  /*
    The form is drawn at once for a stranger, in the first HTML (round 3,
    components/auth/auth-arrival.tsx). The spinner is only for a request
    that carried a session cookie, while the check that would send them on
    runs, and for the app finishing a sign in it started itself.
  */
  if (nativeAuthInProgress || (authGateLoading && maybeSignedIn)) {
    return <AuthResolvingScreen message={nativeAuthInProgress ? "Signing you in..." : undefined} />
  }

  /**
   * THE RETRY IS NOT A BLANK MOMENT ON A LOGIN FORM.
   *
   * Between the failure landing here and the flow restarting there is a tick
   * where the form is on screen with nothing happening. Covering it says what
   * is going on, and it is the same screen the first attempt showed, so a
   * second try looks like the first rather than like a fault.
   */
  if (retryingProvider) {
    return <AuthResolvingScreen message={`Finishing sign in with ${retryingProvider === "apple" ? "Apple" : "Google"}...`} />
  }

  if (isRedirecting || gateSession || isGoogleRedirecting || isAppleRedirecting) {
    return <AuthResolvingScreen />
  }

  return (
    <div data-page="login" className="flex min-h-svh w-full bg-white lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      <HtmlClass name="with-page-login" />
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack auth-shell">
        <div className="mx-auto w-full max-w-[400px] py-2 sm:py-3 lg:py-4 auth-card">
          <AuthLogo />

          <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">{cameFromSignUp && !inviteEmail ? tt("Sign in") : "Welcome back"}</h1>
          {/* Sell on Storelib: says the setup comes next, so nobody wonders whether the click was lost. */}
          {/* Sent from Create account: the address has an account, so this is a sign in, and the page says so (lib/auth/existing-account.ts). */}
          {cameFromSignUp && !inviteEmail ? (
            <p data-existing-account="" role="status" className="mb-8 text-[15px] text-neutral-600">
              {existingEmail ? (
                <>
                  <Rich text={tt("{email} already has a Storelib account. Sign in to continue.")} parts={{ email: <span className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{existingEmail}</span> }} />
                </>
              ) : (
                tt("This email already has a Storelib account. Sign in to continue.")
              )}
            </p>
          ) : (
            <p className="mb-8 text-[15px] text-neutral-500">{inviteEmail ? `Log in as ${inviteEmail} to accept the invite.` : carry.intent ? "Log in, then set up your shop." : "Log in to your account"}</p>
          )}

          <form onSubmit={handleContinue} className="space-y-4">
            <div className="space-y-2">
              {/* Named for a screen reader and a browser agent; the placeholder says the same to the eye. */}
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <Input
                id="email"
                type="email"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "auth-error" : undefined}
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={!!inviteEmail}
                aria-readonly={inviteEmail ? true : undefined}
                autoComplete="email"
                className={`h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0${inviteEmail ? " text-neutral-600" : ""}`}
              />
            </div>

            {showPasswordField && (
              <div className="space-y-2">
                <div className="relative">
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <Input
                    id="password"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "auth-error" : undefined}
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 pr-11 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    tabIndex={-1}
                    aria-label="Show password"
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p id="auth-error" role="alert" className="text-sm text-red-500">
                {error}
              </p>
            )}

            {googleOnlyEmail && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                {/* The buttons that work for this email are right below this
                    note, so it points at them rather than naming one. */}
                <p className="text-xs text-blue-800">
                  Use one of the sign in options below for <span className="font-medium">{googleOnlyEmail}</span>.
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold text-white hover:bg-neutral-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isContinueLoading}
            >
              {isLoading ? "Logging in..." : isContinueLoading ? "Checking..." : "Continue"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-[13px] font-medium text-neutral-400">OR</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isAppleLoading}
              className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-80 transition-opacity"
            >
              {isGoogleLoading ? (
                <Loader2 className="mr-3 h-5 w-5 animate-spin text-neutral-500" />
              ) : (
                <svg className="mr-3 h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isGoogleLoading ? "Connecting..." : "Continue with Google"}
            </Button>

            <AppleSignInButton
              isLoading={isAppleLoading}
              disabled={isGoogleLoading || isAppleLoading}
              onClick={handleAppleSignIn}
            />
          </div>

          <div className="mt-4 text-center">
            {/* A 36px press on a phone, where it sits alone on its line; the margin takes the padding back so nothing moves. */}
            <Link href={withCarry("/request", carry)} className="-my-2.5 inline-block py-2.5 text-[13px] text-neutral-400 hover:text-neutral-600">
              Forgot password?
            </Link>
          </div>

          <p className="mt-6 text-center text-[14px] text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link href={withCarry("/signup", carry)} className="font-medium text-purple-600 hover:text-purple-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      <AuthPhoto src={LOGIN_PHOTO} />
    </div>
  )
}

/*
  NO SUSPENSE BOUNDARY HERE ANY MORE (round 3). It was only for the static
  build, which drew the boundary's spinner as the whole page; the layout now
  reads the request (components/auth/auth-arrival-server.tsx), so this is
  drawn per request with the form in it. A boundary would let the server
  send its spinner first and swap the form in after it: on a slow phone that
  spinner painted, and was the flash this page is not to have.
*/
export default function LoginPage() {
  return <LoginFormContent />
}
