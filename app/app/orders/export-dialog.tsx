"use client"

/**
 * ===========================================================================
 *  EXPORT ORDERS
 * ===========================================================================
 * Which orders (this page, all of them, the ones ticked, the ones the search
 * and filters match, or a range of dates) and which kind of file. Every
 * order is already on the page (app/app/orders/sales/page.tsx reads them
 * all), so in a browser the file is written here, with nothing sent
 * anywhere. The phone app cannot save a file written in the page, so there
 * the server writes the same file behind a short lived link
 * (lib/platform/save-file.ts, app/api/app/orders/export).
 *
 * Two kinds of CSV, because they are read by different things:
 *   for spreadsheets   a byte order mark and CRLF line ends, which is what
 *                      makes Excel read "Zoë" as Zoë rather than ZoÃ«
 *   plain              UTF-8 and LF, for scripts and other tools
 */
import * as React from "react"
import { Download } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { RangePanel } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import { boundsOf, presetRange, rangeLabel, todayIn, valueLabel, type RangeValue } from "@/lib/date-range/range"
import type { Order } from "@/lib/orders/order-view"
import { CSV_HEADER, csvCell, encodeRuns, ordersCsv, type ExportFormat } from "@/lib/orders/export-csv"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { buttonPrimary, buttonSecondary } from "./order-parts"

export type ExportScope = "page" | "all" | "selected" | "matching" | "dates"
export type { ExportFormat }
/* The file itself is written in lib/orders/export-csv.ts, where the server
   can write the same one for the phone app. Named here too, as before. */
export { csvCell, CSV_HEADER, ordersCsv }

function Radio({
  checked,
  disabled,
  onSelect,
  children,
  hint,
}: {
  checked: boolean
  disabled?: boolean
  onSelect: () => void
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label className={cn("flex items-start gap-2.5 py-1.5", disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer")}>
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="peer sr-only"
      />
      {/* The ring, drawn: a filled centre when chosen, like every radio in /app. */}
      <span
        aria-hidden
        className={cn(
          "mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#1a1a2e] peer-focus-visible:ring-offset-1",
          checked ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#b5b8c0] bg-white",
        )}
      >
        {checked && <span className="h-[7px] w-[7px] rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] text-[#1a1a2e]">{children}</span>
        {hint && <span className="block text-[12px] text-[#6b7280]">{hint}</span>}
      </span>
    </label>
  )
}

export function ExportOrdersDialog({
  open,
  onClose,
  all,
  pageOrders,
  matching,
  period,
  filtering,
  selected,
  timeZone,
  onDone,
}: {
  open: boolean
  onClose: () => void
  all: Order[]
  pageOrders: Order[]
  /** What the table shows: the page's dates, view, filters and search. */
  matching: Order[]
  /** The page's dates, which "Orders by date" starts from. */
  period: RangeValue
  /** A view, filter or search narrows the table beyond its dates. */
  filtering: boolean
  selected: Set<string>
  timeZone: string
  onDone: (message: string) => void
}) {
  const today = React.useMemo(() => todayIn(timeZone, Date.now()), [timeZone, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const [scope, setScope] = React.useState<ExportScope>("page")
  const [format, setFormat] = React.useState<ExportFormat>("spreadsheet")
  const [dates, setDates] = React.useState<RangeValue>(() => ({ preset: "last_30_days", ...presetRange("last_30_days", today) }))

  React.useEffect(() => {
    if (!open) return
    setScope(selected.size > 0 ? "selected" : "matching")
    setDates(period)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const byDate = React.useMemo(() => {
    const b = boundsOf(dates, timeZone)
    return all.filter((o) => {
      const t = new Date(o.createdAt).getTime()
      return t >= b.start && t < b.end
    })
  }, [all, dates, timeZone])

  const chosen: Order[] =
    scope === "page" ? pageOrders
      : scope === "all" ? all
        : scope === "selected" ? all.filter((o) => selected.has(o.id))
          : scope === "matching" ? matching
            : byDate

  const run = () => {
    if (chosen.length === 0) return
    const stamp = today
    const name = scope === "dates" ? `orders-${dates.start}-to-${dates.end}.csv` : `orders-${stamp}.csv`
    const count = `${chosen.length} order${chosen.length === 1 ? "" : "s"}`
    const numbers = encodeRuns(chosen.map((o) => o.number))
    onClose()
    /* A browser saves the file written here; the phone app opens a link the
       server writes the same file behind (lib/platform/save-file.ts). */
    saveFile({
      name,
      file: async () => new Blob([ordersCsv(chosen, timeZone, format)], { type: "text/csv;charset=utf-8" }),
      link: async () => {
        const res = await fetch("/api/app/orders/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numbers, format, timeZone, name }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.url) throw new Error(data?.error || "The export could not be made. Try again.")
        return data.url as string
      },
    }).then(
      (outcome) => onDone(outcome === "downloaded" ? `${count} exported` : savedMessage(outcome, "Orders file")),
      (error) => onDone((error as Error)?.message || "The export could not be made. Try again."),
    )
  }

  const plural = (n: number) => `${n} order${n === 1 ? "" : "s"}`

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-24px)] max-w-[520px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]"
      >
        <div className="border-b border-[#eef0f2] bg-[#f7f7f8] px-5 py-3.5">
          <DialogTitle className="text-[15px] font-semibold text-[#1a1a2e]">Export orders</DialogTitle>
          <DialogDescription className="sr-only">Choose which orders and which kind of file.</DialogDescription>
        </div>

        <div className="max-h-[min(70vh,640px)] overflow-y-auto px-5 py-4">
          <fieldset className="min-w-0">
            <legend className="mb-1 text-[13px] font-medium text-[#4b5563]">Export</legend>
            <Radio checked={scope === "page"} onSelect={() => setScope("page")}>
              Current page <span className="text-[#6b7280]">· {plural(pageOrders.length)}</span>
            </Radio>
            <Radio checked={scope === "all"} onSelect={() => setScope("all")}>
              All orders <span className="text-[#6b7280]">· {plural(all.length)}</span>
            </Radio>
            <Radio checked={scope === "selected"} disabled={selected.size === 0} onSelect={() => setScope("selected")}>
              Selected: {plural(selected.size)}
            </Radio>
            <Radio checked={scope === "matching"} onSelect={() => setScope("matching")}>
              Orders in this view{" "}
              <span className="text-[#6b7280]">
                · {plural(matching.length)}, {valueLabel(period)}
                {filtering ? ", filtered" : ""}
              </span>
            </Radio>
            <Radio checked={scope === "dates"} onSelect={() => setScope("dates")}>
              Orders by date
              {scope === "dates" && <span className="text-[#6b7280]"> · {plural(byDate.length)}, {rangeLabel(dates)}</span>}
            </Radio>
            {scope === "dates" && (
              <div className="mt-2 overflow-hidden rounded-xl border border-[#e3e4e8]">
                <RangePanel
                  initial={dates}
                  today={today}
                  presets={false}
                  months={1}
                  inline
                  onCancel={() => setScope("page")}
                  onApply={setDates}
                />
              </div>
            )}
          </fieldset>

          <fieldset className="mt-5 min-w-0">
            <legend className="mb-1 text-[13px] font-medium text-[#4b5563]">Export as</legend>
            <Radio checked={format === "spreadsheet"} onSelect={() => setFormat("spreadsheet")}>
              CSV for Excel, Numbers or another spreadsheet
            </Radio>
            <Radio checked={format === "plain"} onSelect={() => setFormat("plain")}>
              Plain CSV file
            </Radio>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={buttonPrimary} onClick={run} disabled={chosen.length === 0}>
            <Download className="h-4 w-4" />
            {chosen.length === 0 ? "Nothing to export" : `Export ${plural(chosen.length)}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
