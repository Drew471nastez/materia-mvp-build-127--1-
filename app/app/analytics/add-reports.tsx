"use client"

/**
 * Reports a seller can add under Analytics, kept in this browser.
 * Visitors, revenue, orders and conversion always stay. The rest are
 * chosen here: a popover on a computer, the shared bottom sheet on a phone.
 */
import { useCallback, useLayoutEffect, useState } from "react"
import { Plus } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export type ExtraTab = "pageviews" | "refunds" | "clicks"
export type ExtraCard = "downloads"

export interface AddedReports {
  tabs: ExtraTab[]
  cards: ExtraCard[]
}

const STORE = "storelib.analytics.added.v1"
const TABS: ExtraTab[] = ["pageviews", "refunds", "clicks"]

export function readAddedReports(): AddedReports {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "") as { tabs?: unknown; cards?: unknown }
    const tabs = Array.isArray(raw.tabs) ? raw.tabs.filter((t): t is ExtraTab => t === "pageviews" || t === "refunds" || t === "clicks") : []
    const cards: ExtraCard[] = Array.isArray(raw.cards) && raw.cards.includes("downloads") ? ["downloads"] : []
    return { tabs, cards }
  } catch {
    return { tabs: [], cards: [] }
  }
}

export function useAddedReports(): [AddedReports, (next: AddedReports) => void] {
  const [added, setAdded] = useState<AddedReports>({ tabs: [], cards: [] })
  useLayoutEffect(() => {
    setAdded(readAddedReports())
  }, [])
  const save = useCallback((next: AddedReports) => {
    setAdded(next)
    try {
      localStorage.setItem(STORE, JSON.stringify(next))
    } catch {
      /* the choice still holds for this visit */
    }
  }, [])
  return [added, save]
}

/** A download, a course, or a product with no type yet: digital, the way reports count it. */
export function sellsDigital(products: Array<{ type?: string | null }>): boolean {
  return products.some((p) => {
    const t = (p.type || "").toLowerCase()
    return t !== "physical" && t !== "community" && t !== "membership"
  })
}

const TAB_COPY: Record<ExtraTab, { label: string; line: string }> = {
  pageviews: { get label() { return tt("Page views") }, get line() { return tt("Every page opened, not just the first of a visit.") } },
  refunds: { get label() { return tt("Refunds") }, get line() { return tt("Money returned, on the days it went back.") } },
  clicks: { get label() { return tt("Link clicks") }, get line() { return tt("Links and buttons tapped, including your OnePage.") } },
}

function Row({ on, label, line, onToggle }: { on: boolean; label: string; line: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-100 hover:bg-[#f4f5f7] active:bg-[#eef0f2]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{label}</span>
        <span className="block text-[12.5px] leading-[18px] text-[#6b7280]">{line}</span>
      </span>
      <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d1d5db] bg-white")}>
        {on ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 6.2 4.6 9 10 3" />
          </svg>
        ) : null}
      </span>
    </button>
  )
}

export function AddReports({
  added,
  onChange,
  offerDownloads,
}: {
  added: AddedReports
  onChange: (next: AddedReports) => void
  offerDownloads: boolean
}) {
  const phone = usePhoneWidth()
  const [open, setOpen] = useState(false)
  const toggleTab = (tab: ExtraTab) => {
    const on = added.tabs.includes(tab)
    onChange({ ...added, tabs: on ? added.tabs.filter((t) => t !== tab) : [...added.tabs, tab] })
  }
  const toggleDownloads = () => {
    const on = added.cards.includes("downloads")
    onChange({ ...added, cards: on ? [] : ["downloads"] })
  }
  const body = (
    <div className="pb-2" data-add-reports-list="">
      <p className="px-3 pb-2 text-[13px] leading-5 text-[#6b7280]">{tt("Visitors, revenue, orders and conversion stay. Add a report when you want it on this page.")}</p>
      <p className="px-3 pb-1 text-[12px] font-medium text-[#6b7280]">{tt("On the chart")}</p>
      {TABS.map((tab) => (
        <Row key={tab} on={added.tabs.includes(tab)} label={TAB_COPY[tab].label} line={TAB_COPY[tab].line} onToggle={() => toggleTab(tab)} />
      ))}
      {offerDownloads ? (
        <>
          <p className="mt-2 px-3 pb-1 text-[12px] font-medium text-[#6b7280]">{tt("Cards")}</p>
          <Row on={added.cards.includes("downloads")} label={tt("Downloads")} line={tt("How many digital orders were downloaded.")} onToggle={toggleDownloads} />
        </>
      ) : null}
    </div>
  )
  const trigger = (
    <button
      type="button"
      data-add-reports=""
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={phone ? () => setOpen(true) : undefined}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f1f2f4]"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {tt("Add a report")}
    </button>
  )
  if (phone) {
    return (
      <>
        {trigger}
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Add a report")}>
          {body}
        </BottomSheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="w-[320px] rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        {body}
      </PopoverContent>
    </Popover>
  )
}
