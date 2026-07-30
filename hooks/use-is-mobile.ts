"use client"

import { useEffect, useState } from "react"

/**
 * True when the viewport is phone-sized (< 768px, Tailwind's md breakpoint).
 * SSR-safe: returns false until mounted to avoid hydration mismatch, then
 * reflects the real viewport and updates on resize/orientation change.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [breakpoint])

  return isMobile
}
