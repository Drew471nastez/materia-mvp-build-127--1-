"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { CreatorOnboardingModal } from "@/components/app/creator-onboarding-modal"

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
  const [hoveredCard, setHoveredCard] = useState<"creator" | "buyer" | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<"creator" | "buyer" | null>(null)
  const [showCreatorOnboarding, setShowCreatorOnboarding] = useState(false)

  const handleChoice = async (choice: "creator" | "buyer") => {
    // Store the choice in localStorage
    localStorage.setItem("storelib_user_type", choice)
    localStorage.setItem("storelib_welcome_shown", "true")

    // Show loading state
    setSelectedChoice(choice)
    setIsLoading(true)

    // Subtle delay for smooth transition
    await new Promise(resolve => setTimeout(resolve, 600))

    if (choice === "creator") {
      // Show creator onboarding
      setIsLoading(false)
      setShowCreatorOnboarding(true)
    } else {
      // Navigate to library for buyers
      router.push("/library")
    }
  }

  const handleCreatorOnboardingClose = () => {
    setShowCreatorOnboarding(false)
    // The creator onboarding modal handles the redirect to /app
  }

  return (
    <>
      <div className="flex min-h-svh w-full">
        {/* Left side - Welcome Selection */}
        <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16 xl:px-24">
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
                      "px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98] shrink-0",
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
                      "px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98] shrink-0",
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

        {/* Right side - Image (same as signup page) */}
        <div className="relative hidden lg:block lg:w-1/2">
          <Image
            src="/images/design-mode/banner-signup-desktop-Dq7usIXX.webp"
            alt="Signup banner"
            fill
            className="object-cover"
            priority
          />
        </div>
      </div>

      {/* Creator Onboarding Modal */}
      <CreatorOnboardingModal
        open={showCreatorOnboarding}
        onClose={handleCreatorOnboardingClose}
      />
    </>
  )
}
