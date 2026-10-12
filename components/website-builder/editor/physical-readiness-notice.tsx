"use client"

/**
 * The website builder's line for a site that sells physical products buyers
 * can't check out with yet (lib/physical/readiness.ts): the save problem
 * banner's shape (white, a hairline, a small dot), with an amber dot, what is
 * wrong and the one Fix. Only while something physical is on sale and a gap
 * blocks it; payments included, since nothing else in the builder says so.
 * Closed, it stays closed for this visit to the builder; it comes back next
 * time while the gap is still there.
 */
import * as React from "react"
import { X } from "lucide-react"
import { blockingItems } from "@/lib/physical/readiness"
import { ReadinessLink, useReadiness } from "@/components/physical/readiness-client"

const KEY = "storelib:builder-physical-readiness-closed"

export function PhysicalReadinessNotice() {
  const r = useReadiness()
  const [closed, setClosed] = React.useState(false)
  React.useEffect(() => {
    try {
      setClosed(window.sessionStorage.getItem(KEY) === "1")
    } catch {
      /* No storage: it shows until it is closed. */
    }
  }, [])
  const items = blockingItems(r)
  if (!r || r.live === 0 || items.length === 0 || closed) return null
  const first = items[0]
  return (
    <div
      role="status"
      data-physical-readiness="builder"
      className="pointer-events-auto mx-auto flex w-[min(560px,calc(100%-24px))] items-center gap-3 rounded-xl border border-[#eceef1] bg-white/95 py-2 pl-3.5 pr-1.5 shadow-[0_8px_24px_-12px_rgba(16,24,40,0.25)] backdrop-blur animate-in fade-in-0 slide-in-from-top-1 duration-200"
    >
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[#f79009]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#1a1a2e]">Buyers can&apos;t check out your physical products yet</span>
        <span className="block truncate text-[12px] text-[#6b7280]">{items.length === 1 ? first.title : `${first.title}, and ${items.length - 1} more`}</span>
      </span>
      <ReadinessLink
        href={items.length === 1 ? first.href : "/app/settings?tab=shipping"}
        className="shrink-0 cursor-pointer rounded-lg bg-[#1a1a2e] px-3 py-1.5 text-[12px] font-medium text-white outline-none transition-colors hover:bg-black focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30"
      >
        Fix
      </ReadinessLink>
      <button
        type="button"
        aria-label="Close"
        onClick={() => {
          setClosed(true)
          try {
            window.sessionStorage.setItem(KEY, "1")
          } catch {
            /* Closed for now only. */
          }
        }}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#9ca3af] outline-none transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
