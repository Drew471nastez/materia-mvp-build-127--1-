"use client"

/**
 * A COMMUNITY'S PAGES FOR SOMEBODY WHO IS NOT IN IT YET: the sales page, the
 * invite landing, a request waiting for approval. The community's own top
 * bar (whose it is, the switcher, their own menu or Log in) and the page,
 * with no Storelib bar above it: a shared community link is the community's
 * page, not Storelib's. The pills and the member's tools are a member's,
 * so they are not here.
 */
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { TopBarData } from "@/components/community/member/view-types"
import { useLightChrome } from "@/lib/ui/light-chrome"

export function CommunityPublicFrame({ topBar, children }: { topBar: TopBarData; children: React.ReactNode }) {
  useLightChrome(true)
  return (
    <div data-community-public="" className="min-h-svh bg-[#f8f9fa] [--community-top:45px] sm:[--community-top:49px] lg:[--community-top:57px]">
      <CommunityTopBar data={topBar} />
      {children}
    </div>
  )
}
