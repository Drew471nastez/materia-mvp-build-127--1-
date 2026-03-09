"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect, Suspense } from "react"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { AuthLogo } from "@/components/auth/auth-logo"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { useAuthGate } from "@/lib/use-auth-gate"
import { startNativeGoogleOAuth } from "@/lib/native-bridge"
import { useNativeScrollLock } from "@/lib/use-native-scroll-lock"

function SignUpFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [googleOnlyEmail, setGoogleOnlyEmail] = useState<string | null>(null)
  const { loading: authGateLoading, nativeAuthInProgress } = useAuthGate()
  useNativeScrollLock()
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledEmail = searchParams.get("email")
  const redirectUrl = searchParams.get("redirect")
  const claim = searchParams.get("claim")
  const receiptToken = searchParams.get("receiptToken")

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail)
  }, [prefilledEmail])

  // Redirect already-authenticated users
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress) return
    const checkAuth = async () => {
      try {
        // Loop detection
        const now = Date.now()
        const lastTs = parseInt(sessionStorage.getItem("storelib_signup_ts") || "0")
        const hitCount = parseInt(sessionStorage.getItem("storelib_signup_hits") || "0")
        if (now - lastTs < 6000) {
          const newHits = hitCount + 1
          sessionStorage.setItem("storelib_signup_hits", String(newHits))
          sessionStorage.setItem("storelib_signup_ts", String(now))
          if (newHits >= 3) {
            sessionStorage.removeItem("storelib_signup_hits")
            sessionStorage.removeItem("storelib_signup_ts")
            return
          }
        } else {
          sessionStorage.setItem("storelib_signup_hits", "1")
          sessionStorage.setItem("storelib_signup_ts", String(now))
        }
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          router.replace("/signup/success")
        } else {
          sessionStorage.removeItem("storelib_signup_hits")
          sessionStorage.removeItem("storelib_signup_ts")
        }
      } catch (err) {
        console.error("Auth check error:", err)
      }
    }
    checkAuth()
  }, [router, authGateLoading, nativeAuthInProgress])

  const lookupAccountOrigin = async (rawEmail: string) => {
    const res = await fetch("/api/auth/account-origin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: rawEmail.trim().toLowerCase() }),
    })
    if (!res.ok) return null
    return res.json()
  }

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!showPasswordField) {
      if (!email.trim()) { setError("Please enter your email"); return }
      const origin = await lookupAccountOrigin(email)
      if (origin?.exists && origin?.googleOnly) {
        setGoogleOnlyEmail(email.trim().toLowerCase())
        setError("This email already exists via Google. Use 'Continue with Google' instead.")
        return
      }
      if (origin?.exists && origin?.passwordEnabled) {
        setError("An account with this email already exists. Please log in.")
        return
      }
      setGoogleOnlyEmail(null)
      setShowPasswordField(true)
      setError(null)
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    setIsLoading(true)
    setError(null)
    const supabase = createClient()
    const trimmedEmail = email.trim().toLowerCase()

    try {
      const { error: signUpError, data } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { email_verified: false } },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error("No user returned")

      await supabase.from("profiles").upsert({
        id: data.user.id,
        email: trimmedEmail,
        is_creator: false,
        email_verified: false,
        welcome_completed: false,
      }, { onConflict: "id" })

      try {
        await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id, email: trimmedEmail }),
        })
      } catch {}

      // Handle purchase claim flow
      if (claim === "1" && receiptToken) {
        try {
          await fetch("/api/purchases/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiptToken }),
          })
        } catch {}
        setIsRedirecting(true)
        router.push(`/receipt/${receiptToken}`)
        return
      }

      setIsRedirecting(true)
      router.replace(`/signup/verify?userId=${data.user.id}&email=${encodeURIComponent(trimmedEmail)}&sent=1`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred"
      setError(msg.toLowerCase().includes("already registered")
        ? "This email is already registered. Please log in or use Google."
        : msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    if (isGoogleLoading || (window as any).__oauthStarting) return
    ;(window as any).__oauthStarting = true
    setIsGoogleLoading(true)
    setError(null)
    setGoogleOnlyEmail(null)

    try {
      const { Capacitor } = await import("@capacitor/core")
      if (Capacitor.isNativePlatform()) {
        const supabase = createClient()
        await startNativeGoogleOAuth(supabase)
        // Loading cleared by NativeAuthHandler after OAuth completes
        return
      }
      // Web
      if (redirectUrl) {
        localStorage.setItem("storelib_auth_redirect", JSON.stringify({ url: redirectUrl }))
      }
      window.location.href = `${window.location.origin}/auth/start?provider=google&next=/signup/success`
      return
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in with Google")
    }
    ;(window as any).__oauthStarting = false
    setIsGoogleLoading(false)
  }

  if (authGateLoading || nativeAuthInProgress) {
    return <AuthResolvingScreen message={nativeAuthInProgress ? "Signing you in..." : undefined} />
  }
  if (isRedirecting) {
    return <AuthResolvingScreen />
  }

  return (
    <div className="min-h-svh w-full flex items-start justify-center px-6 py-10" style={{ backgroundColor: "#f8f8f8" }}>
      <div className="w-full max-w-[400px]">
        <AuthLogo />

        <h1 className="mb-2 text-[28px] font-bold tracking-tight text-neutral-900">Create your account</h1>
        <p className="mb-8 text-[15px] text-neutral-500">Sign up for free!</p>

        {/* Google */}
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          disabled={isGoogleLoading}
          className="h-12 w-full rounded-xl border border-[#e0e0e0] bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer disabled:opacity-70 mb-4"
        >
          {isGoogleLoading ? (
            <Loader2 className="mr-3 h-5 w-5 animate-spin text-neutral-500" />
          ) : (
            <svg className="mr-3 h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
          )}
          {isGoogleLoading ? "Connecting..." : "Continue with Google"}
        </Button>

        <div className="my-5 flex items-center gap-4">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-[13px] font-medium text-neutral-400">OR</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        {/* Email form */}
        <form onSubmit={handleContinue} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="h-12 rounded-xl border border-[#e0e0e0] bg-white px-4 py-3.5 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:ring-0"
          />

          {showPasswordField && (
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Password (min 6 characters)"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="h-12 rounded-xl border border-[#e0e0e0] bg-white px-4 py-3.5 pr-11 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:ring-0"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          {googleOnlyEmail && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-800">This email is linked to Google: <span className="font-medium">{googleOnlyEmail}</span>.</p>
            </div>
          )}

          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-[15px] font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#7c3aed" }}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Continue"}
          </Button>
        </form>

        <p className="mt-4 text-[12px] text-neutral-500 leading-relaxed">
          By continuing, you agree to Storelib&apos;s{" "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-neutral-700">privacy notice</Link>
          {" "}and{" "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-neutral-700">terms</Link>.
        </p>

        <p className="mt-6 text-center text-[14px] text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-purple-600 hover:text-purple-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthResolvingScreen />}>
      <SignUpFormContent />
    </Suspense>
  )
}
