"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense, useRef } from "react"
import { Eye, EyeOff } from "lucide-react"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"
import Image from "next/image"
import { AuthLogo } from "@/components/auth/auth-logo"

function SignUpFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agreeToTerms, setAgreeToTerms] = useState(false)
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
  const claim = searchParams.get("claim")
  const receiptToken = searchParams.get("receiptToken")
  const prefilledEmail = searchParams.get("email")
  // Get redirect URL from search params (for returning to receipt page after signup)
  const redirectUrl = searchParams.get("redirect")
  const pendingReview = searchParams.get("pendingReview")
  const autoBuyer = searchParams.get("autoBuyer") // Auto-select buyer account type (from receipt page)

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
  // Includes loop detection to prevent infinite redirect cycles
  useEffect(() => {
    // Safety net: if the network hangs and getUser() never resolves,
    // show the form after 4 s rather than spinning forever.
    const safetyTimer = window.setTimeout(() => setIsCheckingAuth(false), 4000)

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
            setIsCheckingAuth(false)
            return
          }
        } else {
          sessionStorage.setItem("storelib_signup_hits", "1")
          sessionStorage.setItem("storelib_signup_ts", String(now))
        }

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          router.replace("/explore")
          return
        }

        sessionStorage.removeItem("storelib_signup_hits")
        sessionStorage.removeItem("storelib_signup_ts")
      } catch (error) {
        console.error("Auth check error:", error)
      } finally {
        window.clearTimeout(safetyTimer)
        setIsCheckingAuth(false)
      }
    }

    checkAuth()
    return () => window.clearTimeout(safetyTimer)
  }, [router])

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
        setError("Please enter your email")
        return
      }

      setIsContinueLoading(true)
      try {
        const origin = await lookupAccountOrigin(email)
        if (origin?.exists && origin?.googleOnly) {
          setGoogleOnlyEmail(email.trim().toLowerCase())
          setError("This email already exists via Google. Continue with Google instead.")
          return
        }
        if (origin?.exists && origin?.passwordEnabled) {
          setError("An account with this email already exists. Please log in.")
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
      setError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

    try {
      // Sign up WITHOUT email confirmation from Supabase
      // We handle our own verification with 6-digit code
      const { error, data } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          // Don't require Supabase email confirmation
          emailRedirectTo: undefined,
          data: {
            email_verified: false, // We track this ourselves
          }
        },
      })
      if (error) throw error

      if (data.user) {
        // Create profile with email_verified = false
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          email: trimmedEmail,
          is_creator: false,
          email_verified: false,
        })

        if (profileError) {
          console.error("Profile creation error:", profileError)
        }

        // Send our custom verification code via Resend
        try {
          const verifyRes = await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: data.user.id,
              email: trimmedEmail,
            }),
          })

          if (!verifyRes.ok) {
            console.error("Failed to send verification code")
          }
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

        // Redirect to verify email page with sent=1 flag
        // Include redirect URL if present for post-verification redirect
        let verifyUrl = `/verify-email?userId=${data.user.id}&email=${encodeURIComponent(trimmedEmail)}&sent=1`
        if (redirectUrl) {
          verifyUrl += `&redirect=${encodeURIComponent(redirectUrl)}`
        }
        if (pendingReview === "true") {
          verifyUrl += `&pendingReview=true`
        }
        navigateWithFallback(verifyUrl)
        router.refresh()
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "An error occurred"
      if (msg.toLowerCase().includes("already registered")) {
        setError("This email is already registered. Please log in or continue with Google.")
      } else {
        setError(msg)
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

          <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">Join Storelib</h1>
          <p className="mb-8 text-[15px] text-neutral-500">Sign up for free!</p>

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
                    placeholder="Password (min 6 characters)"
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
                I agree to receive offers, news and updates from Storelib.
              </label>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            {googleOnlyEmail && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-800">This email is linked to Google sign-in: <span className="font-medium">{googleOnlyEmail}</span>.</p>
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
              {isLoading ? "Creating account..." : isContinueLoading ? "Checking..." : "Continue"}
            </Button>
          </form>

          <p className="mt-4 text-[12px] text-neutral-500 leading-relaxed">
            By clicking <strong>Create account</strong>, you agree to Storelib&apos;s{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-neutral-700">
              privacy notice
            </Link>
            ,{" "}
            <Link href="/legal/terms" className="underline underline-offset-2 hover:text-neutral-700">
              T&Cs
            </Link>{" "}
            and to receive offers, news and updates.
          </p>

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

          <p className="mt-6 text-center text-[14px] text-neutral-500">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-purple-600 hover:text-purple-700">
              Log in
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden bg-neutral-900">
        <Image
          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/awapage.png"
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
  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
        <p className="mt-4 text-neutral-500">Loading...</p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<SignUpFormFallback />}>
      <SignUpFormContent />
    </Suspense>
  )
}
