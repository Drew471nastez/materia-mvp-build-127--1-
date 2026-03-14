"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

/**
 * Back breadcrumb rendered above product content.
 * Visible in two cases:
 *  1. Capacitor native app (iOS/Android) — always shown on ALL product pages.
 *     Detection: html.capacitor class set synchronously before first paint.
 *  2. Web/desktop — only shown when showOnWeb=true (URL has ?layout=discover&recommended=1).
 */
export function DiscoverBackBreadcrumb({ showOnWeb = false }: { showOnWeb?: boolean }) {
  const router = useRouter()
  // Start with showOnWeb so web discover URLs render correctly from SSR.
  // After hydration, also show on Capacitor native (any product page).
  const [visible, setVisible] = useState(showOnWeb)

  useEffect(() => {
    if (document.documentElement.classList.contains("capacitor")) {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="flex items-center gap-1.5 mb-5 cursor-pointer text-[#9ca3af] hover:text-[#6b7280] transition-colors"
    >
      <ChevronLeft className="w-4 h-4" strokeWidth={2} />
      <span className="text-[14px]">Recommended</span>
    </button>
  )
}
