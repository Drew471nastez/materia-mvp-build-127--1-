import type React from "react"
import Link from "next/link"

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
 * CALMER THAN IT WAS. It was a solid #8b5cf6 band in white type with a black
 * gradient pill and a sparkle in it: the loudest thing on every page it was
 * on, directly under the black bar. Now it is a pale violet tint, the page's
 * own dark type, and one solid violet button with no icon: still the Try Pro
 * note, and still the one place violet sits at the top of the page, without
 * shouting over the page it belongs to. No gradient.
 *
 * The same height as before, 38px on a phone and 40px wider, and the same
 * links: nothing under it moves. Home's rotating strip (AnnouncementBar in
 * components/app/dashboard-client.tsx) takes the same colours and the same
 * button from here.
 *
 * No "use client": it has no state, so a server page (Payouts) renders it as
 * it is and a client page (Analytics, Emails) the same.
 */
export const STRIP_TINT = "bg-[#f5f3ff] text-[#1a1a2e]"
export const STRIP_TITLE = "font-semibold text-[#1a1a2e]"
export const STRIP_TEXT = "text-[#6b7280]"
export const STRIP_ACTION =
  "inline-flex shrink-0 items-center rounded-full bg-[#8b5cf6] px-2.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-[#7c3aed] active:bg-[#7c3aed] md:px-3 md:py-1 md:text-[13px]"

export function AnnouncementBarMobile({ children }: { children: React.ReactNode }) {
  return (
    <div data-page-strip="" className={`w-full select-none shadow-[inset_0_-1px_0_#ede9fe] ${STRIP_TINT}`} style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}>
      {/* 38px on a phone, 40px wider: the same height as Home's (components/app/dashboard-client). */}
      <div className="h-[38px] md:h-[40px] flex items-center justify-center px-4">
        {children}
      </div>
    </div>
  )
}

/** Try Pro and the way to the plans, as Analytics, Emails and Payouts show it. */
export function TryProStrip() {
  return (
    <AnnouncementBarMobile>
      <div className="mx-auto flex max-w-[1200px] items-center justify-center gap-2 text-center md:gap-3">
        <span className="text-[12px] md:text-[14px]">
          <span className={STRIP_TITLE}>Try Pro</span>
          <span className={`hidden md:inline ${STRIP_TEXT}`}>, our most popular plan for content creators and businesses.</span>
        </span>
        <Link href="/upgrade" className={STRIP_ACTION}>
          Upgrade
        </Link>
      </div>
    </AnnouncementBarMobile>
  )
}
