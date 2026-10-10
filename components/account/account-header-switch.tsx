"use client"

import { usePathname } from "next/navigation"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import { useAccountCommunityChromeActive } from "@/components/account/account-community-chrome"
import { useCommunityContextMeta } from "@/lib/nav/community-context"
import { readCommunityChrome } from "@/lib/nav/community-chrome-cache"
import { showsProfileHeader } from "@/lib/profile/owner-pills"

/*
  STORELIB'S HEADER IS NOT BUILT TO BE TAKEN DOWN AGAIN (round 18). Arriving at the profile from a community, the community's
  bar is the one drawn (account-community-chrome.tsx), but it says so in its layout effect, after this has rendered: the
  whole platform header (its menus, its sheets, its measuring) was built, mounted and unmounted on every press on Profile,
  measured as a forced layout and a sheet's teardown inside the arrival's longest task at 4x CPU. The bar remembered for the
  community is read here as it is there, during render, so this draws nothing from the first frame. While hydrating the
  community context reads empty on both sides, so the server's HTML and the first render still agree.
*/
export function AccountHeaderSwitch(props: { initialWishlistCount?: number; onPlatformDomain?: boolean; buyerHeaderLight?: boolean }) {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const drawn = useAccountCommunityChromeActive()
  const remembered = !!ctx.slug && showsProfileHeader(pathname) && !!readCommunityChrome(ctx.slug)
  if (drawn || remembered) return null
  return <ConditionalHeader {...props} />
}
