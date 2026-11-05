"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AuthLogo } from "@/components/auth/auth-logo"
import { readCarry, withCarry, type AuthCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"

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
  /*
    Sell on Storelib, and the page to go back to, from the login page that
    sent them here (lib/auth/continue.ts). They go into the reset email's
    link, so the new password leads back into the same login and on to
    seller onboarding, and onto every Log in link on this page.
  */
  const [carry, setCarry] = useState<AuthCarry>({ intent: null, next: null })
  useEffect(() => {
    setCarry(readCarry(new URLSearchParams(window.location.search), getMainDomain()))
  }, [])
  const loginHref = withCarry("/login", carry)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError("Please enter your email")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), intent: carry.intent, next: carry.next }),
      })

      const data = await response.json()

      if (response.ok) {
        setMaskedEmail(maskEmail(email.trim().toLowerCase()))
        setSuccess(true)
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
          <AuthLogo />
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Check your email
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            If there&apos;s an account for{" "}
            <span className="font-medium text-neutral-700">{maskedEmail}</span>, we sent it an email to reset the password. An account that signs in with Google or Apple gets an email saying how to get in.
          </p>

          <Link href={loginHref}>
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

          <Button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? "Sending..." : "Send Email"}
          </Button>
        </form>

        <div className="mt-6">
          <Link href={loginHref} className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
            Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}
