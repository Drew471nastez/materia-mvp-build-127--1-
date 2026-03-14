"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"

/**
 * Back breadcrumb shown above product content.
 * - On Capacitor (html.capacitor CSS class): always visible via CSS — shows on
 *   ALL product pages in the native iOS/Android app regardless of URL params.
 * - On web: only visible when showOnWeb=true (i.e. ?layout=discover&recommended=1).
 */
export function DiscoverBackBreadcrumb({ showOnWeb = false }: { showOnWeb?: boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`discover-back-breadcrumb items-center gap-1.5 mb-6 cursor-pointer text-[#b0b7c3] hover:text-[#6b7280] transition-colors${showOnWeb ? " show-on-web" : ""}`}
    >
      <ChevronLeft className="w-[15px] h-[15px]" strokeWidth={2.5} />
      <span className="text-[14px] font-normal">Recommended</span>
    </button>
  )
}
