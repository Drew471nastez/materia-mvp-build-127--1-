"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

/**
 * Back breadcrumb rendered above product content.
 *
 * Visible in two cases:
 *  1. Capacitor native app (iOS/Android) — always shown on ALL product pages.
 *     Primary: CSS rule `html.capacitor [data-discover-breadcrumb]` activates
 *     synchronously before first paint (html.capacitor set via inline <script>).
 *     Backup: useEffect directly sets style.display="flex" in case the CSS
 *     rule fails to apply (e.g. specificity conflict or late class application).
 *  2. Web/desktop — only shown when showOnWeb=true (URL has ?layout=discover&recommended=1).
 *
 * Visibility is controlled by CSS in globals.css:
 *   [data-discover-breadcrumb]                → display: none  (default)
 *   html.capacitor [data-discover-breadcrumb] → display: flex  (native: always show)
 *   [data-discover-breadcrumb="web"]           → display: flex  (web discover URL)
 */
export function DiscoverBackBreadcrumb({ showOnWeb = false }: { showOnWeb?: boolean }) {
  const router = useRouter()
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!ref.current) return
    // JS backup: if the html.capacitor CSS rule didn't show the breadcrumb,
    // force it visible directly. This handles any timing or specificity edge cases.
    const isNative = document.documentElement.classList.contains("capacitor")
    if (isNative) {
      ref.current.style.display = "flex"
    } else if (showOnWeb) {
      ref.current.style.display = "flex"
    }
  }, [showOnWeb])

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => router.back()}
      data-discover-breadcrumb={showOnWeb ? "web" : "native"}
      className="items-center gap-1.5 mb-5 cursor-pointer text-[#9ca3af] hover:text-[#6b7280] transition-colors"
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={2} />
      <span className="text-[14px]">← Back</span>
    </button>
  )
}
