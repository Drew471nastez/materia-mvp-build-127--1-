"use client"
import type React from "react"
import { ACCOUNT_COMMUNITY_HEADER_BOOT } from "@/lib/nav/account-community-header-boot"
import { AccountHeaderSwitch } from "@/components/account/account-header-switch"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"
import { AccountHub, type AccountIdentity } from "@/components/account/account-hub"
import { AccountNavFade } from "@/components/account/account-nav-fade"
import { LibraryBgFix } from "@/components/library/library-bg-fix"
export function AccountFix({ identity, children }: { identity: AccountIdentity; children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[#fafafa]" data-page="account">
      <script dangerouslySetInnerHTML={{ __html: ACCOUNT_COMMUNITY_HEADER_BOOT }} />
      <RouteLoadingBar />
      <LibraryBgFix />
      <AccountHeaderSwitch initialWishlistCount={0} onPlatformDomain buyerHeaderLight />
      <main className="flex-1 overflow-x-clip">
        <AccountNavFade>
          <AccountHub identity={identity} communities>
            {children}
          </AccountHub>
        </AccountNavFade>
      </main>
      <BuyerTabBar />
    </div>
  )
}
