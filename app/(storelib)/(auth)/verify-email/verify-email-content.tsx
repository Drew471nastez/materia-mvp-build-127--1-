"use client"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react"
import { AuthPhoto, SIGNUP_PHOTO } from "@/components/auth/auth-photo"
import { createClient } from "@/lib/supabase/client"
import { AuthLogo } from "@/components/auth/auth-logo"
import { continueHref, readCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"
import { safeReturnTarget } from "@/lib/auth/return-to"
import { maskEmail } from "@/lib/privacy/mask-email"

export default function VerifyEmailContent() {
  const [verificationCode, setVerificationCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [initialSendStatus, setInitialSendStatus] = useState<"pending" | "sent" | "failed">("pending")

  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("userId")
  const email = searchParams.get("email") || ""
  const codeSent = searchParams.get("sent") === "1"
  /* A path here or a platform page, never another site (round 48: ?redirect=https://anywhere was followed after the code). */
  const redirectUrl = safeReturnTarget(searchParams.get("redirect"), { mainDomain: getMainDomain() })
  const pendingReview = searchParams.get("pendingReview")

  // Start countdown if code was already sent
  useEffect(() => {
    if (codeSent) {
      setResendCountdown(10)
      setInitialSendStatus("sent")
    }
  }, [codeSent])

  // Send verification code on mount if not already sent
  useEffect(() => {
    if (userId && email && !codeSent && initialSendStatus === "pending") {
      sendVerificationCode()
    }
  }, [userId, email, codeSent, initialSendStatus])

  // Countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return
    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  // Auto-verify when all 6 digits are entered
  useEffect(() => {
    if (verificationCode.length === 6 && !loading && !success) {
      handleVerifyCode()
    }
  }, [verificationCode])

  const sendVerificationCode = async () => {
    setError(null)
    setResendLoading(true)

    try {
      console.log("[VerifyEmail] Sending verification code to:", maskEmail(email))
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim().toLowerCase() }),
      })

      const data = await res.json()
      console.log("[VerifyEmail] API response:", res.status, data)

      if (!res.ok) {
        setError(data.error || "Failed to send verification code")
        setInitialSendStatus("failed")
        return
      }

      setResendCountdown(10)
      setInitialSendStatus("sent")
    } catch (err) {
      console.error("[VerifyEmail] Error sending verification code:", err)
      setError("Something went wrong. Please try again.")
      setInitialSendStatus("failed")
    } finally {
      setResendLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) return

    setError(null)
    setLoading(true)

    try {
      console.log("[VerifyEmail] Verifying code for userId:", userId)
      const res = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: verificationCode }),
      })

      const data = await res.json()
      console.log("[VerifyEmail] Confirm email response:", res.status, data)

      if (!res.ok) {
        setError(data.error || "Invalid verification code")
        setVerificationCode("")
        setLoading(false)
        return
      }

      setSuccess(true)

      // PRIORITY: If there's a redirect URL (e.g., returning to receipt page for review), use it
      if (redirectUrl) {
        setTimeout(() => {
          let finalUrl = redirectUrl
          if (pendingReview === "true" && !finalUrl.includes("pendingReview")) {
            finalUrl += (finalUrl.includes("?") ? "&" : "?") + "pendingReview=true"
          }
          router.push(finalUrl)
          router.refresh()
        }, 1500)
        return
      }

      /*
        On through /auth/continue (lib/auth/continue.ts), with Sell on
        Storelib and the return page if they came with them: a plain
        signup lands on Discover, Sell on Storelib goes into seller
        onboarding. A hard navigation, so the server reads the fresh row.
      */
      setTimeout(() => {
        window.location.replace(continueHref(readCarry(searchParams, getMainDomain())))
      }, 1500)
    } catch (err) {
      console.error("[VerifyEmail] Error verifying code:", err)
      setError("Something went wrong. Please try again.")
      setVerificationCode("")
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    await sendVerificationCode()
  }

  // Mask email for display
  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 5)) + c)
    : ""

  if (!userId) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Invalid Link</h1>
          <p className="text-neutral-500 mb-4">This verification link is invalid or has expired.</p>
          <Link 
            href="/signup" 
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
          >
            Return to signup
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-start px-6 py-8 sm:py-10 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto page-scroll lg:px-16 lg:py-10 xl:px-24 auth-stack">
        <div className="mx-auto w-full max-w-[400px] py-2 sm:py-3 lg:py-4">
          <AuthLogo />

          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e6e8eb] bg-[#f8f9fa] text-[#1a1a2e]">
                <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
              </div>
              <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">Email Verified!</h1>
              <p className="text-[15px] text-neutral-500">Redirecting you to your dashboard...</p>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e6e8eb] bg-[#f8f9fa] text-[#1a1a2e]">
                <ShieldCheck className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </div>

              <h1 className="mb-2 text-center text-[26px] font-semibold tracking-tight text-[#1a1a2e] sm:text-[32px]">
                Check your email
              </h1>
              <p className="mb-2 text-[15px] text-neutral-500 text-center">We sent a 6 digit code to</p>
              <p className="mb-8 text-[15px] font-medium text-neutral-900 text-center">{maskedEmail}</p>

              <div className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={verificationCode}
                    onChange={setVerificationCode}
                    disabled={loading || success}
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

                {loading && (
                  <div className="flex items-center justify-center gap-2 text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Verifying...</span>
                  </div>
                )}

                {initialSendStatus === "pending" && (
                  <div className="flex items-center justify-center gap-2 text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Sending verification code...</span>
                  </div>
                )}

                {initialSendStatus === "failed" && !error && (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
                    <p className="text-sm text-amber-700">Failed to send code. Click "Resend code" to try again.</p>
                  </div>
                )}

                <div className="text-center">
                  <p className="text-[14px] text-neutral-500 mb-1">Didn't receive the code?</p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCountdown > 0 || resendLoading}
                    className="text-[14px] font-semibold text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-4 hover:decoration-[#1a1a2e] disabled:cursor-not-allowed disabled:text-[#9ca3af] disabled:no-underline"
                  >
                    {resendLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Sending...
                      </span>
                    ) : resendCountdown > 0 ? (
                      `Resend code in ${resendCountdown}s`
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
                    <Link
                      href="/signup"
                      className="text-neutral-600 hover:text-neutral-700 underline underline-offset-2"
                    >
                      Go back to signup
                    </Link>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <AuthPhoto src={SIGNUP_PHOTO} />
    </div>
  )
}
