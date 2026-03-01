"use client"

import { useEffect, useState } from "react"
import { isNativeApp } from "@/lib/platform-utils"

/**
 * Wrapper for sticky elements (like the creator bar) that adjusts
 * the top offset when the platform header is visible in Capacitor apps.
 *
 * In Capacitor discover mode the platform header (68px tall on mobile)
 * is rendered above <main>.  Sticky children need top-[68px] so they
 * sit below the header rather than overlapping it.
 */
export function DiscoverStickyWrapper({ children }: { children: React.ReactNode }) {
  const [topOffset, setTopOffset] = useState("0px")

  useEffect(() => {
    if (isNativeApp()) {
      setTopOffset("68px")
    }
  }, [])

  return (
    <div className="sticky z-30" style={{ top: topOffset }}>
      {children}
    </div>
  )
}
