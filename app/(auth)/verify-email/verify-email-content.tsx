"use client"

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2, CheckCircle2, Mail, AlertCircle } from "lucide-react"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { AuthLogo } from "@/components/auth/auth-logo"
import { useLocale } from "@/components/locale-provider"

export default function VerifyEmailContent() {
  const { t } = useLocale()
  const [verificationCode, setVerificationCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [initialSendStatus, setInitialSendStatus] = useState<"pending" | "sent" | "failed">("pending")
  const [isBannerLoaded, setIsBannerLoaded] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("userId")
  const email = searchParams.get("email") || ""
  const codeSent = searchParams.get("sent") === "1"
  const redirectUrl = searchParams.get("redirect")
  const pendingReview = searchParams.get("pendingReview")

  // Start countdown if code was already sent
  useEffect(() => {
    if (codeSent) {
      setResendCountdown(60)
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
      console.log("[VerifyEmail] Sending verification code to:", email)
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim().toLowerCase() }),
      })

      const data = await res.json()
      console.log("[VerifyEmail] API response:", res.status, data)

      if (!res.ok) {
        setError(data.error || t("auth.err_send_code_failed"))
        setInitialSendStatus("failed")
        return
      }

      setResendCountdown(60)
      setInitialSendStatus("sent")
    } catch (err) {
      console.error("[VerifyEmail] Error sending verification code:", err)
      setError(t("auth.err_something_wrong_retry"))
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
        setError(data.error || t("auth.err_invalid_code"))
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

      // After verification, always go to the role chooser.
      // /signup/success decides creator → /app or buyer → /library.
      setTimeout(() => {
        router.push("/signup/success")
        router.refresh()
      }, 1500)
    } catch (err) {
      console.error("[VerifyEmail] Error verifying code:", err)
      setError(t("auth.err_something_wrong_retry"))
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
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">{t("auth.invalid_link_title")}</h1>
          <p className="text-neutral-500 mb-4">{t("auth.invalid_link_desc")}</p>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-neutral-900 text-white font-medium hover:bg-neutral-800 transition-colors"
          >
            {t("auth.return_to_signup")}
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
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">{t("auth.email_verified_title")}</h1>
              <p className="text-[15px] text-neutral-500">{t("auth.redirecting_dashboard")}</p>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <Mail className="h-8 w-8 text-emerald-600" />
              </div>

              <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900 text-center">
                {t("auth.check_email")}
              </h1>
              <p className="mb-2 text-[15px] text-neutral-500 text-center">{t("auth.sent_6_digit_code")}</p>
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
                          className="h-14 w-12 rounded-lg border-neutral-200 bg-neutral-50 text-xl font-semibold text-center focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
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
                    <span className="text-sm">{t("auth.verifying")}</span>
                  </div>
                )}

                {initialSendStatus === "pending" && (
                  <div className="flex items-center justify-center gap-2 text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{t("auth.sending_verification_code")}</span>
                  </div>
                )}

                {initialSendStatus === "failed" && !error && (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-center">
                    <p className="text-sm text-amber-700">{t("auth.err_send_code_click_resend")}</p>
                  </div>
                )}

                <div className="text-center">
                  <p className="text-[14px] text-neutral-500 mb-1">{t("auth.didnt_receive_code")}</p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCountdown > 0 || resendLoading}
                    className="text-[14px] font-medium text-emerald-600 hover:text-emerald-700 disabled:text-neutral-400 disabled:cursor-not-allowed"
                  >
                    {resendLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t("auth.sending")}
                      </span>
                    ) : resendCountdown > 0 ? (
                      `${t("auth.resend_code_in")} ${resendCountdown}s`
                    ) : (
                      t("auth.resend_code")
                    )}
                  </button>
                </div>

                <p className="text-[13px] text-neutral-500 text-center">
                  {t("auth.cant_find_email")} <span className="font-medium">{t("auth.spam_junk_folder")}</span>.
                </p>

                <div className="pt-4 border-t border-neutral-100">
                  <p className="text-[13px] text-neutral-400 text-center">
                    {t("auth.wrong_email")}{" "}
                    <Link
                      href="/signup"
                      className="text-neutral-600 hover:text-neutral-700 underline underline-offset-2"
                    >
                      {t("auth.go_back_signup")}
                    </Link>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right side - Same image as signup page */}
      <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden">
        {!isBannerLoaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-100 via-neutral-200 to-neutral-100" />}
        <Image
          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/awapage.png"
          alt="Verify email banner"
          fill
          className="object-cover object-center transition-opacity duration-500"
          sizes="(min-width: 1024px) 50vw, 0px"
          quality={75}
          priority
          fetchPriority="high"
          decoding="async"
          onLoad={() => setIsBannerLoaded(true)}
        />
      </div>
    </div>
  )
}
