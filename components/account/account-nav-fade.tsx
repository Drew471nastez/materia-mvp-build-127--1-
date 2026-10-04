"use client"

import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { accountTabFor } from "@/lib/account/account-tabs"
import { showsLibraryTabs } from "@/components/library/library-tab-list"

/**
 * WHICH ADDRESSES ARE ONE PAGE. The wrapper below is keyed, so a new key
 * builds everything inside it again and plays its entrance from nothing.
 * The library's pill screens are one page whose screens cross fade under a
 * row that holds still (components/library/library-panel.tsx), so they
 * share a key: keyed by the address, every pill press rebuilt the title,
 * the pills and the stage, and faded all of it in from blank, which was
 * the flash and the jump the owner saw. Every other address keeps its own.
 */
export function navFadeKey(pathname: string | null): string {
  return showsLibraryTabs(pathname) ? "library-tabs" : pathname || ""
}

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
    el.animate([{ opacity: 0.97 }, { opacity: 1 }], { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" })
  }, [settings])

  return (
    <div key={navFadeKey(pathname)} ref={ref} className="library-content-enter min-w-0">
      {children}
    </div>
  )
}
