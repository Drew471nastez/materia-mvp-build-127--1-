"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Loader2, ShieldCheck } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { AuthLogo } from "@/components/auth/auth-logo"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import { createClient } from "@/lib/supabase/client"
import { readCarry, withCarry } from "@/lib/auth/continue"
import { goOnAfterAuth } from "@/lib/auth/continue-client"
import { getMainDomain } from "@/lib/url-helpers"

/**
 * /signup/verify?userId=...&email=...
 *
 * Custom SMTP verification page for email signup.
 *
 * Flow:
 *  1. User signs up at /signup → a branded 6-digit code is sent via Mailgun
 *     from "Storelib <noreply@storelib.com>" using /api/auth/verify-email.
 *  2. User is redirected here with ?userId=...&email=... prefilled.
 *  3. User enters the 6-digit code → /api/auth/confirm-email verifies it
 *     and marks the profile email_verified = true.
 *  4. User is sent on through /auth/continue (lib/auth/continue.ts), with
 *     the intent and return page they arrived with: a plain signup to
 *     Discover, Sell on Storelib into seller onboarding.
 */
function VerifyContent() {
  const searchParams = useSearchParams()
  const userId = searchParams.get("userId") ?? ""
  const email = searchParams.get("email") ?? ""

  const sent = searchParams.get("sent") === "1"
  /* Sell on Storelib, and the page to go back to, from the signup or login that sent them here. */
  const carry = readCarry(searchParams, getMainDomain())

  /** On to wherever they belong; the server decides (app/auth/continue). */
  const goOn = async () => {
    setIsRedirecting(true)
    const { data } = await createClient().auth.getSession().catch(() => ({ data: { session: null } }))
    await goOnAfterAuth(carry, data.session)
  }

  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  /* Short on purpose: the code is already on its way, and a long lock made resend feel broken. */
  const [resendCooldown, setResendCooldown] = useState(sent ? 10 : 0)

  // Sign out and go back to signup (user wants a different email)
  const handleBackToSignup = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    window.location.href = withCarry("/signup", carry)
  }

  // Forward-redirect: if email is already verified, skip to next step
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    supabase
      .from("profiles")
      .select("email_verified")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.email_verified) {
          void goOn()
        }
      })
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send email on mount if not already sent (e.g. direct navigation to this URL)
  useEffect(() => {
    if (sent || !userId || !email) return
    const onceKey = `storelib-code-sent:${userId}:${email}`
    try {
      if (sessionStorage.getItem(onceKey) === "1") return
      sessionStorage.setItem(onceKey, "1")
    } catch {
      /* private mode: the server still refuses a second send in the same moment */
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, email }),
    })
      .then(async (res) => {
        if (res.ok) {
          setResendCooldown(10)
          return
        }
        const data = await res.json().catch(() => null)
        setError(typeof data?.error === "string" ? data.error : "Could not send the code. Try resend.")
      })
      .catch(() => setError("Could not send the code. Try resend."))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = window.setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [resendCooldown])

  // Auto-verify when all 6 digits are entered
  useEffect(() => {
    if (code.length === 6 && !isVerifying && !isRedirecting) {
      handleVerify(code)
    }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async (otp: string) => {
    if (otp.length !== 6 || isVerifying) return
    setIsVerifying(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: otp }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Verification failed")
      }

      await goOn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed"
      if (msg.toLowerCase().includes("expired")) {
        setError("Code expired. Please request a new one.")
      } else {
        setError(msg)
      }
      setCode("")
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (isResending || resendCooldown > 0) return
    setIsResending(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to resend code")
      }

      setResendCooldown(10)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code")
    } finally {
      setIsResending(false)
    }
  }

  if (isRedirecting) {
    return <AuthResolvingScreen />
  }

  if (!userId || !email) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Missing information</h1>
          <p className="text-neutral-500 mb-4">
            No user information was provided. Please sign up first.
          </p>
          <Link
            href={withCarry("/signup", carry)}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
          >
            Go to signup
          </Link>
        </div>
      </div>
    )
  }

  // Mask email for display
  const maskedEmail = email.replace(
    /(.{2})(.*)(@.*)/,
    (_, a, b, c) => a + "*".repeat(Math.min(b.length, 5)) + c
  )

  return (
    <div className="flex min-h-svh w-full lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack">
        <div className="mx-auto w-full max-w-[400px] py-2 sm:py-3 lg:py-4">
          <AuthLogo />

          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e6e8eb] bg-[#f8f9fa] text-[#1a1a2e]">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>

          <h1 className="mb-2 text-center text-[26px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[32px]">
            Check your email
          </h1>
          <p className="mb-2 text-center text-[15px] text-[#6b7280]">
            We sent a 6-digit code to
          </p>
          <p className="mb-7 break-all text-center text-[15px] font-medium text-[#1a1a2e]">
            {maskedEmail}
          </p>

          <div className="space-y-6">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                disabled={isVerifying}
              >
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-10 rounded-xl border border-[#e6e8eb] bg-white text-[20px] font-semibold text-[#1a1a2e] shadow-[0_1px_1px_rgba(16,24,40,0.04)] first:rounded-xl first:border last:rounded-xl data-[active=true]:z-10 data-[active=true]:border-[#1a1a2e] data-[active=true]:ring-2 data-[active=true]:ring-[#1a1a2e]/10 sm:h-14 sm:w-12 sm:text-[22px]"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Verifying...</span>
              </div>
            )}

            <div className="text-center">
              <p className="text-[14px] text-neutral-500 mb-1">
                Didn&apos;t receive the code?
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isResending}
                className="text-[14px] font-semibold text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e] disabled:text-[#9ca3af] disabled:no-underline disabled:cursor-not-allowed"
              >
                {isResending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sending...
                  </span>
                ) : resendCooldown > 0 ? (
                  `Resend code in ${resendCooldown}s`
                ) : (
                  "Resend code"
                )}
              </button>
            </div>

            <p className="text-[13px] text-neutral-500 text-center">
              Can&apos;t find the email? Check your <span className="font-medium">spam or junk folder</span>.
            </p>

            <div className="pt-4 border-t border-neutral-100">
              <p className="text-[13px] text-neutral-400 text-center">
                Wrong email?{" "}
                <button
                  type="button"
                  onClick={handleBackToSignup}
                  className="text-neutral-600 hover:text-neutral-700 underline underline-offset-2"
                >
                  Go back to signup
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden bg-neutral-900">
        <Image
          src="https://storelib.com/media/platform%20images/collage%20imags/awapage.png"
          alt="Verify email banner"
          fill
          className="object-cover object-center"
          sizes="(min-width: 1024px) 50vw, 0px"
          quality={75}
          priority
        />
      </div>
    </div>
  )
}

export default function SignupVerifyPage() {
  return (
    <Suspense fallback={<AuthResolvingScreen />}>
      <VerifyContent />
    </Suspense>
  )
}
