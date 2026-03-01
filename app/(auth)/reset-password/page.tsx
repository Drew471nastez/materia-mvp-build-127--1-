"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthLogo } from "@/components/auth/auth-logo"
import { Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

/**
 * Dismiss the native Android auth-loading overlay without importing the
 * whole native-oauth module (which has top-level browser side-effects).
 */
function notifyNativeAuthDone() {
  try {
    const w = window as any
    if (typeof window !== "undefined" && w.StorelibNative?.authDone) {
      w.StorelibNative.authDone()
    }
  } catch {}
}

// ─── token extraction helpers ────────────────────────────────────────────────

function parseHashTokens(hash: string) {
  const p = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash)
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    type: p.get("type"),
  }
}

function parseQueryTokens(search: string) {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  return {
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    code: p.get("code"),
    type: p.get("type"),
  }
}

/** Read tokens / code from the URL stored by the native appUrlOpen handler. */
function parseNativeRecoveryUrl(raw: string) {
  try {
    const u = new URL(raw)
    const fromQuery = parseQueryTokens(u.search)
    const fromHash = parseHashTokens(u.hash)
    return {
      access_token: fromQuery.access_token || fromHash.access_token,
      refresh_token: fromQuery.refresh_token || fromHash.refresh_token,
      code: fromQuery.code,
      type: fromQuery.type || fromHash.type,
    }
  } catch {
    return { access_token: null, refresh_token: null, code: null, type: null }
  }
}

// ─── component ───────────────────────────────────────────────────────────────

type Phase = "loading" | "form" | "success" | "expired"

function ResetPasswordContent() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("loading")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState("")
  const [showOpenInApp, setShowOpenInApp] = useState(false)
  // Store the deep link URL so the "Open in app" button can retry it
  const [deepLink, setDeepLink] = useState("")

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const native = isNativePlatform()

      // ── 1. Collect tokens / code from all sources ──────────────────────────
      // a) URL hash  →  #access_token=...&refresh_token=...&type=recovery
      const h = parseHashTokens(window.location.hash)
      // b) URL query →  ?access_token=... or ?code=... (PKCE)
      const q = parseQueryTokens(window.location.search)
      // c) sessionStorage — written by the native appUrlOpen handler
      let ss = { access_token: null as string | null, refresh_token: null as string | null, code: null as string | null, type: null as string | null }
      try {
        const raw = sessionStorage.getItem("nativeRecoveryUrl")
        if (raw) ss = parseNativeRecoveryUrl(raw)
      } catch {}

      const accessToken  = h.access_token  || q.access_token  || ss.access_token
      const refreshToken = h.refresh_token || q.refresh_token || ss.refresh_token
      const code         = q.code          || ss.code
      const recoveryType = h.type          || q.type          || ss.type

      // ── 2. Native Capacitor path ───────────────────────────────────────────
      if (native) {
        // Clear the native auth flags — this page owns the rest of the flow
        try { sessionStorage.removeItem("nativeAuthInProgress") } catch {}
        try { sessionStorage.removeItem("nativeRecoveryUrl") } catch {}
        notifyNativeAuthDone() // dismiss the Android loading overlay

        if (accessToken && refreshToken) {
          const { data, error: err } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (err || !data.session) { setPhase("expired"); return }
          setUserEmail(data.session.user.email ?? "")
          setPhase("form")
          return
        }

        if (code) {
          // PKCE: the native client has the code-verifier in Capacitor Preferences
          const { data, error: err } = await supabase.auth.exchangeCodeForSession(code)
          if (err || !data.session) { setPhase("expired"); return }
          setUserEmail(data.session.user.email ?? "")
          setPhase("form")
          return
        }

        // Fallback: maybe Supabase auto-detected the session already
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setUserEmail(session.user.email ?? "")
          setPhase("form")
          return
        }

        setPhase("expired")
        return
      }

      // ── 3. Web / mobile-browser path ──────────────────────────────────────
      //
      // If running in a mobile browser (not Capacitor) and we have tokens or a
      // PKCE code, try to open the native app via the storelib:// custom scheme.
      // Android will intercept it if the app is installed; if not, the 1200 ms
      // timer expires and we continue with the normal web reset flow below.
      const isMobile =
        typeof navigator !== "undefined" &&
        /android|iphone|ipad/i.test(navigator.userAgent)

      if (isMobile && (accessToken || code) && (recoveryType === "recovery" || code)) {
        const params = new URLSearchParams({ type: "recovery" })
        if (accessToken)  { params.set("access_token", accessToken); if (refreshToken) params.set("refresh_token", refreshToken) }
        if (code)          params.set("code", code)
        const link = `storelib://auth/callback?${params.toString()}`
        setDeepLink(link)

        // Attempt to open the native app
        window.location.href = link

        // Wait 1 200 ms — if the page is still visible, the app isn't installed
        await new Promise<void>(resolve => setTimeout(resolve, 1200))

        // Expose an "Open in Storelib" button for manual retry
        setShowOpenInApp(true)
      }

      // ── 4. Establish web session ───────────────────────────────────────────
      if (accessToken && refreshToken) {
        const { data, error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (err || !data.session) { setPhase("expired"); return }
        setUserEmail(data.session.user.email ?? "")
        setPhase("form")
        return
      }

      if (code) {
        // PKCE: browser client has the code-verifier in its own storage
        const { data, error: err } = await supabase.auth.exchangeCodeForSession(code)
        if (err || !data.session) { setPhase("expired"); return }
        setUserEmail(data.session.user.email ?? "")
        setPhase("form")
        return
      }

      // Last-chance: Supabase browser client may have auto-detected the session
      // (detectSessionInUrl is true by default for createBrowserClient)
      await new Promise<void>(resolve => setTimeout(resolve, 600))
      const { data: { session: existing } } = await supabase.auth.getSession()
      if (existing?.user) {
        setUserEmail(existing.user.email ?? "")
        setPhase("form")
        return
      }

      setPhase("expired")
    }

    init()
  }, [])

  // ── Password reset submission ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message || "Failed to reset password")
        return
      }
      setPhase("success")
      setTimeout(async () => {
        await supabase.auth.signOut()
        router.push("/login")
      }, 3000)
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // ── Render phases ─────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-neutral-400" />
          <p className="mt-4 text-[15px] text-neutral-500">Setting up your reset link…</p>
        </div>
      </div>
    )
  }

  if (phase === "success") {
    return (
      <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Password reset successfully
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            Your password has been updated. Redirecting to login…
          </p>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-400" />
        </div>
      </div>
    )
  }

  if (phase === "expired") {
    return (
      <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Link expired
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            This password reset link has expired or is invalid.
            Request a new one and click the link within 1 hour.
          </p>
          <Link href="/request">
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-neutral-200 text-[15px] font-medium text-purple-600 hover:bg-purple-50 hover:border-purple-200"
            >
              Request new link
            </Button>
          </Link>
          <div className="mt-4">
            <Link href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
              Back to log in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // phase === "form"
  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[440px] text-center">
        <AuthLogo />
        <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
          Reset your password
        </h1>
        {userEmail && (
          <p className="mb-8 text-[15px] text-neutral-500">
            Setting new password for{" "}
            <span className="font-medium text-neutral-700">{userEmail}</span>
          </p>
        )}

        {/* "Open in app" banner — shown on mobile browser after 1200 ms handoff attempt */}
        {showOpenInApp && deepLink && (
          <div className="mb-6 rounded-lg border border-purple-200 bg-purple-50 p-4 text-left">
            <p className="text-sm font-medium text-purple-900 mb-2">Have the Storelib app?</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => { window.location.href = deepLink }}
              className="h-9 text-sm border-purple-300 text-purple-700 hover:bg-purple-100"
            >
              Open in Storelib app
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 pr-12 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
          <p className="text-xs text-neutral-400 text-left pl-1">Minimum 8 characters</p>

          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
            minLength={8}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button
            type="submit"
            disabled={isLoading || !password.trim() || !confirmPassword.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? "Resetting…" : "Reset Password"}
          </Button>
        </form>

        <div className="mt-6">
          <Link href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
            Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
