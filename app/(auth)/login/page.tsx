"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense, useRef } from "react"
import { Eye, EyeOff } from "lucide-react"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"
import Image from "next/image"
import { AuthLogo } from "@/components/auth/auth-logo"

function LoginFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isContinueLoading, setIsContinueLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [googleOnlyEmail, setGoogleOnlyEmail] = useState<string | null>(null)
  const redirectTimeoutRef = useRef<number | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  const navigateWithFallback = (url: string) => {
    setIsRedirecting(true)
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

  // Get redirect URL from search params (for returning to receipt page after login)
  const redirectUrl = searchParams.get("redirect")

  // Show any OAuth error forwarded by CapacitorAuthHandler via /login?error=...
  // (e.g. exchangeCodeForSession failure, user cancelled consent)
  useEffect(() => {
    const oauthError = searchParams.get("error")
    if (oauthError) {
      setError(oauthError)
      setIsGoogleLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if user is already authenticated - redirect if so
  // Includes loop detection to prevent infinite redirect cycles
  useEffect(() => {
    // Safety net: if the session check somehow stalls, show the form after 1.5 s.
    const safetyTimer = window.setTimeout(() => setIsCheckingAuth(false), 1500)

    const checkAuth = async () => {
      try {
        // Loop detection: track rapid redirects to /login
        const now = Date.now()
        const lastTs = parseInt(sessionStorage.getItem("storelib_login_ts") || "0")
        const hitCount = parseInt(sessionStorage.getItem("storelib_login_hits") || "0")

        if (now - lastTs < 6000) {
          const newHits = hitCount + 1
          sessionStorage.setItem("storelib_login_hits", String(newHits))
          sessionStorage.setItem("storelib_login_ts", String(now))

          // If we've landed on /login 3+ times within 6s, we're in a loop
          if (newHits >= 3) {
            console.warn("[login] Redirect loop detected, showing login form")
            sessionStorage.removeItem("storelib_login_hits")
            sessionStorage.removeItem("storelib_login_ts")
            setIsCheckingAuth(false)
            return
          }
        } else {
          sessionStorage.setItem("storelib_login_hits", "1")
          sessionStorage.setItem("storelib_login_ts", String(now))
        }

        // getSession() reads from localStorage — no network call for unauthenticated users,
        // so the check completes in milliseconds instead of waiting for a round-trip.
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user

        if (user) {
          // Redirect based on user type: creator/seller → /app, buyer → /library
          const { data: creatorRow } = await supabase
            .from("creators")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle()

          if (creatorRow) {
            router.replace("/app")
          } else {
            const { data: profile } = await supabase
              .from("profiles")
              .select("is_creator")
              .eq("id", user.id)
              .maybeSingle()
            router.replace(profile?.is_creator ? "/app" : "/library")
          }
          return
        }

        // No active session - clear loop counter
        sessionStorage.removeItem("storelib_login_hits")
        sessionStorage.removeItem("storelib_login_ts")
      } catch (error) {
        // Ignore errors, just show the login form
        console.error("Auth check error:", error)
      } finally {
        window.clearTimeout(safetyTimer)
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
    return () => window.clearTimeout(safetyTimer)
  }, [router])

  // On native (Capacitor), listen for auth state changes so that when
  // CapacitorAuthHandler exchanges the OAuth code and a session appears,
  // we immediately clear "Connecting…" and let window.location.assign
  // in the handler take over.  On web this is a no-op because the page
  // navigates away as part of the OAuth redirect before this fires.
  useEffect(() => {
    if (typeof window === "undefined") return
    // Only attach on native — on web the OAuth redirect unmounts this page
    const isNative =
      typeof (window as any).Capacitor?.isNativePlatform === "function" &&
      (window as any).Capacitor.isNativePlatform()
    if (!isNative) return

    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          // Session established — clear the Google loading spinner.
          // CapacitorAuthHandler will call window.location.assign("/app")
          // right after, so this just prevents a stuck "Connecting…" state.
          setIsGoogleLoading(false)
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current && typeof window !== "undefined") {
        window.clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [])

  const pendingReview = searchParams.get("pendingReview")
  const autoBuyer = searchParams.get("autoBuyer") // Auto-select buyer account type (from receipt page)

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

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!showPasswordField) {
      if (!email.trim()) {
        setError("Please enter your email")
        return
      }

      setIsContinueLoading(true)
      try {
        const origin = await lookupAccountOrigin(email)
        if (origin?.googleOnly) {
          setGoogleOnlyEmail(email.trim().toLowerCase())
          setShowPasswordField(false)
          setError("This account was created with Google. Continue with Google to sign in.")
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

    try {
      const origin = await lookupAccountOrigin(trimmedEmail)
      if (origin?.googleOnly) {
        setGoogleOnlyEmail(trimmedEmail)
        setError("No password exists for this account. Continue with Google.")
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
          // User hasn't verified email, send them to verify page
          // First get the user ID
          const { data: userData } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", trimmedEmail)
            .single()

          if (userData) {
            navigateWithFallback(`/verify-email?userId=${userData.id}&email=${encodeURIComponent(trimmedEmail)}`)
            router.refresh()
            return
          }
        }
        throw error
      }

      if (data.user) {
        // PRIORITY: If there's a redirect URL, use it (e.g., returning to receipt page)
        if (redirectUrl) {
          // Add pendingReview param if it was set
          let finalUrl = redirectUrl
          if (pendingReview === "true" && !finalUrl.includes("pendingReview")) {
            finalUrl += (finalUrl.includes("?") ? "&" : "?") + "pendingReview=true"
          }
          // Clear the stored redirect
          localStorage.removeItem("storelib_auth_redirect")
          navigateWithFallback(finalUrl)
          router.refresh()
          return
        }

        // Use database as source of truth for routing (not localStorage)
        const { data: creator } = await supabase
          .from("creators")
          .select("id, onboarding_completed")
          .eq("user_id", data.user.id)
          .maybeSingle()

        if (creator) {
          localStorage.setItem("storelib_welcome_shown", "true")
          if (creator.onboarding_completed === false) {
            navigateWithFallback("/signup/success")
          } else {
            navigateWithFallback("/app")
          }
        } else {
          // No creator record - check profile for buyer status
          const { data: profile } = await supabase
            .from("profiles")
            .select("welcome_completed, is_creator")
            .eq("id", data.user.id)
            .maybeSingle()

          if (profile?.welcome_completed) {
            localStorage.setItem("storelib_welcome_shown", "true")
            if (profile.is_creator === false) {
              navigateWithFallback("/library")
            } else {
              navigateWithFallback("/app")
            }
          } else {
            // Truly needs welcome selection
            navigateWithFallback("/signup/success")
          }
        }
        router.refresh()
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
    setIsGoogleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

    try {
      const canonicalUrl = getCanonicalSiteUrl()

      // Dynamic import — @capacitor/core is already bundled in the native build
      const { Capacitor } = await import("@capacitor/core")

      if (Capacitor.isNativePlatform()) {
        // ── Native (Android) ─────────────────────────────────────────
        // 1. signInWithOAuth with skipBrowserRedirect stores the PKCE
        //    code-verifier in localStorage in this WebView context.
        // 2. Browser.open() opens the OAuth URL in the system browser
        //    (Chrome Custom Tab). windowName "_self" ensures it renders
        //    inside the app's task and doesn't open a new window.
        // 3. After OAuth, Google redirects to storelib://auth/callback.
        //    Android intercepts → onNewIntent → AppPlugin.handleOnNewIntent
        //    fires appUrlOpen → CapacitorAuthHandler calls
        //    exchangeCodeForSession(code) using the PKCE verifier in
        //    localStorage, then navigates to /app or /library.
        // 4. Safety nets below ensure loading state always clears:
        //    - browserFinished fires if the user dismisses the browser early.
        //    - A 20 s timeout clears loading if nothing else fires first.
        const supabase = createClient()
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            // Redirect to the Vercel server route so it can identify this as
            // a native Capacitor request and send tokens back via deep link.
            // ?native=true is the reliable signal — Chrome Custom Tabs do NOT
            // propagate the custom WebView User-Agent, so UA detection alone
            // would silently fail. The query param is always preserved through
            // the Google OAuth redirect back to this URL.
            redirectTo: `${canonicalUrl}/auth/callback?native=true`,
            queryParams: { access_type: "offline", prompt: "consent" },
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
          setIsGoogleLoading(false)
          setError("Sign in timed out. Please try again.")
        }, 20_000)

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
                setIsGoogleLoading(false)
              }, 400)
            }
          )
        } catch {
          // addListener may throw if the plugin isn't loaded — ignore
        }

        await Browser.open({ url: data.url, windowName: "_self" })

        // isGoogleLoading stays true while the browser is open.
        // It will be cleared by one of: CapacitorAuthHandler navigation,
        // browserFinished, or the 20 s timeout above.
        return // avoid the finally setIsGoogleLoading(false) below
      } else {
        // ── Web ───────────────────────────────────────────────────────
        window.location.href = `${canonicalUrl}/auth/start?provider=google&next=/app`
        return
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Google")
    }
    setIsGoogleLoading(false)
  }

  // Show loading while checking auth status
  if (isCheckingAuth || isRedirecting) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
          <p className="mt-4 text-neutral-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack">
        <div className="mx-auto w-full max-w-[400px] py-2 sm:py-3 lg:py-4 animate-fade-in-up">
          <AuthLogo />

          <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">Welcome back</h1>
          <p className="mb-8 text-[15px] text-neutral-500">Log in to your account</p>

          <form onSubmit={handleContinue} className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                type="email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
              />
            </div>

            {showPasswordField && (
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    id="password"
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
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            {googleOnlyEmail && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-800">Use Google sign-in for <span className="font-medium">{googleOnlyEmail}</span>.</p>
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
              disabled={isGoogleLoading}
              className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
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
              {isGoogleLoading ? "Connecting..." : "Continue with Google"}
            </Button>
          </div>

          <div className="mt-4 text-center">
            <Link href="/request" className="text-[13px] text-neutral-400 hover:text-neutral-600">
              Forgot password?
            </Link>
          </div>

          <p className="mt-6 text-center text-[14px] text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-purple-600 hover:text-purple-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden bg-neutral-900">
        <Image
          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/eemo.png"
          alt="Login banner"
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

function LoginFormFallback() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
        <p className="mt-4 text-neutral-500">Loading...</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginFormContent />
    </Suspense>
  )
}
