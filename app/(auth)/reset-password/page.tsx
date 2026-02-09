"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isValidating, setIsValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string>("")

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false)
        setError("Missing reset token")
        return
      }

      try {
        const response = await fetch("/api/auth/validate-reset-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })

        const data = await response.json()

        if (response.ok && data.valid) {
          setTokenValid(true)
          setUserEmail(data.email || "")
        } else {
          setError(data.error || "Invalid or expired reset link")
        }
      } catch {
        setError("Failed to validate reset link")
      } finally {
        setIsValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch("/api/auth/complete-reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(true)
        // Sign out and redirect to login after 3 seconds
        setTimeout(async () => {
          const supabase = createClient()
          await supabase.auth.signOut()
          router.push("/login")
        }, 3000)
      } else {
        setError(data.error || "Failed to reset password")
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isValidating) {
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
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-neutral-400" />
          <p className="mt-4 text-[15px] text-neutral-500">Validating reset link...</p>
        </div>
      </div>
    )
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Password reset successfully
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            Your password has been updated. Redirecting to login...
          </p>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-400" />
        </div>
      </div>
    )
  }

  if (!tokenValid) {
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
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="mb-4 text-[32px] font-bold tracking-tight text-neutral-900">
            Invalid reset link
          </h1>
          <p className="mb-8 text-[15px] text-neutral-500">
            {error || "This password reset link is invalid or has expired."}
          </p>
          <Link href="/request">
            <Button
              variant="outline"
              className="h-12 px-8 rounded-full border-neutral-200 text-[15px] font-medium text-purple-600 hover:bg-purple-50 hover:border-purple-200"
            >
              Request new link
            </Button>
          </Link>
          <div className="mt-4">
            <Link href="/login" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
              Back to log in
            </Link>
          </div>
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
          Reset your password
        </h1>
        {userEmail && (
          <p className="mb-8 text-[15px] text-neutral-500">
            Setting new password for{" "}
            <span className="font-medium text-neutral-700">{userEmail}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
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
          <p className="text-xs text-neutral-400 text-left pl-1">Minimum 8 characters</p>

          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
            minLength={8}
            required
          />

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button
            type="submit"
            disabled={isLoading || !password.trim() || !confirmPassword.trim()}
            className="h-12 w-full rounded-full bg-neutral-200 text-[15px] font-semibold text-black hover:bg-neutral-300 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            {isLoading ? "Resetting..." : "Reset Password"}
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
