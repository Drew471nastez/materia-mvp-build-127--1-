"use client"

import { cn } from "@/lib/utils"

interface SellerFooterProps {
  isMobile?: boolean
}

export function SellerFooter({ isMobile }: SellerFooterProps = {}) {
  return (
    <footer className="w-full bg-white border-t border-gray-100" data-seller-footer>
      {/* Mobile: Stack vertically, centered */}
      <div className={cn(
        "px-4 py-4 flex items-center",
        // When isMobile is explicitly set (editor preview), use it to determine layout
        // When isMobile is undefined (live pages), use responsive classes
        isMobile === true
          ? "flex-col gap-4"
          : isMobile === false
            ? "flex-row justify-between gap-0"
            : "flex-col gap-4 sm:flex-row sm:justify-between sm:gap-0"
      )}>
        {/* Powered by - centered on mobile, left on desktop */}
        <span className={cn(
          "text-sm text-gray-500 flex items-center",
          isMobile === true
            ? "order-2"
            : isMobile === false
              ? "order-1"
              : "order-2 sm:order-1"
        )}>
          <span className="text-[calc(0.875rem+4px)] mr-[4px]">
            Powered by
          </span>

          <a
            href="/"
            className="inline-flex items-center"
            aria-label="Go to Storelib homepage"
          >
            <img
              src="/images/design-mode/storelib.png"
              alt="Storelib"
              className={cn(
                "w-auto translate-y-[1px]",
                isMobile === true
                  ? "h-[32px]"
                  : isMobile === false
                    ? "h-[39px]"
                    : "h-[32px] sm:h-[39px]"
              )}
            />
          </a>
        </span>

        {/* Legal links - centered on mobile, wrap if needed */}
        <div className={cn(
          "flex flex-wrap items-center justify-center",
          isMobile === true
            ? "gap-3 order-1"
            : isMobile === false
              ? "gap-6 order-2"
              : "gap-3 sm:gap-6 order-1 sm:order-2"
        )}>
          <a
            href="/privacy"
            className={cn(
              "text-gray-500 hover:text-gray-700 transition-colors",
              isMobile === true
                ? "text-xs"
                : isMobile === false
                  ? "text-sm"
                  : "text-xs sm:text-sm"
            )}
          >
            Privacy
          </a>
          <a
            href="/terms"
            className={cn(
              "text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap",
              isMobile === true
                ? "text-xs"
                : isMobile === false
                  ? "text-sm"
                  : "text-xs sm:text-sm"
            )}
          >
            Terms & Conditions
          </a>
        </div>
      </div>
    </footer>
  )
}
