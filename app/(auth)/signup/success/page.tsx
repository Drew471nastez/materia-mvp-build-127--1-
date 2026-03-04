"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"
import { createClient } from "@/lib/supabase/client"
import { AuthResolvingScreen } from "@/components/auth/auth-resolving-screen"
import Image from "next/image"

// Store/Creator icon - matches UserIcon style
const StoreIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const UserIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function SignupSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hoveredCard, setHoveredCard] = useState<"creator" | "buyer" | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<"creator" | "buyer" | null>(null)
  const [isRouting, setIsRouting] = useState(false)
  const [showCreatorOnboarding, setShowCreatorOnboarding] = useState(false)
  const stripeSuccess = searchParams.get("stripe_success")
  const stripeTier = searchParams.get("tier") as "growth" | "pro" | null
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // Check if user already completed onboarding - database is the source of truth
  // Uses auth state listener + retry to handle post-OAuth session delays.
  // Skip entirely while native OAuth callback is in progress — native-oauth.ts
  // owns the full flow and will navigate when done.
  useEffect(() => {
    // Guard: if native-oauth.ts is handling a deep-link callback, don't
    // run any auth checks or redirects — the handler owns navigation.
    try {
      if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
    } catch {}

    const supabase = createClient()
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const checkOnboardingStatus = async (retryCount = 0) => {
      if (cancelled) return

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Session might not be ready yet after OAuth redirect
        // Retry up to 5 times with 1s delay before giving up
        if (retryCount < 5) {
          retryTimer = setTimeout(() => checkOnboardingStatus(retryCount + 1), 1000)
          return
        }
        // After retries, try a hard reload first to force-refresh the session
        // Only redirect to login as a last resort to avoid redirect loops
        if (!cancelled) {
          const reloadAttempted = sessionStorage.getItem("storelib_success_reload")
          if (!reloadAttempted) {
            sessionStorage.setItem("storelib_success_reload", "1")
            window.location.reload()
            return
          }
          sessionStorage.removeItem("storelib_success_reload")
          // Use window.location to do a hard navigation (avoids Next.js client-side loop)
          window.location.href = "/login"
        }
        return
      }

      if (cancelled) return

      // Gate: redirect to verify page if email not yet verified
      const { data: verifyProfile } = await supabase
        .from("profiles")
        .select("email_verified")
        .eq("id", user.id)
        .maybeSingle()

      if (verifyProfile && !verifyProfile.email_verified) {
        window.location.replace(
          `/signup/verify?userId=${user.id}&email=${encodeURIComponent(user.email || "")}`
        )
        return
      }

      if (cancelled) return

      // Check database for creator record with onboarding completed
      const { data: creator } = await supabase
        .from("creators")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle()

      if (cancelled) return

      if (creator?.onboarding_completed === true) {
        window.location.replace("/app")
        return
      }

      // Check for action=become-creator FIRST — a buyer explicitly wants to
      // become a seller, so we must NOT redirect them back to /library.
      const action = searchParams.get("action")
      if (action === "become-creator") {
        setIsCheckingAuth(false)
        setShowCreatorOnboarding(true)
        return
      }

      // Check profile for welcome_completed status (for buyers)
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_creator, welcome_completed")
        .eq("id", user.id)
        .maybeSingle()

      if (cancelled) return

      if (profile?.welcome_completed === true && profile?.is_creator === false) {
        router.replace("/library")
        return
      }

      // User needs to complete onboarding - show the page
      setIsCheckingAuth(false)
    }

    // Listen for auth state changes (handles delayed session after OAuth).
    // Skip if native OAuth callback is in progress — the handler owns navigation.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      try {
        if (sessionStorage.getItem("nativeAuthInProgress") === "1") return
      } catch {}
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        checkOnboardingStatus()
      }
    })

    // Also try immediately
    checkOnboardingStatus()

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [router, searchParams])

  const handleChoice = async (choice: "creator" | "buyer") => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.replace("/login")
      return
    }

    // Show loading state
    setSelectedChoice(choice)
    setIsLoading(true)

    if (choice === "creator") {
      // Mark as creator in profiles (onboarding will complete this)
      await supabase
        .from("profiles")
        .update({ is_creator: true })
        .eq("id", user.id)

      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 400))

      // Show creator onboarding modal
      setIsLoading(false)
      setShowCreatorOnboarding(true)
    } else {
      // Mark as buyer - set welcome_completed and ensure is_creator is false
      await supabase
        .from("profiles")
        .update({
          is_creator: false,
          welcome_completed: true
        })
        .eq("id", user.id)

      // Show full-screen loader, then navigate to library (hard navigation for fresh server state)
      setIsRouting(true)
      window.location.replace("/library")
    }
  }

  const handleCreatorOnboardingComplete = () => {
    // Onboarding modal has saved everything to database
    // The modal handles navigation via window.location.replace("/app")
    setShowCreatorOnboarding(false)
  }

  // Show full-screen loader while auth is checking or route transition
  if (isCheckingAuth || isRouting) {
    return <AuthResolvingScreen />
  }

  return (
    <>
      <div className="flex min-h-svh w-full lg:h-[100dvh] lg:max-h-[100dvh] lg:overflow-hidden">
        {/* Left side - Welcome Selection */}
        <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:h-[100dvh] lg:overflow-y-auto lg:px-16 xl:px-24">
          <div className="mx-auto w-full max-w-[480px]">
            {/* Logo with smooth vibrating animation */}
            <div className="flex justify-center mb-6">
              <div className="relative flex items-center justify-center">
                {/* Smooth vibrating background animations */}
                <div
                  className="absolute inset-0 w-14 h-14 rounded-xl bg-purple-400/20"
                  style={{
                    animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
                  }}
                />
                <div
                  className="absolute inset-0 w-14 h-14 rounded-xl bg-purple-400/15"
                  style={{
                    animation: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                  }}
                />
                {/* Logo container */}
                <div className="relative w-14 h-14 rounded-xl overflow-hidden shadow-lg bg-white flex items-center justify-center">
                  <img
                    src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/5135%20(1).svg"
                    alt="Storelib"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>

            {/* Title & Subtext */}
            <div className="text-center mb-6">
              <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight mb-1.5">
                Welcome
              </h1>
              <p className="text-gray-500 text-sm">
                Choose how you want to use Storelib.
              </p>
            </div>

            {/* Cards */}
            <div className={cn(
              "flex flex-col gap-3 mb-6 transition-opacity duration-300",
              isLoading && "opacity-50"
            )}>
              {/* Creator Card */}
              <div
                className={cn(
                  "p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                  hoveredCard === "creator"
                    ? "border-black bg-gray-50/80"
                    : "border-gray-200 bg-white hover:border-gray-300",
                  isLoading && "pointer-events-none"
                )}
                onMouseEnter={() => setHoveredCard("creator")}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => handleChoice("creator")}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 shrink-0">
                    <StoreIcon />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold mb-0.5">I'm a creator</h3>
                    <p className="text-gray-500 text-sm">
                      Create pages and sell products.
                    </p>
                  </div>
                  <button
                    disabled={isLoading}
                    className={cn(
                      "px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98] shrink-0 cursor-pointer disabled:cursor-not-allowed",
                      hoveredCard === "creator"
                        ? "bg-purple-600 text-white hover:bg-purple-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      isLoading && selectedChoice === "creator" && "bg-purple-600 text-white"
                    )}
                  >
                    {isLoading && selectedChoice === "creator" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Continue"
                    )}
                  </button>
                </div>
              </div>

              {/* Buyer Card */}
              <div
                className={cn(
                  "p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                  hoveredCard === "buyer"
                    ? "border-black bg-gray-50/80"
                    : "border-gray-200 bg-white hover:border-gray-300",
                  isLoading && "pointer-events-none"
                )}
                onMouseEnter={() => setHoveredCard("buyer")}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => handleChoice("buyer")}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gray-100 text-gray-600 shrink-0">
                    <UserIcon />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold mb-0.5">I'm a buyer</h3>
                    <p className="text-gray-500 text-sm">
                      Explore and purchase from creators.
                    </p>
                  </div>
                  <button
                    disabled={isLoading}
                    className={cn(
                      "px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98] shrink-0 cursor-pointer disabled:cursor-not-allowed",
                      hoveredCard === "buyer"
                        ? "bg-purple-600 text-white hover:bg-purple-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                      isLoading && selectedChoice === "buyer" && "bg-purple-600 text-white"
                    )}
                  >
                    {isLoading && selectedChoice === "buyer" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Continue"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-center text-gray-400 text-xs">
              You can switch later.
            </p>
          </div>
        </div>

        {/* Right side — same full-bleed image panel as login/signup */}
        <div className="relative hidden lg:block lg:w-1/2 lg:h-[100dvh] shrink-0 overflow-hidden bg-neutral-900">
          <Image
            src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/collage%20imags/awapage.png"
            alt="Welcome banner"
            fill
            className="object-cover object-center"
            sizes="(min-width: 1024px) 50vw, 0px"
            quality={75}
            priority
          />
        </div>
      </div>

      {/* Creator Onboarding Modal */}
      <CreatorOnboardingModal
        open={showCreatorOnboarding}
        onClose={handleCreatorOnboardingComplete}
        resumeFromStripe={
          stripeSuccess === "1" && stripeTier
            ? { planId: stripeTier }
            : null
        }
      />
    </>
  )
}
