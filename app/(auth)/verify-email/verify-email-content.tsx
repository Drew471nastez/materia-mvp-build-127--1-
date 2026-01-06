"use client"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2, CheckCircle2, Mail } from "lucide-react"
import Image from "next/image"

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

  // Start countdown if code was already sent
  useEffect(() => {
    if (codeSent) {
      setResendCountdown(60)
      setInitialSendStatus("sent")
    }
  }, [codeSent])

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
      console.log("[v0] Sending verification code to:", email)
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim().toLowerCase() }),
      })

      const data = await res.json()
      console.log("[v0] Verification API response:", res.status, data)

      if (!res.ok) {
        setError(data.error || "Failed to send verification code")
        setInitialSendStatus("failed")
        return
      }

      setResendCountdown(60)
      setInitialSendStatus("sent")
    } catch (err) {
      console.error("[v0] Error sending verification code:", err)
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
      console.log("[v0] Verifying code for userId:", userId)
      const res = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: verificationCode }),
      })

      const data = await res.json()
      console.log("[v0] Confirm email response:", res.status, data)

      if (!res.ok) {
        setError(data.error || "Invalid verification code")
        setVerificationCode("")
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push("/onboarding")
        router.refresh()
      }, 1500)
    } catch (err) {
      console.error("[v0] Error verifying code:", err)
      setError("Something went wrong. Please try again.")
      setVerificationCode("")
    } finally {
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
          <h1 className="text-xl font-semibold text-neutral-900 mb-2">Invalid Link</h1>
          <p className="text-neutral-500 mb-4">This verification link is invalid or has expired.</p>
          <Link href="/signup" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Return to signup
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-[400px]">
          <Link href="/" className="mb-12 inline-block">
            <span className="text-2xl font-bold tracking-tight text-emerald-500">Storelib*</span>
          </Link>

          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">Email Verified!</h1>
              <p className="text-[15px] text-neutral-500">Redirecting you to complete your profile...</p>
            </div>
          ) : (
            <>
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
                <Mail className="h-8 w-8 text-neutral-600" />
              </div>

              <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900 text-center">
                Check your email
              </h1>
              <p className="mb-2 text-[15px] text-neutral-500 text-center">We sent a 6-digit code to</p>
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
                          className="h-14 w-12 rounded-lg border-neutral-200 bg-neutral-50 text-xl font-semibold text-center focus:border-neutral-400 focus:bg-white focus:ring-0"
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

                <div className="text-center">
                  <p className="text-[14px] text-neutral-500 mb-1">Didn't receive the code?</p>
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resendCountdown > 0 || resendLoading}
                    className="text-[14px] font-medium text-emerald-600 hover:text-emerald-700 disabled:text-neutral-400 disabled:cursor-not-allowed"
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

      <div className="relative hidden lg:block lg:w-1/2">
        <Image
          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/banner-login-desktop-D8selsDi.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvYmFubmVyLWxvZ2luLWRlc2t0b3AtRDhzZWxzRGkud2VicCIsImlhdCI6MTc2NzY4Mjg3MiwiZXhwIjozMzI3MjE0Njg3Mn0.KfdlnasBcTWOIbG5w0kb6bw8lW9SPOmIKlOzF4DqkYc"
          alt="Verify email banner"
          fill
          className="object-cover"
          priority
        />
      </div>
    </div>
  )
}
