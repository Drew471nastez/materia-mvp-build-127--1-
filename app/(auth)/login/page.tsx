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
import { startNativeGoogleOAuth, cacheNativeHome } from "@/lib/native-bridge"
import { useNativeScrollLock } from "@/lib/use-native-scroll-lock"

async function resolveDestination(userId: string): Promise<string> {
  const supabase = createClient()
  const { data: creator } = await supabase
    .from("creators")
    .select("id, onboarding_completed")
    .eq("user_id", userId)
    .maybeSingle()
  if (creator?.onboarding_completed) return "/app"
  if (creator) return "/signup/success"
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_creator, welcome_completed")
    .eq("id", userId)
    .maybeSingle()
  if (!profile?.welcome_completed) return "/signup/success"
  return profile.is_creator ? "/app" : "/library"
}

function LoginFormContent() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [showPasswordField, setShowPasswordField] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [googleOnlyEmail, setGoogleOnlyEmail] = useState<string | null>(null)
  const { loading: authGateLoading, session: gateSession, nativeAuthInProgress } = useAuthGate()
  useNativeScrollLock()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectUrl = searchParams.get("redirect")

  // Show OAuth errors forwarded via query param
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress) return
    const oauthError = searchParams.get("error")
    if (oauthError) {
      setError(oauthError)
      setIsGoogleLoading(false)
    }
  }, [authGateLoading, nativeAuthInProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect already-authenticated users
  useEffect(() => {
    if (authGateLoading || nativeAuthInProgress || !gateSession) return

    // Loop detection
    const now = Date.now()
    const lastTs = parseInt(sessionStorage.getItem("storelib_login_ts") || "0")
    const hitCount = parseInt(sessionStorage.getItem("storelib_login_hits") || "0")
    if (now - lastTs < 6000) {
      const newHits = hitCount + 1
      sessionStorage.setItem("storelib_login_hits", String(newHits))
      sessionStorage.setItem("storelib_login_ts", String(now))
      if (newHits >= 3) {
        sessionStorage.removeItem("storelib_login_hits")
        sessionStorage.removeItem("storelib_login_ts")
        return
      }
    } else {
      sessionStorage.setItem("storelib_login_hits", "1")
      sessionStorage.setItem("storelib_login_ts", String(now))
    }

    setIsRedirecting(true)
    resolveDestination(gateSession.user.id)
      .then((dest) => {
        if (dest === "/app" || dest === "/library") cacheNativeHome(dest)
        router.replace(redirectUrl || dest)
      })
      .catch(() => setIsRedirecting(false))
  }, [authGateLoading, nativeAuthInProgress, gateSession, router, redirectUrl])

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
      if (origin?.googleOnly) {
        setGoogleOnlyEmail(email.trim().toLowerCase())
        setError("This account was created with Google. Use 'Continue with Google' to sign in.")
        return
      }
      setGoogleOnlyEmail(null)
      setShowPasswordField(true)
      setError(null)
      return
    }

    setIsLoading(true)
    setError(null)
    const supabase = createClient()
    const trimmedEmail = email.trim().toLowerCase()

    try {
      const origin = await lookupAccountOrigin(trimmedEmail)
      if (origin?.googleOnly) {
        setGoogleOnlyEmail(trimmedEmail)
        setError("No password for this account. Use 'Continue with Google'.")
        setIsLoading(false)
        return
      }

      const { error: signInError, data } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (signInError) {
        if (signInError.message.includes("Email not confirmed")) {
          const { data: pd } = await supabase.from("profiles").select("id").eq("email", trimmedEmail).single()
          if (pd) router.push(`/signup/verify?userId=${pd.id}&email=${encodeURIComponent(trimmedEmail)}`)
          return
        }
        throw signInError
      }

      if (!data.user) throw new Error("No user returned")

      // Check email verification
      const { data: profile } = await supabase
        .from("profiles")
        .select("email_verified, is_creator, welcome_completed")
        .eq("id", data.user.id)
        .maybeSingle()

      if (profile && !profile.email_verified) {
        try {
          await fetch("/api/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: data.user.id, email: trimmedEmail }),
          })
        } catch {}
        router.push(`/signup/verify?userId=${data.user.id}&email=${encodeURIComponent(trimmedEmail)}`)
        setIsLoading(false)
        return
      }

      const dest = await resolveDestination(data.user.id)
      if (dest === "/app" || dest === "/library") cacheNativeHome(dest)
      setIsRedirecting(true)
      router.push(redirectUrl || dest)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid email or password"
      setError(msg.includes("Invalid login credentials") ? "Invalid email or password" : msg)
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
      window.location.href = `${window.location.origin}/auth/start?provider=google&next=/app`
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
  if (isRedirecting || gateSession) {
    return <AuthResolvingScreen />
  }

  return (
    <div className="min-h-svh w-full flex items-start justify-center px-6 py-10" style={{ backgroundColor: "#f8f8f8" }}>
      <div className="w-full max-w-[400px]">
        <AuthLogo />

        <h1 className="mb-2 text-[28px] font-bold tracking-tight text-neutral-900">Welcome back</h1>
        <p className="mb-8 text-[15px] text-neutral-500">Log in to your account</p>

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
                placeholder="Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              <p className="text-xs text-blue-800">Use Google sign-in for <span className="font-medium">{googleOnlyEmail}</span>.</p>
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
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthResolvingScreen />}>
      <LoginFormContent />
    </Suspense>
  )
}
