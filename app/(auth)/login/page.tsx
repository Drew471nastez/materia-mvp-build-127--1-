"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense } from "react"
import Image from "next/image"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"

function LoginFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get redirect URL from search params (for returning to receipt page after login)
  const redirectUrl = searchParams.get("redirect")

  // Check if user is already authenticated - redirect to /explore if so
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // User is already logged in, redirect to explore
          router.replace("/explore")
          return
        }
      } catch (error) {
        // Ignore errors, just show the login form
        console.error("Auth check error:", error)
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
  }, [router])

  const pendingReview = searchParams.get("pendingReview")
  const autoBuyer = searchParams.get("autoBuyer") // Auto-select buyer account type (from receipt page)

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!showPasswordField) {
      if (!email.trim()) {
        setError("Please enter your email")
        return
      }
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
            router.push(`/verify-email?userId=${userData.id}&email=${encodeURIComponent(trimmedEmail)}`)
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
          router.push(finalUrl)
          router.refresh()
          return
        }

        // Check if user has completed the welcome selection
        const welcomeShown = localStorage.getItem("storelib_welcome_shown")

        if (!welcomeShown) {
          // User hasn't completed welcome selection - redirect to signup/success
          router.push("/signup/success")
          router.refresh()
          return
        }

        // Check if user has completed onboarding
        const { data: creator } = await supabase
          .from("creators")
          .select("id, onboarding_completed")
          .eq("user_id", data.user.id)
          .maybeSingle()

        if (creator) {
          if (creator.onboarding_completed === false) {
            router.push("/signup/success")
          } else {
            router.push("/app")
          }
        } else {
          // No creator record - check user type from localStorage
          const userType = localStorage.getItem("storelib_user_type")
          if (userType === "buyer") {
            router.push("/library")
          } else {
            // Default to signup/success for creators or unknown
            router.push("/signup/success")
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
    // Prevent rapid clicks that could cause rate limiting
    if (isGoogleLoading) return

    const supabase = createClient()
    setIsGoogleLoading(true)
    setError(null)

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

      // Use canonical site URL to ensure OAuth redirects to correct domain
      const canonicalUrl = getCanonicalSiteUrl()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${canonicalUrl}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to sign in with Google")
      setIsGoogleLoading(false)
    }
  }

  // Show loading while checking auth status
  if (isCheckingAuth) {
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
    <div className="flex min-h-svh w-full">
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-[400px]">
          <Link href="/" className="mb-12 inline-flex items-center gap-2">
            <img
              src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
              alt="Storelib"
              className="h-8 w-8"
            />
            <span className="text-xl font-bold tracking-tight text-neutral-900">Storelib</span>
          </Link>

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
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Logging in..." : "Continue"}
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
              className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50"
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

      <div className="relative hidden lg:block lg:w-1/2">
        <Image
          src="/images/design-mode/banner-login-desktop-D8selsDi.webp"
          alt="Login banner"
          fill
          className="object-cover"
          priority
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
