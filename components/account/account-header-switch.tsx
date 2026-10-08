"use client"

import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { useAccountCommunityChromeActive } from "@/components/account/account-community-chrome"

export function AccountHeaderSwitch(props: { initialWishlistCount?: number; onPlatformDomain?: boolean; buyerHeaderLight?: boolean }) {
  const community = useAccountCommunityChromeActive()
  if (community) return null
  return <ConditionalHeader {...props} />
}
