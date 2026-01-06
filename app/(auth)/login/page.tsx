"use client"

import type React from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, Suspense } from "react"
import Image from "next/image"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirect")
  const claim = searchParams.get("claim")
  const receiptToken = searchParams.get("receiptToken")

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showPasswordForm) {
      if (!email.trim()) {
        setError("Please enter your email")
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const supabase = createClient()
        const trimmedEmail = email.trim().toLowerCase()

        // Check if user exists in auth.users via sign in attempt with dummy password
        const { error: checkError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: "dummy_check_password_12345",
        })

        // If we get "Invalid login credentials", the user exists (wrong password)
        // If we get "Email not confirmed" or similar, the user exists
        // If we get other errors, assume user doesn't exist
        if (checkError) {
          if (
            checkError.message.includes("Invalid login credentials") ||
            checkError.message.includes("Email not confirmed")
          ) {
            // User exists - show password field
            setShowPasswordForm(true)
            setError(null)
            setIsLoading(false)
            return
          } else {
            // User doesn't exist - redirect to signup with email prefilled
            router.push(`/signup?email=${encodeURIComponent(trimmedEmail)}`)
            return
          }
        }

        // User exists - show password field
        setShowPasswordForm(true)
        setError(null)
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "An error occurred")
      } finally {
        setIsLoading(false)
      }
      return
    }

    // Second step - actual login
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password

    if (!trimmedEmail || !trimmedPassword) {
      setError("Please enter both email and password")
      setIsLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      })

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          throw new Error("Invalid email or password. Please check your credentials and try again.")
        }
        throw error
      }

      const user = data.user
      if (!user) throw new Error("Failed to get user")

      // Handle claim flow
      if (claim === "1" && receiptToken) {
        try {
          await fetch("/api/purchases/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiptToken }),
          })
        } catch (claimError) {
          console.error("Failed to claim purchase:", claimError)
        }
        router.push(`/receipt/${receiptToken}`)
        return
      }

      // Handle redirect flow
      if (redirectTo) {
        router.push(redirectTo)
        return
      }

      // Check if user is a creator
      const { data: creator } = await supabase
        .from("creators")
        .select("id, onboarding_completed")
        .eq("user_id", user.id)
        .single()

      if (creator) {
        if (creator.onboarding_completed === false) {
          router.push("/onboarding")
        } else {
          router.push("/app")
        }
        return
      }

      // Check if user has a profile (customer)
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).single()

      if (!profile) {
        router.push("/onboarding")
      } else {
        router.push("/dashboard")
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    const supabase = createClient()
    setIsGoogleLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to sign in with Google")
      setIsGoogleLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    const supabase = createClient()
    setIsAppleLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
      })
      if (error) throw error
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Failed to sign in with Apple")
      setIsAppleLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-[400px]">
          {/* Logo */}
          <Link href="/" className="mb-12 inline-block">
            <span className="text-2xl font-bold tracking-tight text-emerald-500">Storelib*</span>
          </Link>

          {/* Heading */}
          <h1 className="mb-2 text-[32px] font-bold tracking-tight text-neutral-900">Welcome back</h1>
          <p className="mb-8 text-[15px] text-neutral-500">Log in to your Storelib</p>

          {/* Form */}
          <form onSubmit={handleContinue} className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                type="email"
                placeholder="Email or username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
              />
            </div>

            {showPasswordForm && (
              <div className="space-y-2">
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-12 rounded-lg border-neutral-200 bg-neutral-50 px-4 text-[15px] placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white focus:ring-0"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <Button
              type="submit"
              className="h-12 w-full rounded-full bg-neutral-900 text-[15px] font-semibold text-white hover:bg-neutral-800"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Continue"}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-[13px] font-medium text-neutral-400">OR</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading}
              className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                  fill="#EA4335"
                />
              </svg>
              {isGoogleLoading ? "Connecting..." : "Continue with Google"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleAppleSignIn}
              disabled={isAppleLoading}
              className="h-12 w-full rounded-lg border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              {isAppleLoading ? "Connecting..." : "Continue with Apple"}
            </Button>
          </div>

          {/* Links */}
          <div className="mt-6 text-center">
            <Link href="/forgot-password" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
              Forgot password?
            </Link>
            <span className="mx-2 text-neutral-300">•</span>
            <Link href="/forgot-username" className="text-[14px] font-medium text-purple-600 hover:text-purple-700">
              Forgot username?
            </Link>
          </div>

          <p className="mt-6 text-center text-[14px] text-neutral-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-medium text-purple-600 hover:text-purple-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Image */}
      <div className="relative hidden lg:block lg:w-1/2">
        <Image
          src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/sign/platform%20images/banner-login-desktop-D8selsDi.webp?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV80NmYzM2I3Ny05ZWQ4LTRmZDItOWI5MC03MWU5MTZjNjFmZDMiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJwbGF0Zm9ybSBpbWFnZXMvYmFubmVyLWxvZ2luLWRlc2t0b3AtRDhzZWxzRGkud2VicCIsImlhdCI6MTc2NzY4Mjg3MiwiZXhwIjozMzI3MjE0Njg3Mn0.KfdlnasBcTWOIbG5w0kb6bw8lW9SPOmIKlOzF4DqkYc"
          alt="Login banner"
          fill
          className="object-cover"
          priority
        />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center p-4">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
