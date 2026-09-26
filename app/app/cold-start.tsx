import type { ReactNode } from "react"
import { PageSpinner } from "@/components/ui/activity-spinner"
import { AppTopCorners } from "@/components/app/app-top-corners"

/**
 * ===========================================================================
 *  WHAT THE APP SHOWS WHILE IT FINDS THE SESSION
 * ===========================================================================
 * app/app/layout.tsx hands this to NativeAuthGate when the request could not
 * tell who is signed in: the native apps keep the session in Preferences, not
 * in a cookie, so a cold start reaches the server with none, and the gate
 * reads it on the device before anything under /app renders.
 *
 * It used to be a grey drawing of the dashboard under a violet bar: a second
 * version of Home that then turned into Home, and a violet strip under the
 * clock on every cold start. Now it is the shell's own frame, which is what
 * every page arrives in: the header's #111111 across the top, the content
 * area's #f8f9fa below it, and the same light gray spinner a slow page shows
 * (components/app/app-stage.tsx), in the same place: 40% of the way down
 * (PageSpinner), so the cold start and a slow page never disagree about
 * where it is.
 *
 * The rounded corners where the content area meets the bar are the header's
 * own (components/app/app-top-corners.tsx), hung from a box the header's
 * height, so a cold start and the page that follows it curve by the same
 * radius at every width.
 *
 * The header's height is the shell's: 68px under the status bar on a phone,
 * 58px from md, read with env(safe-area-inset-top) so a browser gets 0.
 *
 * From md the rail is there too, the sidebar's white column with its hairline,
 * and the content area starts beside it, as the slow page's surface does
 * (components/app/app-stage.tsx SlowPage). It is also what an /app page's
 * HTML shows until its script has run (components/app/app-layout-wrapper),
 * so a page that arrives as a document goes from the slow page's spinner to
 * this one in the same place, not 120ms of rail to the left of it.
 *
 * The screen of a switch between businesses (components/app/business-
 * switch-screen) is this same frame with its own words under the spinner,
 * so the two never disagree about where the header ends or the rail is.
 */
export default function AppColdStart({ children, header }: { children?: ReactNode; header?: ReactNode } = {}) {
  return (
    <div data-app-cold-start="" className="fixed inset-0 bg-[#111111] md:bg-[#131316]">
      {/* The bar, first in the markup: a document the browser paints before
          it has read to the end draws the bar before anything under it. Empty
          on a cold start, where nobody is known yet; a switch of business
          draws the business it is going to in it (components/app/shell-
          header-still). Above the content area, so its corners hang over it. */}
      <div className="absolute inset-x-0 top-0 z-[1] h-[calc(68px+env(safe-area-inset-top,0px))] text-[#111111] md:h-[calc(58px+env(safe-area-inset-top,0px))] md:text-[#131316]">
        {header}
        <AppTopCorners />
      </div>
      <div className="absolute bottom-0 left-0 top-[calc(58px+env(safe-area-inset-top,0px))] hidden w-[240px] border-r border-neutral-200/60 bg-white md:block" />
      <div className="absolute inset-x-0 bottom-0 top-[calc(68px+env(safe-area-inset-top,0px))] bg-[#f8f9fa] md:left-[240px] md:top-[calc(58px+env(safe-area-inset-top,0px))]">
        {children ?? <PageSpinner />}
      </div>
    </div>
  )
}
