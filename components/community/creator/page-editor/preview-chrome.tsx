"use client"

/**
 * THE FRAME A VISITOR'S ABOUT PAGE SITS IN, FOR THE PREVIEW (round 33). The
 * visitor's frame (components/community/public/public-frame.tsx) writes to
 * the document it is in (the look on <html>, the browser's bar colour, the
 * signed in snapshot), so the preview draws its bar and columns here with
 * the same classes instead: the community's bar as a signed out visitor
 * sees it (the menu, the logo, the name, By its creator, Log in) and the
 * page in the frame's grid, 1360px wide. The page inside is the real one.
 */
import { Menu } from "lucide-react"
import { CommunityMark } from "@/components/community/member/community-mark"
import type { PublicCommunityView } from "@/components/community/public/types"

export function PreviewChrome({ community, children }: { community: PublicCommunityView; children: React.ReactNode }) {
  return (
    <div data-community-public="" data-preview-chrome="" className="min-h-svh bg-[#f8f9fa] text-[#1a1a2e] [--community-top:57px] lg:[--community-top:65px]">
      <header data-community-top="" className="sticky top-0 z-40 border-b border-[#e6e8ec] bg-white">
        <div className="mx-auto flex w-full max-w-[1360px] items-center px-4 sm:px-6 md:gap-x-4 lg:gap-x-6 lg:px-8">
          <div className="flex h-14 min-w-0 flex-1 items-center gap-2 md:gap-3 lg:h-16 lg:w-[260px] lg:max-w-none lg:flex-none xl:w-[280px]">
            <span aria-hidden className="order-first flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#1a1a2e] shadow-[0_0_0_1px_rgba(16,24,40,0.08),0_1px_2px_rgba(16,24,40,0.06)] md:order-none">
              <Menu className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <span className="flex shrink-0 rounded-[10px]" data-page-block="logo">
              <span className="flex md:hidden">
                <CommunityMark community={community} size={36} priority />
              </span>
              <span className="hidden md:flex">
                <CommunityMark community={community} size={40} priority />
              </span>
            </span>
            <div className="min-w-0 leading-tight">
              <p data-page-block="name" className="line-clamp-2 break-words text-[15px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1a1a2e] md:line-clamp-1 md:text-[16px] md:leading-tight">{community.name}</p>
              {community.creator ? (
                <p className="hidden truncate text-[12.5px] leading-[1.35] text-[#6b7280] md:block">
                  By <span className="font-medium text-[#4b5563]">{community.creator.name}</span>
                </p>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex h-14 shrink-0 items-center lg:h-16">
            <span className="-mr-2 inline-flex h-10 items-center px-2 text-[14px] font-semibold text-[#1a1a2e]">Log in</span>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div data-community-columns="public" className="pb-16 pt-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-x-6 lg:pt-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <div className="min-w-0 lg:col-span-full lg:col-start-1 lg:row-start-1" data-community-main="">
            <div className="max-sm:-mx-4 max-sm:-mt-4" data-community-body="">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
