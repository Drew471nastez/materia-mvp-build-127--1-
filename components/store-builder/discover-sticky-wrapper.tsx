"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"

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

  return (
    <div className="sticky z-30" style={{ top: topOffset }}>
      {children}
    </div>
  )
}
