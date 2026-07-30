"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AuthLogo } from "@/components/auth/auth-logo"
import { useLocale } from "@/components/locale-provider"

function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@")
  if (!localPart || !domain) return email

  const firstChar = localPart[0] || ""
  const lastChar = localPart.length > 1 ? localPart[localPart.length - 1] : ""
  const masked = `${firstChar}***${lastChar}@${domain}`
  return masked
}

export default function RequestPasswordResetPage() {
  const { t } = useLocale()
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState("")
  const [googleOnlyHint, setGoogleOnlyHint] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError(t("auth.enter_email"))
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
        setError(data.message || t("auth.account_uses_google"))
      } else {
        setError(data.error || t("auth.reset_email_failed"))
      }
    } catch {
      setError(t("auth.error_try_again"))
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
            {t("auth.check_email")}
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            {t("auth.reset_sent_to")}{" "}
            <span className="font-medium text-neutral-700">{maskedEmail}</span>.
          </p>

          <Link href="/login">
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-neutral-200 text-[15px] font-medium text-purple-600 hover:bg-purple-50 hover:border-purple-200"
            >
              {t("auth.back_to_login")}
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
          {t("auth.forgot_password")}
        </h1>
        <p className="mb-8 text-[15px] text-neutral-500">
          {t("auth.forgot_subtitle")}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder={t("auth.email_or_username")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

          {googleOnlyHint && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-left">
              <p className="text-sm text-blue-900 mb-2">{t("auth.google_reset_hint")}</p>
              <Link href="/login" className="inline-flex">
                <Button type="button" variant="outline" className="h-9 text-sm border-blue-300 text-blue-700 hover:bg-blue-100 cursor-pointer">
                  {t("auth.continue_google")}
                </Button>
              </Link>
              <div className="mt-2">
                <Link href="mailto:support@storelib.com" className="text-xs text-blue-700 underline">{t("auth.cant_access_google")}</Link>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !email.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? t("auth.sending") : t("auth.send_email")}
          </Button>
        </form>

        <div className="mt-6">
          <Link href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
            {t("auth.back_to_login")}
          </Link>
        </div>
      </div>
    </div>
  )
}
