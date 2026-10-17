"use client"

/**
 * What the store's orders need now, on Home: "3 orders to fulfill", "1
 * return to review", each a link to where it is done (lib/physical/
 * action-reminders.ts). Drawn from the server's counts in the first paint,
 * and read again when the tab comes back into view (no more than every 30
 * seconds, never on a timer), so a line goes as soon as its work is done
 * without anybody dismissing it. Nothing at all when nothing is waiting.
 */
import * as React from "react"
import { ChevronRight } from "lucide-react"
import { AppLink } from "@/components/app/app-link"
import { requestJson } from "@/lib/net/request"
import { actionReminders, type CommerceActionCounts } from "@/lib/physical/action-reminders"

const AGAIN_AFTER_MS = 30_000

export function AttentionList({ initial, className }: { initial: CommerceActionCounts | null; className?: string }) {
  const [counts, setCounts] = React.useState<CommerceActionCounts | null>(initial)
  const readAt = React.useRef(initial ? Date.now() : 0)

  React.useEffect(() => {
    let live = true
    const read = async () => {
      if (Date.now() - readAt.current < AGAIN_AFTER_MS) return
      readAt.current = Date.now()
      const r = await requestJson<{ counts?: CommerceActionCounts }>("/api/app/orders/attention", { credentials: "same-origin", cache: "no-store" })
      /* A failed read keeps what is on screen: the lines are a reminder, never an error of their own. */
      if (live && r.ok && r.data.counts) setCounts(r.data.counts)
    }
    if (!initial) void read()
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      live = false
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [initial])

  const lines = counts ? actionReminders(counts) : []
  if (lines.length === 0) return null

  return (
    <section data-home-attention="" className={`overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${className ?? ""}`}>
      <ul className="divide-y divide-[#f1f2f4]">
        {lines.map((l) => (
          <li key={l.id}>
            <AppLink
              href={l.href}
              data-attention={l.id}
              data-tone={l.tone}
              className="flex min-h-[48px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#f9fafb] focus-visible:bg-[#f9fafb] focus-visible:outline-none sm:px-5"
            >
              {/* Mustard, not grey: a waiting order is something to do, and a grey dot read as nothing (round 27). Red stays for what went wrong. */}
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${l.tone === "critical" ? "bg-[#d92d20]" : "bg-[#d4a017]"}`} />
              <span className={`min-w-0 flex-1 text-[14px] leading-5 ${l.tone === "critical" ? "font-semibold text-[#b42318]" : "font-medium text-[#1a1a2e]"}`}>{l.text}</span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            </AppLink>
          </li>
        ))}
      </ul>
    </section>
  )
}
