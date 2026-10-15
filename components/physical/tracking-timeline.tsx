"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TRACKING_LABEL, isTrackingStatus } from "@/lib/physical/tracking/labels"
import type { CheckoutT } from "@/lib/markets/checkout-words"

/**
 * The carrier's scans for one parcel, newest first: what it said, where and
 * when (lib/physical/tracking). The buyer's order page and the seller's
 * order panel show the same list; the newest four, then Show all. The
 * buyer's page hands its translator and language (app/checkout/parts/words.tsx);
 * the carrier's own messages stay as the carrier wrote them.
 */
export interface TimelineCheckpoint {
  at: string
  status: string
  message: string
  location: string | null
}

const english: CheckoutT = (source, vars) => (vars ? source.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : source)

const when = (iso: string, locale: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function TrackingTimeline({ checkpoints, size = "buyer", className, ct = english, locale = "en-US" }: { checkpoints: TimelineCheckpoint[]; size?: "buyer" | "seller"; className?: string; ct?: CheckoutT; locale?: string }) {
  const [all, setAll] = React.useState(false)
  if (checkpoints.length === 0) return null
  const shown = all ? checkpoints : checkpoints.slice(0, 4)
  const small = size === "seller"
  return (
    <div className={className} data-tracking-checkpoints="">
      <ol className="relative">
        {shown.map((c, i) => {
          const problem = c.status === "exception" || c.status === "attempt_failed" || c.status === "returned"
          const last = i === shown.length - 1
          return (
            <li key={`${c.at}:${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              <span className="relative flex w-3 shrink-0 justify-center pt-[5px]">
                <span className={cn("h-2 w-2 rounded-full", i === 0 ? (problem ? "bg-[#b42318]" : "bg-[#1a1a2e]") : "bg-[#c7cbd1]")} />
                {!last ? <span className="absolute left-1/2 top-[13px] h-[calc(100%-6px)] w-px -translate-x-1/2 bg-[#e5e7eb]" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn(small ? "text-[12.5px] leading-[17px]" : "text-[13.5px] leading-5", i === 0 ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]", problem && i === 0 && "text-[#b42318]")}>
                  {c.message || (isTrackingStatus(c.status) ? ct(TRACKING_LABEL[c.status].label) : c.status)}
                </p>
                <p className={cn("text-[#9ca3af]", small ? "text-[11.5px]" : "text-[12.5px]")}>
                  {[c.location, when(c.at, locale)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {checkpoints.length > 4 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className={cn("mt-1 font-medium text-[#1a1a2e] underline-offset-2 hover:underline", small ? "text-[12px]" : "text-[13px]")}>
          {all ? ct("Show fewer") : ct("Show all {count} updates", { count: checkpoints.length })}
        </button>
      ) : null}
    </div>
  )
}

/** "Estimated delivery Tue, Oct 14", or null when none was given. */
export function estimatedDay(iso: string | null | undefined, locale = "en-US"): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  /* A date without a time (2026-10-14) is that day wherever the buyer is. */
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", ...(/T00:00:00(\.000)?Z$/.test(d.toISOString()) ? { timeZone: "UTC" } : {}) })
}
