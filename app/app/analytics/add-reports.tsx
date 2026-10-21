"use client"

/**
 * Reports a seller can add under the Analytics chart, kept in this browser.
 * They are cards in the grid, never extra figures on the chart. A computer
 * gets a small panel; a phone gets the shared bottom sheet.
 */
import { useCallback, useLayoutEffect, useState } from "react"
import { Check, Plus } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

export type ReportCardId = "pageviews" | "refunds" | "clicks" | "downloads"

export interface AddedReports {
  cards: ReportCardId[]
}

const STORE = "storelib.analytics.added.v2"
const PREVIOUS = "storelib.analytics.added.v1"
const IDS: ReportCardId[] = ["pageviews", "refunds", "clicks", "downloads"]

function idsOf(raw: unknown): ReportCardId[] {
  if (!Array.isArray(raw)) return []
  const out: ReportCardId[] = []
  for (const id of raw) if (IDS.includes(id as ReportCardId) && !out.includes(id as ReportCardId)) out.push(id as ReportCardId)
  return out
}

export function readAddedReports(): AddedReports {
  try {
    const saved = localStorage.getItem(STORE)
    if (saved) return { cards: idsOf((JSON.parse(saved) as { cards?: unknown }).cards) }
    /* The first version put some of these on the chart. They are cards now. */
    const old = JSON.parse(localStorage.getItem(PREVIOUS) || "") as { tabs?: unknown; cards?: unknown }
    return { cards: idsOf([...(Array.isArray(old.tabs) ? old.tabs : []), ...(Array.isArray(old.cards) ? old.cards : [])]) }
  } catch {
    return { cards: [] }
  }
}

export function useAddedReports(): [AddedReports, (next: AddedReports) => void] {
  const [added, setAdded] = useState<AddedReports>({ cards: [] })
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

const COPY: Record<ReportCardId, { label: string; line: string }> = {
  pageviews: { get label() { return tt("Page views") }, get line() { return tt("Every page opened, not just the first of a visit.") } },
  refunds: { get label() { return tt("Refunds") }, get line() { return tt("Money returned in this period.") } },
  clicks: { get label() { return tt("Link clicks") }, get line() { return tt("Links and buttons tapped, including your OnePage.") } },
  downloads: { get label() { return tt("Downloads") }, get line() { return tt("How many digital orders were downloaded.") } },
}

function Row({ on, label, line, onToggle }: { on: boolean; label: string; line: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      data-report-choice=""
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors duration-150 hover:bg-[#f7f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.25)] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
    >
      <span
        aria-hidden
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color,box-shadow] duration-150",
          on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]" : "border-[#c9ccd2] bg-white shadow-[inset_0_1px_1px_rgba(16,24,40,0.06)]",
        )}
      >
        <Check className={cn("h-3 w-3 transition-opacity duration-150", on ? "opacity-100" : "opacity-0")} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] text-[#1a1a2e]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{line}</span>
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
  const options = IDS.filter((id) => id !== "downloads" || offerDownloads)
  const toggle = (id: ReportCardId) => {
    const on = added.cards.includes(id)
    onChange({ cards: on ? added.cards.filter((c) => c !== id) : [...added.cards, id] })
  }
  const body = (
    <div className="px-1 pb-2" data-add-reports-list="">
      <p className="px-2 pb-2 text-[13px] leading-5 text-[#6b7280]">{tt("These sit with the other reports. The chart stays on visitors, revenue, orders and conversion.")}</p>
      {options.map((id) => (
        <Row key={id} on={added.cards.includes(id)} label={COPY[id].label} line={COPY[id].line} onToggle={() => toggle(id)} />
      ))}
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
      <PopoverContent align="center" sideOffset={8} className="w-[340px] rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        {body}
      </PopoverContent>
    </Popover>
  )
}
