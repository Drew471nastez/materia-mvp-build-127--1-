import type React from "react"
import type { Metadata } from "next"
import { PRIVATE_PAGE_METADATA } from "@/lib/seo/private-metadata"
import { isBuyerHeaderLight } from "@/lib/platform/buyer-header-theme"
import { isPlatformDomain, readWishlistCount } from "@/lib/platform/header-props"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"

/**
 * ===========================================================================
 *  A RECEIPT IS ONE OF STORELIB'S PAGES, WITH STORELIB AROUND IT
 * ===========================================================================
 * "The receipt page: no Storelib header, no bottom tab bar, no way back"
 * (image 64, the iPhone app after a purchase). The receipt sat outside every
 * layout that draws the platform's chrome, so a person who had just bought
 * something in the app was on a page with nothing around it, and the only
 * way off was to close the app.
 *
 * It has the same frame as the library now: the Storelib header (the same
 * component the buyer pages mount, which decides its own variant), the
 * phone's tab bar with Library lit (lib/nav/buyer-tabs.ts), and the loading
 * line between pages. The receipt itself draws a back chevron that returns
 * where the person came from, or to the library
 * (app/receipt/[token]/receipt-view.tsx).
 *
 * None of it prints: Print is one of the receipt's own buttons, and the
 * paper should be the receipt alone.
 */
/* One buyer's receipt: noindex and no canonical for every page under it (lib/seo/private-metadata.ts). */
export const metadata: Metadata = PRIVATE_PAGE_METADATA

export default async function ReceiptLayout({ children }: { children: React.ReactNode }) {
  const [initialWishlistCount, onPlatformDomain, buyerHeaderLight] = await Promise.all([
    readWishlistCount(),
    isPlatformDomain(),
    isBuyerHeaderLight(),
  ])
  return (
    <div className="flex min-h-svh flex-col bg-[#f5f6f8] print:bg-white" data-receipt-frame="">
      <div className="contents print:hidden">
        <RouteLoadingBar />
        <ConditionalHeader initialWishlistCount={initialWishlistCount} onPlatformDomain={onPlatformDomain} buyerHeaderLight={buyerHeaderLight} />
      </div>
      <div className="flex-1">{children}</div>
      <div className="contents print:hidden">
        <BuyerTabBar />
      </div>
    </div>
  )
}
