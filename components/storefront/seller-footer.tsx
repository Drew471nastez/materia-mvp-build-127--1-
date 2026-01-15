"use client"

export function SellerFooter() {
  return (
    <footer className="w-full bg-white border-t border-gray-100" data-seller-footer>
      <div className="px-4 py-4 flex items-center justify-between">
        {/* Left side - Powered by */}
        <span className="text-sm text-gray-500 flex items-center translate-x-[8px]">
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
              className="h-[39px] w-auto translate-y-[1px]"
            />
          </a>
        </span>

        {/* Right side - Legal links */}
        <div className="flex items-center gap-4 sm:gap-6">
          <a
            href="/privacy"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Privacy
          </a>
          <a
            href="/terms"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Terms & Conditions
          </a>
        </div>
      </div>
    </footer>
  )
}
