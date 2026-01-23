"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// This page now redirects to /signup/success which handles the welcome selection
// The old multi-step onboarding is replaced by the new CreatorOnboardingModal
export default function OnboardingPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to signup/success for the new welcome selection flow
    router.replace("/signup/success")
  }, [router])

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
        <p className="mt-4 text-neutral-500">Redirecting...</p>
      </div>
    </div>
  )
}
