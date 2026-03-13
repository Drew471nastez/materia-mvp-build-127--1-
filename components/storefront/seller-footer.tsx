"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"

interface SellerFooterProps {
  isMobile?: boolean
}

/**
 * SellerFooter - Footer component for seller storefronts
 *
 * Modes:
 * - isMobile=true: Mobile preview in editor (375px canvas on desktop)
 * - isMobile=false: Desktop preview in editor
 * - isMobile=undefined: Live pages (uses CSS responsive breakpoints)
 *
 * IMPORTANT: When editing from a real mobile device, the footer will show
 * the mobile layout regardless of the preview toggle state (uses CSS breakpoints).
 */
export function SellerFooter({ isMobile }: SellerFooterProps = {}) {
  // In Capacitor apps, navigate within the app instead of opening external browser
  const [storelibHref, setStorelibHref] = useState("https://storelib.com/explore")
  useEffect(() => {
    if (isNativeApp()) setStorelibHref("/explore")
  }, [])

  // Determine layout mode
  const useMobileLayout = isMobile === true
  const useDesktopLayout = isMobile === false
  const useResponsiveLayout = isMobile === undefined

  // Mobile layout content - "Powered by" + Storelib centered at top, links below with separator
  const MobileContent = () => (
    <>
      {/* Powered by centered at top */}
      <div className="flex items-center justify-center gap-1.5 w-full">
        <span className="text-[11px] text-gray-400 whitespace-nowrap">Powered by</span>
        <a
          href={storelibHref}
          className="inline-flex items-center gap-1 shrink-0"
          aria-label="Explore Storelib"
        >
          <img
            src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
            alt="Storelib"
            className="h-[15px] w-auto rounded-lg"
          />
          <span className="text-[12px] font-semibold text-gray-700 tracking-tight leading-none">Storelib</span>
        </a>
      </div>
      {/* Privacy and Terms centered below with separator */}
      <div className="flex items-center justify-center gap-2.5 w-full">
        <a
          href="/privacy"
          className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Privacy Policy
        </a>
        <span className="text-[11px] text-gray-300">|</span>
        <a
          href="/terms"
          className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Terms & Conditions
        </a>
      </div>
    </>
  )

  // Desktop layout content - Row with space-between
  const DesktopContent = () => (
    <>
      {/* Powered by on left */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-500 whitespace-nowrap">Powered by</span>
        <a
          href={storelibHref}
          className="inline-flex items-center gap-1.5 shrink-0"
          aria-label="Explore Storelib"
        >
          <img
            src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
            alt="Storelib"
            className="h-[18px] w-auto rounded-lg"
          />
          <span className="text-sm font-semibold text-gray-700 tracking-tight leading-none">Storelib</span>
        </a>
      </div>
      {/* Links on right */}
      <div className="flex items-center gap-6">
        <a
          href="/privacy"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Privacy Policy
        </a>
        <a
          href="/terms"
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Terms & Conditions
        </a>
      </div>
    </>
  )

  // Responsive content - uses CSS breakpoints for actual viewport size
  const ResponsiveContent = () => (
    <>
      {/* Powered by - top on mobile, left on desktop */}
      <div className={cn(
        "flex items-center justify-center gap-1.5 w-full",
        "sm:w-auto sm:justify-start"
      )}>
        <span className="text-[11px] sm:text-sm text-gray-400 sm:text-gray-500 whitespace-nowrap">Powered by</span>
        <a
          href={storelibHref}
          className="inline-flex items-center gap-1 sm:gap-1.5 shrink-0"
          aria-label="Explore Storelib"
        >
          <img
            src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"
            alt="Storelib"
            className="h-[15px] sm:h-[18px] w-auto rounded-lg"
          />
          <span className="text-[12px] sm:text-sm font-semibold text-gray-700 tracking-tight leading-none">Storelib</span>
        </a>
      </div>
      {/* Links - bottom on mobile (centered with separator), right on desktop */}
      <div className={cn(
        "flex items-center justify-center gap-2.5 w-full",
        "sm:w-auto sm:justify-end sm:gap-6"
      )}>
        <a
          href="/privacy"
          className="text-[11px] sm:text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Privacy Policy
        </a>
        <span className="text-[11px] text-gray-300 sm:hidden">|</span>
        <a
          href="/terms"
          className="text-[11px] sm:text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          Terms & Conditions
        </a>
      </div>
    </>
  )

  return (
    <footer className="w-full bg-white border-t border-gray-100" data-seller-footer>
      {useMobileLayout ? (
        // Mobile preview toggle in editor (375px canvas on desktop)
        // But if actual viewport is small (real phone editing), show mobile layout via CSS
        <>
          {/* On actual small screens (real phone), show mobile layout */}
          <div className="block sm:hidden">
            <div className="flex flex-col items-center justify-center gap-3 py-5 px-4 w-full max-w-6xl mx-auto">
              <MobileContent />
            </div>
          </div>
          {/* On actual large screens (desktop with mobile preview toggle), show mobile layout */}
          <div className="hidden sm:block">
            <div className="flex flex-col items-center justify-center gap-3 py-5 px-4 w-full max-w-6xl mx-auto">
              <MobileContent />
            </div>
          </div>
        </>
      ) : useDesktopLayout ? (
        // Desktop preview toggle in editor
        // But if actual viewport is small (real phone editing desktop view), show mobile layout via CSS
        <>
          {/* On actual small screens (real phone editing), ALWAYS show mobile layout for proper fit */}
          <div className="block sm:hidden">
            <div className="flex flex-col items-center justify-center gap-3 py-5 px-4 w-full max-w-6xl mx-auto">
              <MobileContent />
            </div>
          </div>
          {/* On actual large screens (desktop with desktop preview), show desktop layout */}
          <div className="hidden sm:block">
            <div className="flex flex-row items-center justify-between py-4 px-6 w-full max-w-6xl mx-auto">
              <DesktopContent />
            </div>
          </div>
        </>
      ) : (
        // Responsive layout for live pages - uses actual viewport breakpoints
        <div className={cn(
          "flex items-center w-full max-w-6xl mx-auto",
          "flex-col gap-3 py-5 px-4 sm:flex-row sm:justify-between sm:py-4 sm:px-6"
        )}>
          <ResponsiveContent />
        </div>
      )}
    </footer>
  )
}
