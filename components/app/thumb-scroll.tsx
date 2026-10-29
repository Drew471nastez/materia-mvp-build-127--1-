"use client"

/**
 * ===========================================================================
 *  A LIST THAT SCROLLS INSIDE A PAGE, WITH THE APP'S OWN SLIM BAR
 * ===========================================================================
 * The product pickers of the offer and collection pages scroll inside a box
 * of their own. Left to the platform that box drew a 15px grey column down
 * its right side on a computer, its own track and arrows inside the
 * rounded border. This is the /app sidebar's bar instead
 * (./sidebar-scroll-thumb.tsx): the platform's is hidden (app/globals.css
 * [data-thumb-scroll]) and a 4px thumb is drawn over the box's edge, so it
 * takes no width and the rows sit where they would with no bar at all. It
 * fades in while the pointer is over the box and while it scrolls (a
 * wheel, a key or a finger), and out again after.
 *
 * The thumb watches the one element inside the scroller, so a search that
 * shortens the list moves it too.
 */
import * as React from "react"
import { SidebarScrollThumb } from "@/components/app/sidebar-scroll-thumb"

export function ThumbScroll({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  return (
    <div data-nav-scroll-frame="" className="relative min-w-0">
      <div ref={ref} data-thumb-scroll="" className={className}>
        <div>{children}</div>
      </div>
      <SidebarScrollThumb target={ref} />
    </div>
  )
}
