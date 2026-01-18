"use client"

import { cn } from "@/lib/utils"

interface SellerFooterProps {
  isMobile?: boolean
}

export function SellerFooter({ isMobile }: SellerFooterProps = {}) {
  // Determine if we should use mobile layout
  const useMobileLayout = isMobile === true
  const useDesktopLayout = isMobile === false
  const useResponsiveLayout = isMobile === undefined

  return (
    <footer className="w-full bg-white border-t border-gray-100" data-seller-footer>
      <div className={cn(
        "px-3 flex items-center w-full",
        useMobileLayout
          ? "flex-col justify-center gap-1.5 py-3"
          : useDesktopLayout
            ? "flex-row justify-between py-4 px-4"
            : "flex-col gap-1.5 py-3 sm:flex-row sm:justify-between sm:py-4 sm:px-4"
      )}>
        {/* Mobile: Powered by above, links below centered */}
        {useMobileLayout ? (
          <>
            {/* Powered by centered at top */}
            <div className="flex items-center justify-center gap-1 w-full">
              <span className="text-[11px] text-gray-400 whitespace-nowrap">Powered by</span>
              <a
                href="/"
                className="inline-flex items-center shrink-0"
                aria-label="Go to Storelib homepage"
              >
                <img
                  src="/images/design-mode/storelib.png"
                  alt="Storelib"
                  className="h-[14px] w-auto"
                />
              </a>
            </div>
            {/* Links centered below */}
            <div className="flex items-center justify-center gap-2 w-full">
              <a
                href="/privacy"
                className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="text-[11px] text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                Terms
              </a>
            </div>
          </>
        ) : useDesktopLayout ? (
          <>
            {/* Desktop: Powered by on left */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-gray-500 whitespace-nowrap">Powered by</span>
              <a
                href="/"
                className="inline-flex items-center shrink-0"
                aria-label="Go to Storelib homepage"
              >
                <img
                  src="/images/design-mode/storelib.png"
                  alt="Storelib"
                  className="h-[32px] w-auto translate-y-[1px]"
                />
              </a>
            </div>
            {/* Desktop: Links on right */}
            <div className="flex items-center gap-6">
              <a
                href="/privacy"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                Terms & Conditions
              </a>
            </div>
          </>
        ) : (
          /* Responsive: Mobile-first that adapts to desktop - uses actual viewport breakpoints */
          <>
            {/* Powered by - top on mobile, left on desktop */}
            <div className={cn(
              "flex items-center justify-center gap-1 w-full",
              "sm:w-auto sm:justify-start sm:gap-1.5"
            )}>
              <span className="text-[11px] sm:text-sm text-gray-400 sm:text-gray-500 whitespace-nowrap">Powered by</span>
              <a
                href="/"
                className="inline-flex items-center shrink-0"
                aria-label="Go to Storelib homepage"
              >
                <img
                  src="/images/design-mode/storelib.png"
                  alt="Storelib"
                  className="h-[14px] sm:h-[32px] w-auto sm:translate-y-[1px]"
                />
              </a>
            </div>
            {/* Links - bottom on mobile (centered), right on desktop */}
            <div className={cn(
              "flex items-center justify-center gap-2 w-full",
              "sm:w-auto sm:justify-end sm:gap-6"
            )}>
              <a
                href="/privacy"
                className="text-[11px] sm:text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="text-[11px] sm:text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
              >
                <span className="sm:hidden">Terms</span>
                <span className="hidden sm:inline">Terms & Conditions</span>
              </a>
            </div>
          </>
        )}
      </div>
    </footer>
  )
}
