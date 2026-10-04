"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense, useRef } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { getCanonicalSiteUrl, getMainDomain } from "@/lib/url-helpers"
import Image from "next/image"
import { AuthLogo } from "@/components/auth/auth-logo"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { AppleSignInButton } from "@/components/auth/apple-sign-in-button"
import { useAuthGate } from "@/lib/use-auth-gate"
import { readSessionBounded } from "@/lib/auth/session-read"
import { nativeAuthStart, nativeAppReady } from "@/lib/native-bridge"
import { useNativeScrollLock } from "@/lib/use-native-scroll-lock"
import { useLocale } from "@/components/locale-provider"
import { alreadyRegisteredHint, classifyOAuthError, type SignInMethod } from "@/lib/auth/oauth-errors"
import { HtmlClass } from "@/components/platform/html-class"
import { readCarry, withCarry } from "@/lib/auth/continue"
import { goOnAfterAuth, rememberNativeCarry } from "@/lib/auth/continue-client"

function SignUpFormContent() {
  const { t } = useLocale()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agreeToTerms, setAgreeToTerms] = useState(false)
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
  const { loading: authGateLoading, nativeAuthInProgress } = useAuthGate()
  const redirectTimeoutRef = useRef<number | null>(null)
  /**
   * ---------------------------------------------------------------------------
   * THE TWO BOT TELLS THIS FORM CARRIES
   * ---------------------------------------------------------------------------
   * `honeypot` backs a field no human can see or tab into (rendered below).
   * Automated form-fillers fill every input they find, because that is what
   * makes them work everywhere; a person leaves it empty because they never
   * knew it existed.
   *
   * `mountedAt` is when this form appeared. The elapsed time goes to the guard,
   * which refuses submissions faster than a human hand. Both are checked
   * SERVER-SIDE in /api/auth/signup-guard — doing it here as well would only
   * tell a script which check it failed.
   *
   * See lib/security/spam-signals.ts for why any of this exists.
   */
  const [honeypot, setHoneypot] = useState("")
  const mountedAt = useRef<number>(Date.now())
  // Prevent elastic / rubber-band body scroll in the native WebView.
  // No-op in a regular browser — does not affect desktop behaviour.
  useNativeScrollLock()
  const router = useRouter()
  const searchParams = useSearchParams()
  /* Only a target the platform will actually honour is passed on. The same
     check runs again on the login page; this one keeps a rejected target
     out of the link rather than putting it there to be dropped later. */
  /*
    WHY THEY CAME AND WHERE THEY WERE (lib/auth/continue.ts): `intent=sell`
    from Sell on Storelib or Become a seller, and `next`, the page to go back
    to. Carried onto Log in, the email code, Google and Apple, and handed to
    /auth/continue at the end, which sends a plain signup to Discover and a
    Sell on Storelib one straight into seller onboarding.
  */
  const carry = readCarry(searchParams, getMainDomain())
  const loginHref = withCarry("/login", carry)
  const claim = searchParams.get("claim")
  const receiptToken = searchParams.get("receiptToken")
  const prefilledEmail = searchParams.get("email")
  // Get redirect URL from search params (for returning to receipt page after signup)
  const redirectUrl = searchParams.get("redirect")
  const pendingReview = searchParams.get("pendingReview")
  const autoBuyer = searchParams.get("autoBuyer") // Auto-select buyer account type (from receipt page)

  // One navigation, not two — see the same note on the login page. The push +
  // hard-reload-1.5s-later pair meant a successful sign-up loaded the next page
  // twice, and a slow one sat here for a second and a half before moving. A hard
  // navigation also guarantees the freshly-set session cookie is sent with the
  // request, so the destination never renders as though you were signed out.
  const navigateWithFallback = (url: string) => {
    setIsRedirecting(true)
    if (typeof window !== "undefined") {
      window.location.assign(url)
      return
    }
    router.push(url)
  }

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

  // Check if user is already authenticated - redirect if so
  // Includes loop detection to prevent infinite redirect cycles.
  // Skipped while auth gate is loading or native OAuth callback is in progress.
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress) return

    const checkAuth = async () => {
      try {
        // Loop detection: track rapid redirects to /signup
        const now = Date.now()
        const lastTs = parseInt(sessionStorage.getItem("storelib_signup_ts") || "0")
        const hitCount = parseInt(sessionStorage.getItem("storelib_signup_hits") || "0")

        if (now - lastTs < 6000) {
          const newHits = hitCount + 1
          sessionStorage.setItem("storelib_signup_hits", String(newHits))
          sessionStorage.setItem("storelib_signup_ts", String(now))

          if (newHits >= 3) {
            console.warn("[signup] Redirect loop detected, showing signup form")
            sessionStorage.removeItem("storelib_signup_hits")
            sessionStorage.removeItem("storelib_signup_ts")
            return
          }
        } else {
          sessionStorage.setItem("storelib_signup_hits", "1")
          sessionStorage.setItem("storelib_signup_ts", String(now))
        }

        const supabase = createClient()
        // Bounded, like every other session read the UI waits on — see
        // lib/auth/session-read.ts. A read that does not answer leaves the
        // signup form on screen, which is what somebody on /signup wanted
        // anyway; it must not leave a spinner.
        const { session } = await readSessionBounded(supabase, 4_000)
        const user = session?.user

        if (user) {
          /* Already signed in: the server decides where to (app/auth/continue). */
          setIsRedirecting(true)
          void goOnAfterAuth(carry, session)
          return
        }

        sessionStorage.removeItem("storelib_signup_hits")
        sessionStorage.removeItem("storelib_signup_ts")
      } catch (error) {
        console.error("Auth check error:", error)
      }
    }

    checkAuth()
  }, [router, authGateLoading, nativeAuthInProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail)
    }
  }, [prefilledEmail])

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!showPasswordField) {
      if (!email.trim()) {
        setError(t("auth.err_enter_email"))
        return
      }

      setIsContinueLoading(true)
      try {
        const origin = await lookupAccountOrigin(email)
        /**
         * SAY WHICH ACCOUNT THEY ALREADY HAVE, AND HOW TO GET INTO IT.
         *
         * The old pair of checks knew Google and knew passwords, so an email
         * registered through Sign in with Apple matched neither: signup
         * carried on, Supabase refused it, and the person was told something
         * generic about an account they could not find a way into.
         */
        if (origin?.exists) {
          const methods = (origin?.methods ?? []) as SignInMethod[]
          if (!methods.includes("email")) setGoogleOnlyEmail(email.trim().toLowerCase())
          setError(alreadyRegisteredHint(methods))
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

    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password

    if (trimmedPassword.length < 6) {
      setError(t("auth.err_password_min6"))
      setIsLoading(false)
      return
    }

    /**
     * The abuse guard, before an auth user exists to have to clean up.
     *
     * It fails open by contract — every error path inside it returns allow —
     * and it is wrapped here too, because a signup form that breaks when a
     * fetch does is a far worse outcome than a spammer getting through. The
     * containment layer is what actually removes their reason for coming; see
     * lib/seo/sitemaps.ts and lib/security/spam-signals.ts.
     */
    try {
      const guard = await fetch("/api/auth/signup-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          website: honeypot,
          elapsedMs: Date.now() - mountedAt.current,
        }),
      })
      if (guard.ok) {
        const verdict = await guard.json()
        if (verdict?.allow === false) {
          setError(
            verdict.reason === "email_not_accepted"
              ? t("auth.err_email_not_accepted")
              : verdict.reason === "too_many_signups"
                ? t("auth.err_too_many_signups")
                : t("auth.err_signup_unavailable"),
          )
          setIsLoading(false)
          return
        }
      }
    } catch {
      // Unreachable guard means no guard, not a broken signup.
    }

    try {
      // Sign up WITHOUT Supabase email confirmation.
      // "Confirm email" is DISABLED in Supabase dashboard so signUp()
      // creates a session immediately and Supabase sends ZERO emails.
      // We send our own branded 6-digit code via Mailgun instead
      // (from "Storelib <noreply@storelib.com>").
      const { error, data } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          data: { email_verified: false },
        },
      })
      if (error) throw error

      if (data.user) {
        // Create profile immediately (session exists because Supabase
        // email confirmation is disabled).
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: trimmedEmail,
          is_creator: false,
          email_verified: false,
          /* No creator or buyer question after sign up any more: a new account is a buyer. */
          welcome_completed: true,
        }, { onConflict: "id" })

        // Send branded verification code via SMTP
        try {
          await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: data.user.id,
              email: trimmedEmail,
            }),
          })
        } catch (verifyError) {
          console.error("Error sending verification code:", verifyError)
        }

        // Handle purchase claim flow
        if (claim === "1" && receiptToken) {
          try {
            await fetch("/api/purchases/claim", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ receiptToken }),
            })
          } catch (claimError) {
            console.error("Failed to claim purchase:", claimError)
          }
          navigateWithFallback(`/receipt/${receiptToken}`)
          router.refresh()
          return
        }

        // Redirect to verify page
        navigateWithFallback(
          withCarry(`/signup/verify?userId=${data.user.id}&email=${encodeURIComponent(trimmedEmail)}&sent=1`, carry)
        )
        router.refresh()
      }
    } catch (error: unknown) {
      /**
       * Supabase's own wording never reaches the form. The one case worth
       * naming is an account that already exists; everything else becomes a
       * sentence from the same classifier the OAuth routes use.
       */
      const msg = error instanceof Error ? error.message : ""
      const failure = classifyOAuthError({ message: msg })
      if (failure.code === "wrong_method") {
        setError(t("auth.err_email_registered"))
      } else {
        setError(failure.code === "unknown" ? t("auth.err_generic") : failure.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    // Prevent rapid clicks that could cause rate limiting
    if (isGoogleLoading) return
    // Single-flight lock: prevent double-tap from calling signInWithOAuth()
    // twice, which would overwrite the stored PKCE code-verifier and cause
    // "invalid flow state" on the callback.
    if ((window as any).__oauthStarting) return
    ;(window as any).__oauthStarting = true

    // Show the native loading overlay immediately — before any async work.
    // The signup page uses the web PKCE / bridge-token flow (StorelibWebViewClient
    // opens OAuth in a Chrome Custom Tab; the App Link /app/auth/callback brings
    // the user back into the WebView). Showing the overlay here ensures the native
    // shell covers the WebView for the entire OAuth journey.
    // In a regular browser this is a no-op.
    nativeAuthStart()

    const supabase = createClient()
    setIsGoogleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

    try {
      // Store redirect URL in both localStorage and cookie for OAuth callback
      // Cookie is more reliable for cross-subdomain OAuth flows
      if (redirectUrl) {
        const redirectData = {
          url: redirectUrl,
          pendingReview: pendingReview === "true",
          autoBuyer: autoBuyer === "1", // Auto-select buyer account type
        }
        const redirectDataStr = JSON.stringify(redirectData)
        localStorage.setItem("storelib_auth_redirect", redirectDataStr)

        // Also store in cookie for reliability (expires in 10 minutes)
        const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
        const isLocalhost = mainDomain.includes("localhost")
        let cookie = `storelib_auth_redirect=${encodeURIComponent(redirectDataStr)}; path=/; max-age=600; samesite=lax`
        if (!isLocalhost) {
          cookie += `; domain=.${mainDomain}; secure`
        }
        document.cookie = cookie
      }

      // If autoBuyer flag is set, pre-set user type as buyer
      if (autoBuyer === "1") {
        localStorage.setItem("storelib_user_type", "buyer")
        localStorage.setItem("storelib_welcome_shown", "true")
      }

      // Show full-page overlay immediately — the OAuth redirect is about to happen
      setIsGoogleRedirecting(true)

      // Route through /auth/start which handles PKCE cookie scoping correctly
      // (uses the actual request origin, not NEXT_PUBLIC_SITE_URL)
      const canonicalUrl = getCanonicalSiteUrl()
      window.location.href = `${canonicalUrl}${withCarry("/auth/start?provider=google", carry)}`
      return
    } catch (error: unknown) {
      setError(classifyOAuthError({ message: error instanceof Error ? error.message : null }, "google").message)
      ;(window as any).__oauthStarting = false
      setIsGoogleLoading(false)
      setIsGoogleRedirecting(false)
      // OAuth init failed — dismiss overlay so the form is interactive again.
      nativeAppReady()
    }
  }

  const handleAppleSignIn = async () => {
    if (isAppleLoading || (window as any).__appleOAuthStarting || (window as any).__oauthStarting) return
    ;(window as any).__appleOAuthStarting = true
    setIsAppleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

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
        const platform = Capacitor.getPlatform()
        const nativeCallbackUrl =
          platform === "ios"
            ? "com.storelib.app://auth/callback"
            : "storelib://auth/callback"

        const supabase = createClient()
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: nativeCallbackUrl,
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
          setError(t("auth.err_signin_timeout"))
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
          browserFinishedHandle = await Browser.addListener("browserFinished", () => {
            window.clearTimeout(timeoutId)
            browserFinishedHandle?.remove()
            window.setTimeout(() => {
              ;(window as any).__appleOAuthStarting = false
              setIsAppleLoading(false)
              nativeAppReady()
            }, 400)
          })
        } catch {
          // addListener may throw if plugin not loaded
        }

        nativeAuthStart()
        /* Why they came, for lib/native-oauth.ts to hand on once the deep link is back. */
        rememberNativeCarry(carry)
        await Browser.open({ url: data.url, windowName: "_self" })
        return
      } else {
        window.location.href = `${canonicalUrl}${withCarry("/auth/start?provider=apple", carry)}`
        return
      }
    } catch (err: unknown) {
      setError(classifyOAuthError({ message: err instanceof Error ? err.message : null }, "apple").message)
    }
    ;(window as any).__appleOAuthStarting = false
    setIsAppleLoading(false)
    setIsAppleRedirecting(false)
  }

  // Block rendering while auth state is resolving or redirect is in progress.
  if (authGateLoading || nativeAuthInProgress) {
    return <AuthResolvingScreen message={nativeAuthInProgress ? t("auth.signing_you_in") : undefined} />
  }

  if (isRedirecting || isGoogleRedirecting || isAppleRedirecting) {
    return <AuthResolvingScreen />
  }

  return (
    <div data-page="signup" className="flex min-h-svh w-full bg-white lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      <HtmlClass name="with-page-signup" />
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack auth-shell">
        <div className="mx-auto w-full max-w-[400px] py-2 sm:py-3 lg:py-4 animate-fade-in-up auth-card">
          <AuthLogo />

          <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">{t("auth.signup_title")}</h1>
          {/* Sell on Storelib: says the setup comes next, so nobody wonders whether the click was lost. */}
          <p className="mb-8 text-[15px] text-neutral-500">{t(carry.intent ? "auth.signup_subtitle_sell" : "auth.signup_subtitle")}</p>

          <form onSubmit={handleContinue} className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                type="email"
                placeholder={t("auth.email_placeholder")}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
              />
            </div>

            {/*
              The honeypot.

              Named "website" because that is a field a form-filler expects to
              find and expects to fill. Positioned off-screen rather than
              display:none — a display:none input is the oldest honeypot on the
              web and the better bots skip them, while an off-screen one still
              reads as a real field to anything walking the DOM.

              aria-hidden and tabIndex={-1} keep it away from screen readers and
              out of the tab order, so no human ever meets it. autoComplete off
              keeps a browser's own autofill from filling it in and locking a
              real person out of signing up, which is the one way this could
              misfire.
            */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />

            {showPasswordField && (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={t("auth.password_min6_placeholder")}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 pr-11 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Checkbox
                id="terms"
                checked={agreeToTerms}
                onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300"
              />
              <label htmlFor="terms" className="text-[13px] text-neutral-600 leading-tight cursor-pointer">
                {t("auth.agree_offers")}
              </label>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {googleOnlyEmail && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-800">{t("auth.email_linked_google")} <span className="font-medium">{googleOnlyEmail}</span>.</p>
              </div>
            )}

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-neutral-400 hover:bg-neutral-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || isContinueLoading}
              style={{
                backgroundColor: "#171717",
                color: "#fff",
              }}
            >
              {isLoading ? t("auth.creating_account") : isContinueLoading ? t("auth.checking") : t("auth.continue")}
            </Button>
          </form>

          <p className="mt-4 text-[12px] text-neutral-500 leading-relaxed">
            {/* Named after the button above it, which says Continue; and to the policy pages the footer links, not the old /legal stubs. */}
            {t("auth.by_clicking")} <strong>{t("auth.continue")}</strong>{t("auth.you_agree_storelib")}{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-neutral-700">
              {t("auth.privacy_notice")}
            </Link>
            ,{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-neutral-700">
              {t("auth.terms_short")}
            </Link>
            {/* Offers are the box above, which starts unticked: the sentence only says so once it is ticked. */}
            {agreeToTerms ? <> {t("auth.and_receive_updates")}</> : "."}
          </p>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-[13px] font-medium text-neutral-400">{t("auth.or")}</span>
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
              {isGoogleLoading ? t("auth.connecting") : t("auth.continue_with_google")}
            </Button>
            <AppleSignInButton
              onClick={handleAppleSignIn}
              isLoading={isAppleLoading}
              disabled={isGoogleLoading || isAppleLoading}
            />
          </div>

          <p className="mt-6 text-center text-[14px] text-neutral-500">
            {t("auth.have_account")}{" "}
            {/*
              CARRY THE RETURN TARGET ACROSS. Somebody who came here from a
              creator's shop, found they already had an account and went to
              log in would otherwise land on their dashboard and have to find
              their way back to the shop themselves.
            */}
            <Link href={loginHref} className="font-medium text-purple-600 hover:text-purple-700">
              {t("auth.log_in")}
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden bg-neutral-900">
        <Image
          src="https://storelib.com/media/platform%20images/collage%20imags/awapage.png"
          alt="Signup banner"
          fill
          className="object-cover object-center"
          sizes="(min-width: 1024px) 50vw, 0px"
          quality={75}
          priority
          fetchPriority="high"
          decoding="async"
        />
      </div>
    </div>
  )
}

function SignUpFormFallback() {
  return <AuthResolvingScreen />
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpFormFallback />}>
      <SignUpFormContent />
    </Suspense>
  )
}
