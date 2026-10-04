"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"

// 3D Coin icon for creator/monetize
const CoinIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Coin base - 3D effect */}
    <ellipse cx="12" cy="14" rx="8" ry="3" fill="#D4AF37" opacity="0.6"/>
    <ellipse cx="12" cy="13" rx="8" ry="3" fill="#F5D061"/>
    {/* Main coin face */}
    <circle cx="12" cy="10" r="8" fill="url(#coinGradient)" stroke="#D4AF37" strokeWidth="1"/>
    {/* Dollar sign */}
    <path d="M12 6V7M12 13V14M10 8.5C10 7.67 10.9 7 12 7C13.1 7 14 7.67 14 8.5C14 9.33 13.1 10 12 10C10.9 10 10 10.67 10 11.5C10 12.33 10.9 13 12 13C13.1 13 14 12.33 14 11.5" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round"/>
    {/* Gradient definition */}
    <defs>
      <linearGradient id="coinGradient" x1="12" y1="2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFE066"/>
        <stop offset="50%" stopColor="#F5D061"/>
        <stop offset="100%" stopColor="#D4AF37"/>
      </linearGradient>
    </defs>
  </svg>
)

const UserIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
  onCreatorSelect?: () => void
}

export function WelcomeModal({ open, onClose, onCreatorSelect }: WelcomeModalProps) {
  const router = useRouter()
  const [hoveredCard, setHoveredCard] = useState<"creator" | "buyer" | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<"creator" | "buyer" | null>(null)

  const handleChoice = async (choice: "creator" | "buyer") => {
    // Store the choice in localStorage
    localStorage.setItem("storelib_user_type", choice)
    // For testing: comment out the line below to show modal every time
    // localStorage.setItem("storelib_welcome_shown", "true")

    // Show loading state
    setSelectedChoice(choice)
    setIsLoading(true)

    // Subtle delay for smooth transition
    await new Promise(resolve => setTimeout(resolve, 600))

    onClose()

    // Navigate based on choice
    if (choice === "creator") {
      // If creator selected, trigger the creator onboarding
      if (onCreatorSelect) {
        onCreatorSelect()
      } else {
        router.push("/app")
      }
    } else {
      router.push("/account/library")
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden border-0",
          // Desktop: centered modal with reduced height and 10% more width
          "sm:w-[640px] sm:max-w-[640px] sm:rounded-[40px]",
          // Mobile: responsive width and height
          "w-[calc(100%-32px)] max-w-none max-sm:rounded-[24px]",
          // Shadow
          "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
          // Hide the close button
          "[&>button]:hidden"
        )}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={cn(
          "flex flex-col bg-white py-6 sm:py-8 px-5 sm:px-8 transition-opacity duration-300",
          isLoading && "opacity-50"
        )}>
          {/* Logo with smooth vibrating animation */}
          <div className="flex justify-center mb-4 sm:mb-5">
            <div className="relative flex items-center justify-center">
              {/* Smooth vibrating background animations - slower duration */}
              <div
                className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 rounded-[7px] bg-purple-400/20"
                style={{
                  animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
                }}
              />
              <div
                className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 rounded-[7px] bg-purple-400/15"
                style={{
                  animation: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                }}
              />
              <StorelibLogo size={56} fluid className="relative h-12 w-12 sm:h-14 sm:w-14" />
            </div>
          </div>

          {/* Title & Subtext */}
          <div className="text-center mb-5 sm:mb-6">
            <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight mb-1.5">
              Welcome
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm">
              Choose how you want to use Storelib.
            </p>
          </div>

          {/* Cards */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5 sm:mb-6">
            {/* Creator Card */}
            <div
              className={cn(
                "flex-1 p-4 sm:p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                hoveredCard === "creator"
                  ? "border-black bg-gray-50/80"
                  : "border-gray-200 bg-white hover:border-gray-300",
                isLoading && "pointer-events-none"
              )}
              onMouseEnter={() => setHoveredCard("creator")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleChoice("creator")}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-gray-100 text-gray-600">
                <CoinIcon />
              </div>
              <h3 className="text-base font-semibold mb-0.5">I'm a creator</h3>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                Create pages and sell products.
              </p>
              <button
                disabled={isLoading}
                className={cn(
                  "w-full py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98]",
                  hoveredCard === "creator"
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  isLoading && selectedChoice === "creator" && "bg-purple-600 text-white"
                )}
              >
                {isLoading && selectedChoice === "creator" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </div>

            {/* Buyer Card */}
            <div
              className={cn(
                "flex-1 p-4 sm:p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                hoveredCard === "buyer"
                  ? "border-black bg-gray-50/80"
                  : "border-gray-200 bg-white hover:border-gray-300",
                isLoading && "pointer-events-none"
              )}
              onMouseEnter={() => setHoveredCard("buyer")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleChoice("buyer")}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-gray-100 text-gray-600">
                <UserIcon />
              </div>
              <h3 className="text-base font-semibold mb-0.5">I'm a buyer</h3>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                Explore and purchase from creators.
              </p>
              <button
                disabled={isLoading}
                className={cn(
                  "w-full py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98]",
                  hoveredCard === "buyer"
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  isLoading && selectedChoice === "buyer" && "bg-purple-600 text-white"
                )}
              >
                {isLoading && selectedChoice === "buyer" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-400 text-[11px] sm:text-xs">
            You can switch later.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Hook to manage welcome modal state
// NOTE: This modal is DISABLED - we now use the split-screen /signup/success page instead
export function useWelcomeModal() {
  const [showWelcome, setShowWelcome] = useState(false)
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    // DISABLED: The welcome modal is no longer used
    // New users are redirected to /signup/success which shows the split-screen welcome selection
    // Keep showWelcome as false - never show the old modal
    setIsChecked(true)
  }, [])

  const closeWelcome = () => {
    setShowWelcome(false)
  }

  return { showWelcome, closeWelcome, isChecked }
}
