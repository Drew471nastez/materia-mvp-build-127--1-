"use client"

/**
 * ===========================================================================
 *  ONE PLACE'S LAST 30 DAYS, IN A LINE
 * ===========================================================================
 * "1,240 visitors · 18 orders", on the Website screen beside the live
 * website's facts and at the top of the OnePage editor's links, opening
 * Analytics on "Last 30 days" already filtered to that place, where the
 * same numbers are. "No visits yet" until anybody came.
 *
 * Asked once the screen is up (app/api/analytics/summary counts it, and
 * keeps it a minute), and kept in this tab for a minute too, so coming back
 * to the screen draws it at once. Kept under the signed in account: another
 * account signing in on the same tab never sees the last one's numbers, and
 * a line not told whose they are keeps nothing. A read that fails draws nothing: a glance
 * that cannot be had is not an error worth a message.
 */
import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { summaryKey, summaryText } from "@/lib/analytics/summary"
import { tt } from "@/lib/i18n/text"

type Summary = { visitors: number; orders: number; href: string }

const KEEP_MS = 60_000
const STORE = "storelib.analytics.summary.v2"

function keptSummary(key: string): Summary | null {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORE) || "{}") as Record<string, { at: number; s: Summary }>
    const hit = all[key]
    return hit && Date.now() - hit.at < KEEP_MS ? hit.s : null
  } catch {
    return null
  }
}

function keepSummary(key: string, s: Summary) {
  try {
    const all = JSON.parse(sessionStorage.getItem(STORE) || "{}") as Record<string, { at: number; s: Summary }>
    all[key] = { at: Date.now(), s }
    sessionStorage.setItem(STORE, JSON.stringify(all))
  } catch {
    /* storage closed: it is asked again next time */
  }
}

/** The place's summary, or null while it is on its way or could not be had. */
export function usePlaceSummary(property: string, account: string | null = null): { summary: Summary | null; failed: boolean } {
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    const timeZone = viewerTimeZone()
    const key = summaryKey(account, property, timeZone)
    setSummary(null)
    setFailed(false)
    const kept = key ? keptSummary(key) : null
    if (kept) {
      setSummary(kept)
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/analytics/summary?property=${encodeURIComponent(property)}&tz=${encodeURIComponent(timeZone)}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: Summary) => {
        const s = { visitors: Number(json.visitors) || 0, orders: Number(json.orders) || 0, href: String(json.href || "/app/analytics") }
        if (key) keepSummary(key, s)
        setSummary(s)
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setFailed(true)
      })
    return () => ctrl.abort()
  }, [property, account])
  return { summary, failed }
}

/**
 * The line itself. Its height is held from the first frame, so the screen
 * does not move when the numbers arrive; the words fade in.
 */
export function AnalyticsSummaryLine({ property, account, className }: { property: string; account?: string | null; className?: string }) {
  const { summary, failed } = usePlaceSummary(property, account ?? null)
  if (failed) return null
  const empty = !!summary && summary.visitors <= 0 && summary.orders <= 0
  return (
    <div data-analytics-summary={property} className={cn("flex min-h-[20px] items-center text-[13px]", className)}>
      {!summary ? (
        <span aria-hidden className="text-transparent">
          .
        </span>
      ) : empty ? (
        <span className="text-[#9ca3af] animate-in fade-in duration-300">{summaryText(summary)}</span>
      ) : (
        <Link
          href={summary.href}
          data-analytics-summary-link=""
          className="-my-3 inline-flex min-h-[44px] items-center gap-1 rounded-md text-[#6b7280] transition-colors hover:text-[#1a1a2e] animate-in fade-in duration-300 sm:my-0 sm:min-h-0"
        >
          <span className="tabular-nums">{summaryText(summary)}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/**
 * The same, as the facts of the live website state things (a label on the
 * left, the value on the right): "Last 30 days", then the numbers.
 */
export function AnalyticsSummaryFact({ property, account }: { property: string; account?: string | null }) {
  const { summary, failed } = usePlaceSummary(property, account ?? null)
  if (failed) return null
  const empty = !!summary && summary.visitors <= 0 && summary.orders <= 0
  const numbers = summary ? summaryText(summary).replace(/^Last 30 days: /, "") : ""
  return (
    <div className="flex items-center justify-between gap-4 py-2.5" data-analytics-summary={property}>
      <dt className="text-[#6b7280]">{tt("Last 30 days")}</dt>
      <dd className="min-w-0 text-right">
        {!summary ? (
          <span aria-hidden className="text-transparent">
            .
          </span>
        ) : empty ? (
          <span className="text-[#9ca3af]">{numbers}</span>
        ) : (
          <Link
            href={summary.href}
            data-analytics-summary-link=""
            className="-my-3 inline-flex min-h-[44px] max-w-full items-center gap-1 font-medium tabular-nums text-[#1a1a2e] hover:underline sm:my-0 sm:min-h-0"
          >
            <span className="truncate">{numbers}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" aria-hidden />
          </Link>
        )}
      </dd>
    </div>
  )
}
