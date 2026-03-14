"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

/**
 * Back breadcrumb rendered above product content.
 *
 * Visible in two cases:
 *  1. Capacitor native app (iOS/Android) — always shown on ALL product pages.
 *     The html.capacitor class is added synchronously before first paint via
 *     the inline <script> in the root layout <head>, so the CSS rule activates
 *     on the very first render — no useEffect timing dependency.
 *  2. Web/desktop — only shown when showOnWeb=true (URL has ?layout=discover&recommended=1).
 *
 * Visibility is controlled entirely by CSS in globals.css:
 *   [data-discover-breadcrumb]                → display: none  (default)
 *   html.capacitor [data-discover-breadcrumb] → display: flex  (native: always show)
 *   [data-discover-breadcrumb="web"]           → display: flex  (web discover URL)
 */
export function DiscoverBackBreadcrumb({ showOnWeb = false }: { showOnWeb?: boolean }) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      data-discover-breadcrumb={showOnWeb ? "web" : "native"}
      className="flex items-center gap-1.5 mb-5 cursor-pointer text-[#9ca3af] hover:text-[#6b7280] transition-colors"
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={2} />
      <span className="text-[14px]">← Back</span>
    </button>
  )
}
