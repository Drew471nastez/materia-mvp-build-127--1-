"use client"

export function SellerFooter() {
  return (
    <footer className="w-full bg-white border-t border-gray-100" data-seller-footer>
      {/* Mobile: Stack vertically, centered */}
      <div className="px-4 py-4 flex flex-col items-center gap-4 sm:flex-row sm:justify-between sm:gap-0">
        {/* Powered by - centered on mobile, left on desktop */}
        <span className="text-sm text-gray-500 flex items-center order-2 sm:order-1">
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
              className="h-[32px] sm:h-[39px] w-auto translate-y-[1px]"
            />
          </a>
        </span>

        {/* Legal links - centered on mobile, wrap if needed */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 order-1 sm:order-2">
          <a
            href="/privacy"
            className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="text-xs sm:text-sm text-gray-500 hover:text-gray-700 transition-colors whitespace-nowrap"
          >
            Terms & Conditions
          </a>
        </div>
      </div>
    </footer>
  )
}
