import type React from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE STRIP AT THE TOP OF A PAGE: TRY PRO, AND HOME'S OTHER NOTES
 * ===========================================================================
 * Rendered inline at the top of the page's content, under the black bar, and
 * scrolled away with it. The bar's rounded corners (components/app/
 * app-top-corners.tsx) are drawn over its two top corners, so it sits inside
 * the page's rounded top instead of running square and edge to edge under
 * the bar.
 *
 * THE VIOLET BAND, AS IT WAS. For a day it was a pale violet tint with dark
 * type; the owner wants the band back: solid #8b5cf6, white type, and the
 * near black Upgrade pill with a hairline of white round it and the
 * sparkle. The pill is solid now rather than a black gradient (CLAUDE.md:
 * no gradients), which reads the same at this size.
 *
 * The same height as before, 38px on a phone and 40px wider, and the same
 * links: nothing under it moves. Home's rotating strip (AnnouncementBar in
 * components/app/dashboard-client.tsx) takes the same colours and the same
 * button from here.
 *
 * No "use client": it has no state, so a server page (Payouts) renders it as
 * it is and a client page (Analytics, Emails) the same.
 *
 * NOT ON A PHONE. The owner asked for Try Pro to go on mobile ("get rid of
 * it", Emails first). Below md TryProStrip is `display: none`, by CSS rather
 * than by reading the width, so the server's markup is already right and
 * nothing shows for a frame and then goes. It was in the flow at the top of
 * each page's own scroller and nothing measured it (no CSS variable, no
 * sticky offset), so the page simply starts at the black bar's rounded
 * corners, as Orders and Products do. Upgrade stays one press away in the
 * phone header's bolt (components/app/upgrade-bolt.tsx) and in Settings.
 */
export const STRIP_TINT = "bg-[#8b5cf6] text-white"
export const STRIP_TITLE = "font-semibold text-white"
export const STRIP_TEXT = "text-white/85"
export const STRIP_ACTION =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-[#111111] px-2.5 py-0.5 text-[11px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] transition-[box-shadow,background-color] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] active:bg-black md:gap-1.5 md:px-3 md:py-1 md:text-[13px]"
/** The pill's sparkle, beside Upgrade. */
export const STRIP_SPARKLE = "h-3 w-3 shrink-0 md:h-3.5 md:w-3.5"

export function AnnouncementBarMobile({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-page-strip="" className={`w-full select-none ${STRIP_TINT} ${className}`} style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}>
      {/* 38px on a phone, 40px wider: the same height as Home's (components/app/dashboard-client). */}
      <div className="h-[38px] md:h-[40px] flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  )
}

/** Try Pro and the way to the plans, as Analytics, Emails and Payouts show it: from md up only. */
export function TryProStrip() {
  return (
    <AnnouncementBarMobile className="hidden md:block">
      <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-2 text-center md:gap-3">
        <span className="text-[12px] md:text-[14px]">
          <span className={STRIP_TITLE}>{tt("Try Pro")}</span>
          <span className={`hidden md:inline ${STRIP_TEXT}`}>{tt(", our most popular plan for content creators and businesses.")}</span>
        </span>
        <Link href="/upgrade" className={STRIP_ACTION}>
          <Sparkles className={STRIP_SPARKLE} aria-hidden="true" />
          {tt("Upgrade")}
        </Link>
      </div>
    </AnnouncementBarMobile>
  )
}
