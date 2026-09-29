"use client"

import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { accountTabFor } from "@/lib/account/account-tabs"

/**
 * A very small ease when moving between /account and /account/settings so
 * the swap does not read as a hard cut. Reduced motion and the first paint
 * are left alone.
 */
export function AccountNavFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const settings = accountTabFor(pathname) === 1
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRef(false)
  const wasSettings = useRef(settings)

  useLayoutEffect(() => {
    if (!seen.current) {
      seen.current = true
      wasSettings.current = settings
      return
    }
    if (wasSettings.current === settings) return
    wasSettings.current = settings
    const el = ref.current
    if (!el || typeof el.animate !== "function") return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate([{ opacity: 0.94 }, { opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" })
  }, [settings])

  return (
    <div ref={ref} className="min-w-0">
      {children}
    </div>
  )
}
