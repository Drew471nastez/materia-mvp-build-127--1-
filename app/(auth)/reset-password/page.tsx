"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { isNativeApp } from "@/lib/platform-utils"
import { notifyNativeAuthDone } from "@/lib/native-oauth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react"
import { AuthLogo } from "@/components/auth/auth-logo"
import { useLocale } from "@/components/locale-provider"
import { isAuthInProgress, setAuthInProgress } from "@/lib/auth/auth-in-progress"

/**
 * Detect if running in a mobile browser (NOT inside Capacitor WebView).
 * Used to decide whether to attempt app handoff via deep link.
 */
function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Parse recovery tokens from multiple sources:
 * 1. URL hash fragment (#access_token=...&refresh_token=...&type=recovery)
 * 2. URL query params (fallback)
 * 3. sessionStorage.nativeRecoveryUrl (set by native deep link handler)
 */
function parseRecoveryTokens(): {
  accessToken: string | null
  refreshToken: string | null
  type: string | null
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, type: null }
  }

  // Source 1: URL hash fragment (primary — Supabase recovery redirect)
  const hash = window.location.hash.substring(1)
  if (hash) {
    const hashParams = new URLSearchParams(hash)
    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")
    const type = hashParams.get("type")
    if (accessToken && refreshToken) {
      return { accessToken, refreshToken, type }
    }
  }

  // Source 2: URL query params (rare fallback)
  const searchParams = new URLSearchParams(window.location.search)
  const qAccessToken = searchParams.get("access_token")
  const qRefreshToken = searchParams.get("refresh_token")
  const qType = searchParams.get("type")
  if (qAccessToken && qRefreshToken) {
    return { accessToken: qAccessToken, refreshToken: qRefreshToken, type: qType }
  }

  // Source 3: sessionStorage from native deep link handler
  try {
    const nativeRecoveryUrl = sessionStorage.getItem("nativeRecoveryUrl")
    if (nativeRecoveryUrl) {
      sessionStorage.removeItem("nativeRecoveryUrl")
      // The URL might use custom scheme or HTTPS — parse params from query string
      const url = new URL(nativeRecoveryUrl)
      const accessToken = url.searchParams.get("access_token")
      const refreshToken = url.searchParams.get("refresh_token")
      const type = url.searchParams.get("type")
      if (accessToken && refreshToken) {
        return { accessToken, refreshToken, type }
      }
    }
  } catch {
    // sessionStorage not available or invalid URL
  }

  return { accessToken: null, refreshToken: null, type: null }
}

/**
 * Exchange a bridge code (?code= query param) for recovery tokens.
 * This is the PRIMARY flow: email links use ?code=<bridge_code> which is
 * a query param (never stripped by email clients, unlike hash fragments).
 * The API verifies the code server-side and returns fresh tokens.
 */
async function exchangeBridgeCode(code: string): Promise<{
  accessToken: string | null
  refreshToken: string | null
  error: string | null
}> {
  try {
    const res = await fetch("/api/auth/exchange-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      return { accessToken: null, refreshToken: null, error: data.error || "Invalid reset code" }
    }
    return { accessToken: data.access_token, refreshToken: data.refresh_token, error: null }
  } catch {
    return { accessToken: null, refreshToken: null, error: "Network error. Please try again." }
  }
}

/**
 * Dismiss native auth loading overlay and clear the nativeAuthInProgress flag.
 * Called when the reset-password page is ready to display content.
 */
function dismissNativeOverlay() {
  notifyNativeAuthDone()
  setAuthInProgress(false)
}

type Phase = "initializing" | "handoff" | "form" | "success" | "expired"

function ResetPasswordContent() {
  const { t } = useLocale()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("initializing")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>("")
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [pendingBridgeCode, setPendingBridgeCode] = useState<string | null>(null)
  const initRef = useRef(false)

  const establishSessionAndShowForm = useCallback(
    async (accessToken: string, refreshToken: string) => {
      try {
        const supabase = createClient()

        // Set the recovery session
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          console.error("[ResetPassword] setSession error:", sessionError.message)
          setPhase("expired")
          setError(t("auth.err_link_expired_invalid"))
          dismissNativeOverlay()
          return
        }

        if (data?.user?.email) {
          setUserEmail(data.user.email)
        }

        // Clear the hash from the URL so tokens aren't exposed in browser history
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname)
        }

        setPhase("form")
        dismissNativeOverlay()
      } catch (err) {
        console.error("[ResetPassword] Unexpected error:", err)
        setPhase("expired")
        setError(t("auth.err_something_wrong_reset"))
        dismissNativeOverlay()
      }
    },
    [t]
  )

  // Main initialization — parse tokens and decide on flow
  useEffect(() => {
    // Prevent double-init in React Strict Mode
    if (initRef.current) return
    initRef.current = true

    const init = async () => {
      const searchParams = new URLSearchParams(window.location.search)
      const bridgeCode = searchParams.get("code")
      const isInCapacitor = isNativePlatform() || isNativeApp()

      // ── PRIMARY FLOW: Bridge code (?code= query param) ─────────────
      // Email links now use ?code=<bridge_code> which survives all email
      // client proxies (Gmail, Outlook SafeLinks, etc.).
      if (bridgeCode) {
        console.log("[ResetPassword] Bridge code detected — exchanging for tokens")

        // On mobile browser: try to hand off to the native app first
        if (isMobileBrowser() && !isInCapacitor) {
          // Build a deep link that includes the bridge code for the app
          const appLink = `storelib://reset-password?code=${encodeURIComponent(bridgeCode)}`
          setDeepLink(appLink)
          setPendingBridgeCode(bridgeCode)
          setPhase("handoff")
          window.location.href = appLink

          // Wait 6 s before falling back to browser exchange.
          // The longer window prevents the race where the Android/iOS "Open in
          // app?" prompt is still visible when the timer fires — which would
          // consume the one-time bridge code BEFORE the native app can use it,
          // causing "link expired" inside the app.
          const timer = setTimeout(async () => {
            // App not installed — continue in browser
            const result = await exchangeBridgeCode(bridgeCode)
            if (result.error || !result.accessToken || !result.refreshToken) {
              setPhase("expired")
              setError(result.error || t("auth.err_link_expired"))
              dismissNativeOverlay()
            } else {
              await establishSessionAndShowForm(result.accessToken, result.refreshToken)
            }
          }, 6000)

          // Cancel the auto-fallback when user taps "Allow" and leaves the page
          const cancelTimer = () => clearTimeout(timer)
          document.addEventListener("visibilitychange", () => { if (document.hidden) cancelTimer() })
          window.addEventListener("pagehide", cancelTimer, { once: true })
          return () => {
            cancelTimer()
          }
        }

        // Inside Capacitor or desktop browser — exchange directly
        const result = await exchangeBridgeCode(bridgeCode)
        if (result.error || !result.accessToken || !result.refreshToken) {
          setPhase("expired")
          setError(result.error || t("auth.err_link_expired"))
          dismissNativeOverlay()
          return
        }
        await establishSessionAndShowForm(result.accessToken, result.refreshToken)
        return
      }

      // ── LEGACY FLOW: Hash fragment tokens ──────────────────────────
      // Keeps backward compatibility with any previously sent emails
      // that used the old Supabase action_link redirect approach.
      const tokens = parseRecoveryTokens()

      if (!tokens.accessToken || !tokens.refreshToken) {
        // Check for old ?token= param (legacy flow)
        if (searchParams.get("token")) {
          setPhase("expired")
          setError(t("auth.err_link_old_format"))
          dismissNativeOverlay()
          return
        }

        // On native, tokens may arrive AFTER page mount via appUrlOpen event.
        if (isInCapacitor) {
          console.log("[ResetPassword] No tokens yet in Capacitor — waiting for appUrlOpen delivery")
          setTimeout(() => {
            setPhase((prev) => {
              if (prev === "initializing") {
                dismissNativeOverlay()
                setError(t("auth.err_load_reset_link"))
                return "expired"
              }
              return prev
            })
          }, 5000)
          return
        }

        setPhase("expired")
        setError(t("auth.err_missing_reset_link"))
        dismissNativeOverlay()
        return
      }

      const { accessToken, refreshToken } = tokens

      // ── App handoff logic (legacy hash-fragment flow) ──────────────
      if (isMobileBrowser() && !isInCapacitor) {
        const link = `storelib://auth/callback?type=recovery&access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`
        setDeepLink(link)
        setPhase("handoff")
        window.location.href = link

        const timer = setTimeout(async () => {
          await establishSessionAndShowForm(accessToken, refreshToken)
        }, 1200)

        const handleVisibility = () => {
          if (document.hidden) clearTimeout(timer)
        }
        document.addEventListener("visibilitychange", handleVisibility)
        return () => {
          clearTimeout(timer)
          document.removeEventListener("visibilitychange", handleVisibility)
        }
      }

      // ── Direct flow (web desktop, or already inside Capacitor) ─────
      await establishSessionAndShowForm(accessToken, refreshToken)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Listen for late-arriving tokens from native appUrlOpen handler ──
  // On native, the appUrlOpen event may fire AFTER this page mounts.
  // The handler in native-oauth.ts dispatches "nativeRecoveryTokensReady"
  // after storing tokens in sessionStorage. We re-check and proceed.
  useEffect(() => {
    const handleTokensReady = async () => {
      console.log("[ResetPassword] nativeRecoveryTokensReady event received")
      const tokens = parseRecoveryTokens()
      if (tokens.accessToken && tokens.refreshToken) {
        await establishSessionAndShowForm(tokens.accessToken, tokens.refreshToken)
      }
    }

    window.addEventListener("nativeRecoveryTokensReady", handleTokensReady)
    return () => window.removeEventListener("nativeRecoveryTokensReady", handleTokensReady)
  }, [establishSessionAndShowForm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(t("auth.err_password_min8"))
      return
    }

    if (password !== confirmPassword) {
      setError(t("auth.err_passwords_no_match"))
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        console.error("[ResetPassword] updateUser error:", updateError.message)
        setError(updateError.message)
        return
      }

      setPhase("success")

      // Sign out and redirect to login after 3 seconds
      setTimeout(async () => {
        await supabase.auth.signOut({ scope: "local" })
        if (isNativePlatform()) {
          try {
            (window as any).StorelibNative?.authDone?.()
          } catch {}
          window.location.replace("/welcome")
        } else {
          router.push("/login")
        }
      }, 3000)
    } catch {
      setError(t("auth.err_generic_retry"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenInApp = () => {
    if (deepLink) {
      window.location.href = deepLink
    }
  }

  // ── Render: Full-screen loader while initializing ────────────────
  if (phase === "initializing") {
    return (
      <div data-page="reset-password" className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-neutral-400" />
          <p className="mt-4 text-[15px] text-neutral-500">{t("auth.loading")}</p>
        </div>
      </div>
    )
  }

  // ── Render: App handoff (trying to open native app) ──────────────
  if (phase === "handoff") {
    return (
      <div data-page="reset-password" className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-neutral-400" />
          <p className="mt-4 text-[15px] text-neutral-500">
            {t("auth.opening_app")}
          </p>
          <div className="mt-6 space-y-3">
            <Button
              onClick={handleOpenInApp}
              className="h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold text-white hover:bg-neutral-800"
            >
              {t("auth.open_in_app")}
            </Button>
            <button
              onClick={async () => {
                // Bridge-code flow: exchange the code directly in browser
                if (pendingBridgeCode) {
                  const result = await exchangeBridgeCode(pendingBridgeCode)
                  if (result.error || !result.accessToken || !result.refreshToken) {
                    setPhase("expired")
                    setError(result.error || t("auth.err_link_expired"))
                    dismissNativeOverlay()
                  } else {
                    await establishSessionAndShowForm(result.accessToken, result.refreshToken)
                  }
                  return
                }
                // Legacy hash-fragment flow: extract tokens from the deep link
                if (deepLink) {
                  const url = new URL(deepLink)
                  const at = url.searchParams.get("access_token")
                  const rt = url.searchParams.get("refresh_token")
                  if (at && rt) {
                    await establishSessionAndShowForm(at, rt)
                  }
                }
              }}
              className="text-[14px] font-medium text-purple-600 hover:text-purple-700"
            >
              {t("auth.continue_in_browser")}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Success ──────────────────────────────────────────────
  if (phase === "success") {
    return (
      <div data-page="reset-password" className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            {t("auth.reset_success_title")}
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            {t("auth.reset_success_subtitle")}
          </p>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-400" />
        </div>
      </div>
    )
  }

  // ── Render: Expired / invalid link ───────────────────────────────
  if (phase === "expired") {
    return (
      <div data-page="reset-password" className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            {t("auth.link_expired_title")}
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            {error || t("auth.link_expired_default")}
          </p>
          <a href="/request">
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-neutral-200 text-[15px] font-medium text-purple-600 hover:bg-purple-50 hover:border-purple-200"
            >
              {t("auth.send_new_reset")}
            </Button>
          </a>
          <div className="mt-4">
            <a href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
              {t("auth.back_to_login")}
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Reset form ───────────────────────────────────────────
  return (
    <div data-page="reset-password" className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[440px] text-center">
        <AuthLogo />
        <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
          {t("auth.reset_your_password")}
        </h1>
        {userEmail && (
          <p className="mb-8 text-[15px] text-neutral-500">
            {t("auth.setting_new_password_for")}{" "}
            <span className="font-medium text-neutral-700">{userEmail}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder={t("auth.new_password_placeholder")}
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
          <p className="text-xs text-neutral-400 text-left pl-1">{t("auth.min_8_chars")}</p>

          <Input
            type={showPassword ? "text" : "password"}
            placeholder={t("auth.confirm_new_password_placeholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
            minLength={8}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button
            type="submit"
            disabled={isSubmitting || !password.trim() || !confirmPassword.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isSubmitting ? t("auth.resetting") : t("auth.reset_password_button")}
          </Button>
        </form>

        <div className="mt-6">
          <a href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
            {t("auth.back_to_login")}
          </a>
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
