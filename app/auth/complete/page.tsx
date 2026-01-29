"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Suspense } from "react"

function AuthCompleteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState("Completing sign in...")

  useEffect(() => {
    const completeAuth = async () => {
      try {
        // Check if there's a stored redirect URL from before OAuth
        const storedRedirect = localStorage.getItem("storelib_auth_redirect")

        if (storedRedirect) {
          try {
            const redirectData = JSON.parse(storedRedirect)
            localStorage.removeItem("storelib_auth_redirect")

            if (redirectData.url) {
              let finalUrl = redirectData.url
              // Add pendingReview param if it was set
              if (redirectData.pendingReview && !finalUrl.includes("pendingReview")) {
                finalUrl += (finalUrl.includes("?") ? "&" : "?") + "pendingReview=true"
              }
              setStatus("Redirecting back...")
              router.push(finalUrl)
              return
            }
          } catch {
            // Invalid JSON, continue with default flow
          }
        }

        // No stored redirect - check URL params for fallback destination
        const fallback = searchParams.get("fallback") || "/app"
        const isNewUser = searchParams.get("new") === "1"

        if (isNewUser) {
          // New users go to welcome/success page
          router.push("/signup/success")
          return
        }

        // Check user type and redirect appropriately
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push("/login")
          return
        }

        // Check if user has completed welcome
        const welcomeShown = localStorage.getItem("storelib_welcome_shown")
        if (!welcomeShown) {
          router.push("/signup/success")
          return
        }

        // Check if user is a creator
        const { data: creator } = await supabase
          .from("creators")
          .select("id, onboarding_completed")
          .eq("user_id", user.id)
          .maybeSingle()

        if (creator) {
          if (creator.onboarding_completed) {
            router.push("/app")
          } else {
            router.push("/signup/success")
          }
        } else {
          // Buyer - go to library
          const userType = localStorage.getItem("storelib_user_type")
          if (userType === "buyer") {
            router.push("/library")
          } else {
            router.push(fallback)
          }
        }
      } catch (error) {
        console.error("Auth complete error:", error)
        router.push("/app")
      }
    }

    completeAuth()
  }, [router, searchParams])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
        <p className="mt-4 text-neutral-600">{status}</p>
      </div>
    </div>
  )
}

export default function AuthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto"></div>
            <p className="mt-4 text-neutral-600">Loading...</p>
          </div>
        </div>
      }
    >
      <AuthCompleteContent />
    </Suspense>
  )
}
