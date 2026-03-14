"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

/**
 * Drop this into any page that links to product pages so the back breadcrumb
 * on the product page shows that page's name (e.g. "< John's Store").
 * Renders nothing visible.
 */
export function BackLabelSetter({ label }: { label: string }) {
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", label) } catch { /* ignore */ }
  }, [label])
  return null
}

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
 * The back label is read from sessionStorage key "backPageName" set by explore/
 * category/store pages before navigating to a product. Falls back to "Back".
 */
export function DiscoverBackBreadcrumb({ showOnWeb = false }: { showOnWeb?: boolean }) {
  const router = useRouter()
  const ref = useRef<HTMLButtonElement>(null)
  const [backLabel, setBackLabel] = useState("Back")

  useEffect(() => {
    // Read dynamic back label stored by the previous page
    try {
      const stored = sessionStorage.getItem("backPageName")
      if (stored) setBackLabel(stored)
    } catch { /* ignore */ }

    if (!ref.current) return
    // JS backup: force visibility with !important so this overrides any CSS rule
    const isNative = document.documentElement.classList.contains("capacitor")
    if (isNative || showOnWeb) {
      ref.current.style.setProperty("display", "flex", "important")
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
      <span className="text-[14px]">{backLabel}</span>
    </button>
  )
}
