"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@")
  if (!localPart || !domain) return email

  const firstChar = localPart[0] || ""
  const lastChar = localPart.length > 1 ? localPart[localPart.length - 1] : ""
  const masked = `${firstChar}***${lastChar}@${domain}`
  return masked
}

export default function RequestPasswordResetPage() {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState("")
  const [googleOnlyHint, setGoogleOnlyHint] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError("Please enter your email")
      return
    }

    setIsLoading(true)
    setError(null)
    setGoogleOnlyHint(false)

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      const data = await response.json()

      if (response.ok) {
        setMaskedEmail(maskEmail(email.trim().toLowerCase()))
        setSuccess(true)
      } else if (response.status === 409 && data?.accountType === "google_only") {
        setGoogleOnlyHint(true)
        setError(data.message || "This account uses Google sign-in.")
      } else {
        setError(data.error || "Failed to send reset email")
      }
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
          <Link href="/" className="mb-12 inline-flex items-center gap-2">
            <img
              src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
              alt="Storelib"
              className="h-8 w-8"
            />
            <span className="text-xl font-bold tracking-tight text-neutral-900">Storelib</span>
          </Link>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Check your email
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            We just sent an email to reset your password to{" "}
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
        <Link href="/" className="mb-12 inline-flex items-center gap-2">
          <img
            src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
            alt="Storelib"
            className="h-8 w-8"
          />
          <span className="text-xl font-bold tracking-tight text-neutral-900">Storelib</span>
        </Link>
        <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
          Forgot password?
        </h1>
        <p className="mb-8 text-[15px] text-neutral-500">
          Enter your email or username and we&apos;ll send you an email to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="Email or username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          {googleOnlyHint && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-left">
              <p className="text-sm text-blue-900 mb-2">This account was created with Google. Use Google sign-in instead of password reset.</p>
              <Link href="/login" className="inline-flex">
                <Button type="button" variant="outline" className="h-9 text-sm border-blue-300 text-blue-700 hover:bg-blue-100 cursor-pointer">
                  Continue with Google
                </Button>
              </Link>
              <div className="mt-2">
                <Link href="mailto:support@storelib.com" className="text-xs text-blue-700 underline">Can’t access Google?</Link>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? "Sending..." : "Send Email"}
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
