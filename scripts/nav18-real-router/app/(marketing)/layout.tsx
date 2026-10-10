import type React from "react"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col marketing-flex-wrapper">
      <RouteLoadingBar />
      <ConditionalHeader initialWishlistCount={0} onPlatformDomain buyerHeaderLight />
      <main className="flex-1">{children}</main>
      <BuyerTabBar />
    </div>
  )
}
