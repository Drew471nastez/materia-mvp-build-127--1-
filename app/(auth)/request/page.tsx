"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AuthLogo } from "@/components/auth/auth-logo"
import { createClient } from "@/lib/supabase/client"

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@")
  if (!localPart || !domain) return email
  const firstChar = localPart[0] || ""
  const lastChar = localPart.length > 1 ? localPart[localPart.length - 1] : ""
  return `${firstChar}***${lastChar}@${domain}`
}

export default function RequestPasswordResetPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError("Please enter your email")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      // Always redirect to the HTTPS page — the web page then hands off to
      // the native app via storelib:// custom scheme if the app is installed.
      const redirectTo = `${typeof window !== "undefined" ? window.location.origin : "https://storelib.com"}/reset-password`

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo }
      )

      if (resetError) {
        // Log for debugging but don't expose to user (prevent email enumeration)
        console.error("resetPasswordForEmail error:", resetError)
      }

      // Always show success to prevent email enumeration
      setMaskedEmail(maskEmail(email.trim().toLowerCase()))
      setSuccess(true)
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] text-center">
          <AuthLogo />
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Check your email
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            We sent a password reset link to{" "}
            <span className="font-medium text-neutral-700">{maskedEmail}</span>.
          </p>
          <Link href="/login">
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-neutral-200 text-[15px] font-medium text-purple-600 hover:bg-purple-50 hover:border-purple-200"
            >
              Back to log in
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[440px] text-center">
        <AuthLogo />
        <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
          Forgot password?
        </h1>
        <p className="mb-8 text-[15px] text-neutral-500">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? "Sending..." : "Send Reset Link"}
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
