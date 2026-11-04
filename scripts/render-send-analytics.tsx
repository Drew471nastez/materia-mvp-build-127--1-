/**
 * Analytics › Send to (components/app/analytics/send-analytics.tsx), for
 * scripts/check-send-analytics.mjs: the real button beside an Export-like
 * circle on the heading's line (round 49), on the page grey. ?open=1 presses it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Download } from "lucide-react"
import { SendAnalyticsButton } from "@/components/app/analytics/send-analytics"
import { HEAD_ICON_BUTTON } from "@/components/app/analytics/head-button"

function Page() {
  React.useEffect(() => {
    if (new URLSearchParams(location.search).get("open") === "1") window.setTimeout(() => (document.querySelector("[data-analytics-send]") as HTMLButtonElement | null)?.click(), 50)
  }, [])
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Round 49: Send to and Export are icons in circles at the right of the heading's line (components/app/analytics/head-button). */}
        <div className="flex items-center justify-between gap-3" data-analytics-head="">
          <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Analytics</h1>
          <div className="flex items-center gap-2">
            <SendAnalyticsButton />
            {/* Export as the page draws it: the same circle, its icon only. */}
            <button type="button" aria-haspopup="dialog" aria-label="Export" data-analytics-export="" data-export-stand-in="" className={HEAD_ICON_BUTTON}>
              <Download className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2" data-analytics-controls="">
          <button type="button" aria-haspopup="dialog" className="inline-flex h-8 items-center rounded-lg border bg-white px-2.5 text-[13px] font-medium">Last 30 days</button>
        </div>
        <div className="mt-4 h-[320px] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
