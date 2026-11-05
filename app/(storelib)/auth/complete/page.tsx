"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { safeReturnTarget } from "@/lib/auth/return-to"
import { getMainDomain } from "@/lib/url-helpers"
import { Suspense } from "react"

function AuthCompleteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState("Completing sign in...")

  useEffect(() => {
    // Hard safety net — if anything hangs for > 8s, force redirect to /app
    const hardTimeout = setTimeout(() => {
      console.warn("Auth complete: hard timeout reached, redirecting to /app")
      window.location.href = "/app"
    }, 8000)

    const completeAuth = async () => {
      try {
        // Check if there's a stored redirect URL from before OAuth
        let storedRedirect = localStorage.getItem("storelib_auth_redirect")

        if (!storedRedirect) {
          const cookieMatch = document.cookie
            .split("; ")
            .find((row) => row.startsWith("storelib_auth_redirect="))
          if (cookieMatch) {
            try {
              storedRedirect = decodeURIComponent(cookieMatch.split("=")[1])
            } catch {
              // Ignore decoding errors
            }
          }
        }

        if (storedRedirect) {
          try {
            const redirectData = JSON.parse(storedRedirect)

            localStorage.removeItem("storelib_auth_redirect")
            const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
            const isLocalhost = mainDomain.includes("localhost")
            let clearCookie = "storelib_auth_redirect=; max-age=0; path=/"
            if (!isLocalhost) {
              clearCookie += `; domain=.${mainDomain}`
            }
            document.cookie = clearCookie

            if (redirectData.autoBuyer) {
              localStorage.setItem("storelib_user_type", "buyer")
              localStorage.setItem("storelib_welcome_shown", "true")
            }

            /*
              Checked again here, not only where it was written: the cookie is
              set for .storelib.com, so a published site on a subdomain can
              write it too (round 48).
            */
            const storedUrl = safeReturnTarget(redirectData.url, { mainDomain: getMainDomain() })
            if (storedUrl) {
              let finalUrl = storedUrl
              if (redirectData.pendingReview && !finalUrl.includes("pendingReview")) {
                finalUrl += (finalUrl.includes("?") ? "&" : "?") + "pendingReview=true"
              }
              setStatus("Redirecting back...")
              clearTimeout(hardTimeout)
              router.push(finalUrl)
              return
            }
          } catch {
            // Invalid JSON, continue with default flow
          }
        }

        const fallback = safeReturnTarget(searchParams.get("fallback"), { mainDomain: getMainDomain() }) || "/app"
        const isNewUser = searchParams.get("new") === "1"

        if (isNewUser) {
          clearTimeout(hardTimeout)
          router.push("/signup/success")
          return
        }

        // Retry getUser up to 3 times — session cookies may not be available
        // immediately after the OAuth redirect on the first render
        const supabase = createClient()
        let user = null
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data } = await supabase.auth.getUser()
          if (data.user) {
            user = data.user
            break
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 600))
          }
        }

        if (!user) {
          clearTimeout(hardTimeout)
          window.location.href = "/login"
          return
        }

        // Run profile and creator queries in parallel for speed
        const [profileResult, creatorResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("welcome_completed, is_creator")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("creators")
            .select("id, onboarding_completed")
            .eq("user_id", user.id)
            .maybeSingle(),
        ])

        const profile = profileResult.data
        const creator = creatorResult.data

        if (profile?.welcome_completed) {
          localStorage.setItem("storelib_welcome_shown", "true")
        }

        const welcomeShown = profile?.welcome_completed || localStorage.getItem("storelib_welcome_shown")
        if (!welcomeShown) {
          clearTimeout(hardTimeout)
          router.push("/signup/success")
          return
        }

        clearTimeout(hardTimeout)

        if (creator) {
          router.push(creator.onboarding_completed ? "/app" : "/signup/success")
        } else {
          const userType = localStorage.getItem("storelib_user_type")
          router.push(userType === "buyer" ? "/account/library" : fallback)
        }
      } catch (error) {
        console.error("Auth complete error:", error)
        clearTimeout(hardTimeout)
        router.push("/app")
      }
    }

    completeAuth()

    return () => clearTimeout(hardTimeout)
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
