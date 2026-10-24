"use client"

/**
 * ===========================================================================
 *  REPORTS A SELLER ADDS TO ANALYTICS
 * ===========================================================================
 * Each added report is a card of its own in the analytics grid
 * (./analytics-reports AddedCards), never a figure or a line on the chart.
 *
 * WHERE THE CHOICE IS KEPT: with the seller, on the server
 * (analytics_report_layouts, SQL part 254, through app/api/analytics/layout),
 * so it is the same on their phone and their laptop and is drawn on the
 * first paint: the server page reads it and hands it to the client. A copy is
 * kept in this browser for the moment between a change and the server
 * having it, and for a database that does not have part 254 yet; until then
 * the browser's copy is the choice, as it was in the first version.
 *
 * A CHANGE IS ON SCREEN AT ONCE. The picker's Save, a move, a remove: the
 * cards change in the same frame, and the write goes behind them. A newer
 * write cancels an older one still on its way, so the last choice is the
 * one kept.
 *
 * THE PICKER. A dialog on a computer, the shared bottom sheet on a phone: the
 * reports this seller can add (lib/analytics/sections reportOptions), each a
 * row with a checkbox, a name and one short line. Save applies them; Cancel,
 * Escape or a tap outside changes nothing.
 */
import * as React from "react"
import { Check, Plus } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { applyPicked, moveReport, normalizeReports, type ReportId } from "@/lib/analytics/sections"

/** This browser's copy, per seller. */
const LOCAL = "storelib.analytics.reports.v3:"
/** The first versions kept the choice in this browser only, for every seller alike. */
const LEGACY = ["storelib.analytics.added.v2", "storelib.analytics.added.v1"]

function readLocal(creatorId: string): ReportId[] | null {
  try {
    const own = localStorage.getItem(LOCAL + creatorId)
    if (own) return normalizeReports(JSON.parse(own))
    for (const key of LEGACY) {
      const old = localStorage.getItem(key)
      if (!old) continue
      const parsed = JSON.parse(old) as { cards?: unknown; tabs?: unknown }
      return normalizeReports([...(Array.isArray(parsed.tabs) ? parsed.tabs : []), ...(Array.isArray(parsed.cards) ? parsed.cards : [])])
    }
  } catch {
    /* unreadable storage is no choice */
  }
  return null
}

function writeLocal(creatorId: string, ids: readonly ReportId[]) {
  try {
    localStorage.setItem(LOCAL + creatorId, JSON.stringify(ids))
  } catch {
    /* the choice still holds for this visit, and on the server */
  }
}

/**
 * The seller's added reports and the way to change them. `saved` is what the
 * server page read (null when the database has nothing for this seller, or
 * has no table for it yet): then this browser's copy, if there is one, is
 * the choice, and is sent to the server so the seller's other devices have it.
 */
export function useAddedReports(creatorId: string, saved: ReportId[] | null): [ReportId[], (next: ReportId[]) => void] {
  const [ids, setIds] = React.useState<ReportId[]>(() => normalizeReports(saved ?? []))
  const inFlight = React.useRef<AbortController | null>(null)

  const send = React.useCallback((next: readonly ReportId[]) => {
    inFlight.current?.abort()
    const ctrl = typeof AbortController === "function" ? new AbortController() : null
    inFlight.current = ctrl
    try {
      void fetch("/api/analytics/layout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reports: next }),
        keepalive: true,
        signal: ctrl?.signal,
      }).catch(() => {
        /* Kept in this browser; the next change sends the whole list again. */
      })
    } catch {
      /* no network in this context */
    }
  }, [])

  React.useLayoutEffect(() => {
    if (saved !== null) {
      writeLocal(creatorId, normalizeReports(saved))
      return
    }
    const local = readLocal(creatorId)
    if (local && local.length) {
      setIds(local)
      writeLocal(creatorId, local)
      send(local)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = React.useCallback(
    (next: ReportId[]) => {
      const tidy = normalizeReports(next)
      setIds(tidy)
      writeLocal(creatorId, tidy)
      send(tidy)
    },
    [creatorId, send],
  )
  return [ids, save]
}

/** A move or a remove, as the cards' menus ask for them. */
export function reportActions(ids: readonly ReportId[], save: (next: ReportId[]) => void) {
  return {
    onMove: (id: ReportId, by: -1 | 1) => save(moveReport(ids, id, by)),
    onRemove: (id: ReportId) => save(ids.filter((x) => x !== id)),
  }
}

/* ─── The picker ───────────────────────────────────────────────────────── */

const LINES: Record<ReportId, { label: string; line: string; group: "traffic" | "sales" }> = {
  pageviews: { get label() { return tt("Page views") }, get line() { return tt("Every page opened, by day.") }, group: "traffic" },
  sessions: { get label() { return tt("Visits") }, get line() { return tt("Visits to your pages, by day.") }, group: "traffic" },
  clicks: { get label() { return tt("Link clicks") }, get line() { return tt("Links and buttons tapped, by day.") }, group: "traffic" },
  toplinks: { get label() { return tt("OnePage links") }, get line() { return tt("Which links on your OnePage were tapped.") }, group: "traffic" },
  refunds: { get label() { return tt("Refunds") }, get line() { return tt("Refunds made, by the day of the refund.") }, group: "sales" },
  downloads: { get label() { return tt("Downloads") }, get line() { return tt("Digital orders downloaded, by product.") }, group: "sales" },
}

/**
 * A CHECKBOX DRAWN FOR STORELIB: an 18px box, and the dark fill with its
 * tick laid over it, scaled and faded in. Opacity and transform only.
 */
export function ReportCheckbox({ on }: { on: boolean }) {
  return (
    <span aria-hidden data-checkbox={on ? "on" : "off"} className="relative grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border border-[#c9ccd2] bg-white shadow-[inset_0_1px_1px_rgba(16,24,40,0.06)]">
      <span
        className={cn(
          "absolute -inset-px grid place-items-center rounded-[5px] bg-[#1a1a2e] text-white transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none",
          on ? "scale-100 opacity-100" : "scale-75 opacity-0",
        )}
      >
        <Check className="h-3 w-3" strokeWidth={3.25} />
      </span>
    </span>
  )
}

function Row({ id, on, onToggle }: { id: ReportId; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      data-report-choice={id}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none hover:bg-[#f6f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.22)] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
    >
      <ReportCheckbox on={on} />
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{LINES[id].label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{LINES[id].line}</span>
      </span>
    </button>
  )
}

function Choices({ options, picked, toggle }: { options: readonly ReportId[]; picked: ReadonlySet<ReportId>; toggle: (id: ReportId) => void }) {
  const groups = [
    { key: "traffic", title: tt("Traffic") },
    { key: "sales", title: tt("Sales") },
  ] as const
  return (
    <div data-add-reports-list="" className="flex flex-col gap-3">
      {groups.map((g) => {
        const ids = options.filter((id) => LINES[id].group === g.key)
        if (!ids.length) return null
        return (
          <div key={g.key} role="group" aria-label={g.title}>
            <p className="px-3 pb-1 text-[12px] font-medium text-[#6b7280]">{g.title}</p>
            {ids.map((id) => (
              <Row key={id} id={id} on={picked.has(id)} onToggle={() => toggle(id)} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

export const SECONDARY_BUTTON =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none hover:bg-[#f8f9fa] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.2)] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
export const PRIMARY_BUTTON =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-medium text-white outline-none hover:bg-[#2b2b42] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.35)] active:bg-[#11111f] [-webkit-tap-highlight-color:transparent]"

/**
 * The picker, opened by either button. It starts from what is added each
 * time it opens; Save hands back the new list (kept ones where they were,
 * new ones at the end), and closes.
 */
export function ReportPicker({
  open,
  onOpenChange,
  options,
  added,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: readonly ReportId[]
  added: readonly ReportId[]
  onSave: (next: ReportId[]) => void
}) {
  const phone = usePhoneWidth()
  const [picked, setPicked] = React.useState<Set<ReportId>>(() => new Set(added))
  React.useEffect(() => {
    if (open) setPicked(new Set(added))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const toggle = (id: ReportId) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const save = () => {
    onOpenChange(false)
    onSave(applyPicked(added, picked))
  }
  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" className={cn(SECONDARY_BUTTON, phone && "flex-1")} onClick={() => onOpenChange(false)}>
        {tt("Cancel")}
      </button>
      <button type="button" data-add-reports-save="" className={cn(PRIMARY_BUTTON, phone && "flex-1")} onClick={save}>
        {tt("Save")}
      </button>
    </div>
  )
  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={() => onOpenChange(false)} title={tt("Add report")}>
        <div className="px-1 pb-3" data-add-reports-sheet="">
          <Choices options={options} picked={picked} toggle={toggle} />
        </div>
        <div data-panel-foot="" className="sticky bottom-0 border-t border-[#eef0f2] bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-add-reports-dialog=""
        /* Focus on the dialog itself, not on the first row: a ring round "Page views" read as a choice already made. Tab still walks the rows. */
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
        }} className="w-[calc(100%-32px)] max-w-[440px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-12px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)]">
        <div className="border-b border-[#eef0f2] px-5 py-4">
          <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Add report")}</DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] text-[#6b7280]">{tt("Each report is a card on this page.")}</DialogDescription>
        </div>
        <div className="max-h-[min(60vh,480px)] overflow-y-auto px-2 py-3">
          <Choices options={options} picked={picked} toggle={toggle} />
        </div>
        <div className="border-t border-[#eef0f2] px-5 py-3">{footer}</div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * THE BUTTON THAT OPENS THE PICKER, under the last card. The owner: "+ Add
 * report button. Very important." A small outlined button centred under the
 * grid read as an afterthought, so it is the grid's last tile: the full
 * width, a dashed outline where the next card would go, its plus in a round
 * mark and its name in the cards' ink. It warms to white on hover and dips
 * on a press, the way a card does, on a phone as on a computer.
 */
export function AddReportButton({ label, onClick, className, marker }: { label: string; onClick: () => void; className?: string; marker: "add-report" | "add-more" }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onClick}
      data-add-reports={marker}
      data-add-more={marker === "add-more" ? "" : undefined}
      className={cn(
        "group flex h-[64px] w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border border-dashed border-[#cfd3da] bg-transparent text-[14px] font-medium text-[#1a1a2e] outline-none transition-[background-color,border-color,scale] duration-150 [-webkit-tap-highlight-color:transparent]",
        "hover:border-[#9ca3af] hover:bg-white focus-visible:border-[#1a1a2e] focus-visible:bg-white active:scale-[0.995] active:bg-[#f4f5f7] motion-reduce:transition-none",
        className,
      )}
    >
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_1px_2px_rgba(17,24,39,0.06)] transition-colors duration-150 group-hover:bg-[#1a1a2e] group-hover:text-white">
        <Plus className="h-4 w-4" strokeWidth={2.25} />
      </span>
      {label}
    </button>
  )
}
