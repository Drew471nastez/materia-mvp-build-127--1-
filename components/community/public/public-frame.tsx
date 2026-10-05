"use client"

/**
 * A COMMUNITY'S PAGES FOR SOMEBODY WHO IS NOT IN IT YET: the sales page, the
 * invite landing, a request waiting for approval. The community's own top
 * bar (whose it is, the switcher, their own menu or Log in) and the page,
 * with no Storelib bar above it: a shared community link is the community's
 * page, not Storelib's. The pills and the member's tools are a member's,
 * so they are not here.
 *
 * ENTERING (round 10, ask 28): the bar is the frame and is there at once;
 * the page under it fades in (opacity only, on what is inserted, so the
 * same page drawn again does not flash), as the member frame's middle
 * column does (shell-frame.tsx ARRIVE).
 */
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { TopBarData } from "@/components/community/member/view-types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { useCommunityLanding } from "@/components/community/member/landing"

/** What arrives under the bar fades in: the member frame's own (shell-frame.tsx ARRIVE), named here so this frame does not load that one. */
const ARRIVE = "[&>*]:animate-[fade-in_200ms_cubic-bezier(0.32,0.72,0,1)] motion-reduce:[&>*]:animate-none"

export function CommunityPublicFrame({ topBar, children }: { topBar: TopBarData; children: React.ReactNode }) {
  useLightChrome(true)
  /* Opened from Discover: the frame lands as an /app page does (components/community/member/landing.ts). */
  const landing = useCommunityLanding()
  return (
    <div
      data-community-public=""
      data-community-landing={landing ? "" : undefined}
      className={`min-h-svh bg-[#f8f9fa] [--community-top:57px] lg:[--community-top:65px]${landing ? " community-land" : ""}`}
    >
      <CommunityTopBar data={topBar} />
      <div className={ARRIVE} data-community-body="">
        {children}
      </div>
    </div>
  )
}
