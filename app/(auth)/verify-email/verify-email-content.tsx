"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Loader2, Mail, AlertCircle } from "lucide-react"

export default function VerifyEmailContent() {
  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDisabled, setResendDisabled] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)

  const router = useRouter()
  const searchParams = useSearchParams()
  const userId = searchParams.get("userId")
  const initialEmail = searchParams.get("email")

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail)
      setStep("code")
    }
  }, [initialEmail])

  useEffect(() => {
    if (resendCountdown <= 0) {
      setResendDisabled(false)
      return
    }

    const timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCountdown])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim().toLowerCase() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send verification code")
        return
      }

      setSuccess("Verification code sent! Check your email.")
      setStep("code")
      setResendCountdown(60)
      setResendDisabled(true)
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code: verificationCode }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Invalid verification code")
        return
      }

      setSuccess("Email verified! Redirecting...")
      setTimeout(() => {
        router.push("/onboarding")
        router.refresh()
      }, 1500)
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    setError(null)
    setResendLoading(true)

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email: email.trim().toLowerCase() }),
      })

      if (!res.ok) {
        setError("Failed to resend verification code")
        return
      }

      setSuccess("Code resent! Check your email.")
      setResendCountdown(60)
      setResendDisabled(true)
    } catch (err) {
      setError("Something went wrong. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  if (!userId) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <Card>
            <CardHeader>
              <CardTitle>Invalid Link</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">This verification link is invalid or has expired.</p>
              <Link href="/signup" className="text-blue-600 hover:underline">
                Return to signup
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Link href="/" className="flex items-center justify-center gap-2">
            <span className="text-xl font-semibold tracking-tight">Materia</span>
          </Link>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Verify your email</CardTitle>
              <CardDescription>
                {step === "email" ? "Enter your email to get started" : "Enter the 6-digit code we sent to your email"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === "email" ? (
                <form onSubmit={handleSendCode}>
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        disabled={loading}
                      />
                    </div>
                    {error && (
                      <div className="rounded-lg bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    )}
                    {success && (
                      <div className="rounded-lg bg-green-50 border border-green-100 p-3 flex items-start gap-2.5">
                        <p className="text-sm text-green-700">{success}</p>
                      </div>
                    )}
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={loading || !email}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                      Send verification code
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="code" className="text-sm font-medium">
                      Verification code
                    </Label>
                    <InputOTP maxLength={6} value={verificationCode} onChange={setVerificationCode}>
                      <InputOTPGroup className="gap-2 w-full justify-center">
                        <InputOTPSlot
                          index={0}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                        <InputOTPSlot
                          index={1}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                        <InputOTPSlot
                          index={2}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                        <InputOTPSlot
                          index={3}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                        <InputOTPSlot
                          index={4}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                        <InputOTPSlot
                          index={5}
                          className="w-12 h-12 text-lg font-semibold border border-gray-200 rounded-lg text-center"
                        />
                      </InputOTPGroup>
                    </InputOTP>
                    <p className="text-xs text-gray-500">Check your inbox for the 6-digit code</p>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-100 p-3 flex items-start gap-2.5">
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="rounded-lg bg-green-50 border border-green-100 p-3 flex items-start gap-2.5">
                      <p className="text-sm text-green-700">{success}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <Button
                      onClick={handleVerifyCode}
                      disabled={loading || verificationCode.length !== 6}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Verify & Continue
                    </Button>

                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={resendDisabled || resendLoading}
                      className="w-full text-blue-600 hover:text-blue-700 text-sm font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {resendLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Resending...
                        </span>
                      ) : resendCountdown > 0 ? (
                        `Resend in ${resendCountdown}s`
                      ) : (
                        "Resend code"
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("email")
                      setVerificationCode("")
                      setError(null)
                      setSuccess(null)
                    }}
                    disabled={loading}
                    className="w-full text-gray-600 hover:text-gray-700 text-sm font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
