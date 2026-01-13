"use client"

export function SellerFooter() {
  return (
    <footer className="w-full bg-white border-t border-gray-100">
      <div className="px-4 py-4 flex items-center">
        <span className="text-sm text-gray-500 flex items-center translate-x-[8px]">
          {/* Powered by text – tighter gap */}
          <span className="text-[calc(0.875rem+4px)] mr-[4px]">
            Powered by
          </span>

          {/* Clickable Storelib logo */}
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
      </div>
    </footer>
  )
}
