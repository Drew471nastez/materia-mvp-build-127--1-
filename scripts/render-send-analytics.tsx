/**
 * Analytics › Send to (components/app/analytics/send-analytics.tsx), for
 * scripts/check-send-analytics.mjs: the real button beside an Export-like
 * chip in the page's control row, on the page grey. ?open=1 presses it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Download } from "lucide-react"
import { SendAnalyticsButton } from "@/components/app/analytics/send-analytics"

function Page() {
  React.useEffect(() => {
    if (new URLSearchParams(location.search).get("open") === "1") window.setTimeout(() => (document.querySelector("[data-analytics-send]") as HTMLButtonElement | null)?.click(), 50)
  }, [])
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Analytics</h1>
        <div className="flex items-center gap-2" data-analytics-controls="">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button type="button" aria-haspopup="dialog" className="inline-flex h-8 items-center rounded-lg border bg-white px-2.5 text-[13px] font-medium">Last 30 days</button>
          </div>
          <SendAnalyticsButton />
          {/* Export as the page draws it: the shared picker button the row's pill rules restyle (app/globals.css). */}
          <button type="button" aria-haspopup="dialog" data-analytics-export="" data-export-stand-in="" className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2 text-[13px] font-medium sm:px-2.5">
            <Download className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
        <div className="mt-4 h-[320px] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" />
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
