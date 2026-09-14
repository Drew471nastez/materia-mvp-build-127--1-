"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"
import { useRevealOnScrollUp } from "@/lib/store-builder/use-reveal-on-scroll-up"
import { cn } from "@/lib/utils"

/**
 * Wrapper for sticky elements (like the creator bar) that adjusts
 * the top offset when the platform header is visible in Capacitor apps.
 *
 * Measures the actual rendered height of the platform header so the
 * sticky child sits flush below it regardless of safe-area size.
 */
export function DiscoverStickyWrapper({ children }: { children: React.ReactNode }) {
  const [topOffset, setTopOffset] = useState("0px")

  useEffect(() => {
    if (!isNativeApp()) return

    function measure() {
      const header = document.getElementById("platform-header-root")
      if (header) {
        setTopOffset(`${header.offsetHeight}px`)
      }
    }

    measure()

    // Re-measure if the header resizes (e.g. orientation change)
    const ro = new ResizeObserver(measure)
    const header = document.getElementById("platform-header-root")
    if (header) ro.observe(header)

    return () => ro.disconnect()
  }, [])

  /**
   * IT GETS OUT OF THE WAY. This was `sticky` and nothing else, so the
   * creator bar was pinned across the top of every product page whatever the
   * reader was doing — while the subscribe bar one page over hid on the way
   * down and came back on the way up. Same hook now, so the two agree.
   */
  const visible = useRevealOnScrollUp()

  return (
    <div
      className={cn(
        "sticky z-30 transition-transform duration-300 ease-out motion-reduce:transition-none",
        !visible && "-translate-y-full",
      )}
      style={{ top: topOffset }}
    >
      {children}
    </div>
  )
}
