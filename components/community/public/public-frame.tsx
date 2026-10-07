"use client"

/**
 * A COMMUNITY'S PAGES FOR SOMEBODY WHO IS NOT IN IT YET: the sales page, the
 * invite landing, a request waiting for approval. The community's own top
 * bar (whose it is, the switcher, their own menu or Log in) and the page,
 * with no Storelib bar above it: a shared community link is the community's
 * page, not Storelib's. The places and the member's tools are a member's,
 * so they are not here.
 *
 * THE SAME COLUMNS AS EVERY OTHER PAGE OF THE COMMUNITY (round 12, ask 10:
 * "the About page, member and non member, uses exactly the same page width
 * and columns as the community's other pages"). It had a frame of its own,
 * the bar and the sheet centred at 1080px, so a visitor's About and the
 * member's (inside the 1360px frame, shell-frame.tsx) were two different
 * pages, and joining moved everything. Now it is the member frame's grid:
 * the bar lined up with the 1360px columns, the community's card in the
 * left column from 1024px (its cover, name, address and member count; no
 * faces, no online count, nothing a visitor should not see), and the page
 * across the middle and the right columns from 1280px, exactly where the
 * member's About sits.
 *
 * ENTERING (round 10, ask 28): the bar is the frame and is there at once;
 * the page under it fades in (opacity only, on what is inserted, so the
 * same page drawn again does not flash).
 */
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { ShellCommunity, TopBarData, WallCardData } from "@/components/community/member/view-types"
import { WallCommunityCard } from "@/components/community/member/wall"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { useCommunityTheme } from "@/components/community/use-community-theme"
import "../community-theme.css"
import { useCommunityLanding } from "@/components/community/member/landing"
import { CommunityPullRefresh } from "@/components/community/member/community-pull-refresh"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { createClient } from "@/lib/supabase/client"
import { useEffect } from "react"
import { CommunityFixedFootWatch } from "@/components/community/fixed-foot-watch"

/** What arrives under the bar fades in (opacity only: a visitor never moves between places, so nothing rises). */
const ARRIVE = "[&>*]:animate-[fade-in_200ms_cubic-bezier(0.32,0.72,0,1)] motion-reduce:[&>*]:animate-none"

/** The member frame's own scrollbar room (shell-frame.tsx GUTTER), so the two frames centre on the same line. */
const GUTTER = "@media (min-width:1024px){html{scrollbar-gutter:stable}}html{overscroll-behavior-y:none}"

export interface PublicFrameCard {
  community: ShellCommunity
  card: WallCardData
}

export function CommunityPublicFrame({ topBar, card = null, children }: { topBar: TopBarData; /** The community's card for the left column; left out, the page has the columns alone. */ card?: PublicFrameCard | null; children: React.ReactNode }) {
  const appearance = card?.community.appearance === "dark" ? "dark" : "light"
  useCommunityTheme(appearance)
  useLightChrome(true, appearance === "dark" ? "#0e1014" : "#f8f9fa")
  const slug = card?.community.slug ?? topBar.community.slug
  /* Opened from Discover: the frame lands as an /app page does (components/community/member/landing.ts). */
  const landing = useCommunityLanding()
  const me = topBar.me
  useEffect(() => {
    if (!me) return
    if (readAuthSnapshot()?.signedIn) return
    let stop = false
    void createClient().auth.getSession().then(({ data }) => {
      if (stop) return
      const id = data.session?.user?.id
      if (!id || readAuthSnapshot()?.signedIn) return
      writeAuthSnapshot({
        signedIn: true,
        userId: id,
        avatarUrl: me.avatarUrl,
        displayName: me.name,
        username: me.username ?? null,
        isSeller: !!me.seller,
      })
    })
    return () => {
      stop = true
    }
  }, [me])
  return (
    <div
      data-community-public=""
      data-community-theme={appearance}
      data-community-landing={landing ? "" : undefined}
      className={`min-h-svh bg-[#f8f9fa] text-[#1a1a2e] transition-[background-color,color] duration-300 motion-reduce:transition-none [--community-top:57px] lg:[--community-top:65px]${landing ? " community-land" : ""}`}
    >
      <style>{GUTTER}</style>
      <CommunityFixedFootWatch />
      <CommunityTopBar data={topBar} wide />
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div data-community-columns="public" className="pb-16 pt-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:pt-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          {/* From 1280px the page's own card on the right carries the cover and the way in, so this one steps aside (round 15). */}
          <div className="hidden min-w-0 lg:col-start-1 lg:row-start-1 lg:block xl:hidden" data-community-left="">
            {card ? <WallCommunityCard community={card.community} card={card.card} membersHref={null} /> : null}
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-start-1 xl:col-span-full xl:col-start-1" data-community-main="">
            <div className={`${ARRIVE} max-sm:-mx-4 max-sm:-mt-4`} data-community-body="">
              <CommunityPullRefresh slug={slug}>{children}</CommunityPullRefresh>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
