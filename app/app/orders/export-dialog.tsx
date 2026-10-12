"use client"

/**
 * ===========================================================================
 *  EXPORT ORDERS
 * ===========================================================================
 * Which orders (this view, the ones ticked, this page, all of them, or a
 * range of dates) and which kind of file. Every order is already on the page
 * (app/app/orders/sales/page.tsx reads them all), so in a browser the file
 * is written here, with nothing sent anywhere. The phone app cannot save a
 * file written in the page, so there the server writes the same file behind
 * a short lived link (lib/platform/save-file.ts, app/api/app/orders/export).
 *
 * Two kinds of CSV, because they are read by different things:
 *   for spreadsheets   a byte order mark and CRLF line ends, which is what
 *                      makes Excel read "Zoë" as Zoë rather than ZoÃ«
 *   plain              UTF-8 and LF, for scripts and other tools
 *
 * WHERE IT OPENS. On a phone, the shared sheet (components/ui/bottom-sheet):
 * the grabber, the title, big rows to tap and one full width button, so it
 * rises, follows the thumb and goes down like every other sheet in /app. On
 * a computer, a small panel under the Export button, the same white surface
 * as the date picker's, rather than a dialog in the middle of the screen for
 * two choices. The rows are the date picker's rows (a check on the chosen
 * one, the count on the right), so both places read the same.
 *
 * It stays up while the file is being made. In a browser that is instant;
 * in the phone app the server writes the file first, and the button says so
 * until it is done, rather than the sheet going and nothing happening.
 */
import * as React from "react"
import { Check } from "lucide-react"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { RangePanel, onRowsKey, pickerSurface, usePhone } from "@/components/app/date-range-picker"
import { cn } from "@/lib/utils"
import { boundsOf, presetRange, rangeLabel, todayIn, valueLabel, type RangeValue } from "@/lib/date-range/range"
import type { Order } from "@/lib/orders/order-view"
import { CSV_HEADER, csvCell, encodeRuns, ordersCsv, type ExportFormat } from "@/lib/orders/export-csv"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { buttonPrimary, buttonSecondary } from "./order-parts"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export type ExportScope = "page" | "all" | "selected" | "matching" | "dates"
export type { ExportFormat }
/* The file itself is written in lib/orders/export-csv.ts, where the server
   can write the same one for the phone app. Named here too, as before. */
export { csvCell, CSV_HEADER, ordersCsv }

/** The Export button the panel hangs from on a computer (app/app/orders/orders-list.tsx). */
export const EXPORT_ANCHOR = "data-orders-export"

const count = (n: number) => n.toLocaleString(appLocale())
const plural = (n: number) => `${count(n)} order${n === 1 ? "" : "s"}`

/** One choice: the date picker's row, with a radio's semantics. 48px on a phone. */
function Choice({
  compact,
  checked,
  onSelect,
  label,
  detail,
}: {
  compact: boolean
  checked: boolean
  onSelect: () => void
  label: string
  detail?: string | null
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-row=""
      data-checked={checked || undefined}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg text-left outline-none transition-colors duration-100 focus-visible:bg-[#f1f1f4]",
        compact ? "min-h-[48px] px-3 text-[15px] active:bg-[#f1f1f4]" : "min-h-[34px] px-2.5 text-[13px] hover:bg-[#f4f4f6] active:bg-[#ececef]",
        checked ? "font-semibold text-[#1a1a2e]" : "text-[#303036]",
      )}
    >
      <span className={cn("truncate", detail ? "shrink-0" : "min-w-0 flex-1")}>{label}</span>
      {detail ? (
        <span className={cn("min-w-0 flex-1 truncate text-right font-normal tabular-nums text-[#6b7280]", compact ? "text-[13px]" : "text-[12px]")}>
          {detail}
        </span>
      ) : null}
      {checked ? (
        <Check className="h-4 w-4 shrink-0 text-[#1a1a2e]" strokeWidth={2.25} aria-hidden />
      ) : (
        /* The check's place, kept, so a label never moves when it is chosen. */
        <span className="w-4 shrink-0" aria-hidden />
      )}
    </button>
  )
}

function Group({ compact, label, children }: { compact: boolean; label: string; children: React.ReactNode }) {
  const id = React.useId()
  return (
    <div role="radiogroup" aria-labelledby={id} onKeyDown={onRowsKey}>
      <p id={id} className={cn("font-medium text-[#6b7280]", compact ? "px-3 pb-1 pt-2 text-[13px]" : "px-2.5 pb-0.5 pt-1.5 text-[12px]")}>
        {label}
      </p>
      {children}
    </div>
  )
}

export function ExportOrders({
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
  /** The page's dates, which "By date" starts from. */
  period: RangeValue
  /** A view, filter or search narrows the table beyond its dates. */
  filtering: boolean
  selected: Set<string>
  timeZone: string
  onDone: (message: string) => void
}) {
  const phone = usePhone()
  const [today, setToday] = React.useState(() => todayIn(timeZone, Date.now()))
  const [scope, setScope] = React.useState<ExportScope>("matching")
  const [format, setFormat] = React.useState<ExportFormat>("spreadsheet")
  const [dates, setDates] = React.useState<RangeValue>(() => ({ preset: "last_30_days", ...presetRange("last_30_days", today) }))
  const [busy, setBusy] = React.useState(false)

  /*
    FRESH EACH TIME IT OPENS, AND ALREADY SO ON ITS FIRST FRAME. This was an
    effect, which runs after the first frame is painted: the dialog came up
    showing the last choice and changed a frame later. It is set while
    rendering now, in the same render that opens it.
  */
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setScope(selected.size > 0 ? "selected" : "matching")
      setDates(period)
      setToday(todayIn(timeZone, Date.now()))
    }
  }

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

  const run = async () => {
    if (chosen.length === 0 || busy) return
    const name = scope === "dates" ? `orders-${dates.start}-to-${dates.end}.csv` : `orders-${today}.csv`
    const numbers = encodeRuns(chosen.map((o) => o.number))
    const what = plural(chosen.length)
    setBusy(true)
    try {
      /* A browser saves the file written here; the phone app opens a link
         the server writes the same file behind (lib/platform/save-file.ts). */
      const outcome = await saveFile({
        name,
        file: async () => new Blob([ordersCsv(chosen, timeZone, format)], { type: "text/csv;charset=utf-8" }),
        link: async () => {
          const res = await fetch("/api/app/orders/export", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ numbers, format, timeZone, name }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data?.url) throw new Error(data?.error || tt("The export could not be made. Try again."))
          return data.url as string
        },
      })
      setBusy(false)
      onClose()
      onDone(outcome === "downloaded" ? tt("{what} exported", { what }) : savedMessage(outcome, tt("Orders file")))
    } catch (error) {
      /* It stays open, with what was chosen, to try again. */
      setBusy(false)
      onDone((error as Error)?.message || tt("The export could not be made. Try again."))
    }
  }

  const label = busy ? tt("Exporting…") : chosen.length === 0 ? tt("Nothing to export") : tt("Export {count}", { count: plural(chosen.length) })
  const viewDetail = `${valueLabel(period)}${filtering ? tt(", filtered") : ""} · ${count(matching.length)}`

  const choices = (compact: boolean) => (
    <>
      <Group compact={compact} label={tt("Orders")}>
        <Choice compact={compact} checked={scope === "matching"} onSelect={() => setScope("matching")} label={tt("This view")} detail={viewDetail} />
        {selected.size > 0 ? (
          <Choice compact={compact} checked={scope === "selected"} onSelect={() => setScope("selected")} label={tt("Selected")} detail={count(selected.size)} />
        ) : null}
        <Choice compact={compact} checked={scope === "page"} onSelect={() => setScope("page")} label={tt("This page")} detail={count(pageOrders.length)} />
        <Choice compact={compact} checked={scope === "all"} onSelect={() => setScope("all")} label={tt("All orders")} detail={count(all.length)} />
        <Choice
          compact={compact}
          checked={scope === "dates"}
          onSelect={() => setScope("dates")}
          label={tt("By date")}
          detail={scope === "dates" ? `${rangeLabel(dates)} · ${count(byDate.length)}` : null}
        />
      </Group>
      {scope === "dates" ? (
        <div className="mx-1 mb-1 mt-1 overflow-hidden rounded-xl border border-[#e3e4e8] bg-white">
          <RangePanel initial={dates} today={today} months={1} inline onApply={setDates} />
        </div>
      ) : null}
      <div aria-hidden className={cn("h-px bg-[#eef0f2]", compact ? "mx-3 my-1.5" : "mx-2 my-1")} />
      <Group compact={compact} label={tt("File")}>
        <Choice compact={compact} checked={format === "spreadsheet"} onSelect={() => setFormat("spreadsheet")} label={tt("Spreadsheet")} detail={tt("Excel, Numbers, Sheets")} />
        <Choice compact={compact} checked={format === "plain"} onSelect={() => setFormat("plain")} label={tt("Plain CSV")} detail={tt("UTF-8, for other tools")} />
      </Group>
    </>
  )

  if (phone) {
    return (
      <BottomSheet isOpen={open} onClose={onClose} title={tt("Export orders")} dismissible={!busy}>
        <div data-export-sheet="" className="px-2 pb-1 pt-1">
          {choices(true)}
        </div>
        <div className="px-4 pb-1 pt-3">
          <button
            type="button"
            onClick={run}
            disabled={chosen.length === 0 || busy}
            aria-busy={busy || undefined}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors duration-100 active:bg-[#111122] disabled:bg-[#d4d4d8] disabled:shadow-none"
          >
            {label}
          </button>
        </div>
      </BottomSheet>
    )
  }

  return <ExportPanel open={open} busy={busy} onClose={onClose} onRun={run} label={label} ready={chosen.length > 0} body={choices(false)} />
}

/**
 * The computer's panel, hung from the Export button in the list's bar. The
 * list is memoised and does not draw again when this opens, so the button is
 * found by its attribute rather than handed down, and it is told directly
 * that its panel is open.
 */
function ExportPanel({
  open,
  busy,
  onClose,
  onRun,
  label,
  ready,
  body,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onRun: () => void
  label: string
  ready: boolean
  body: React.ReactNode
}) {
  const anchor = () => (typeof document === "undefined" ? null : document.querySelector<HTMLElement>(`[${EXPORT_ANCHOR}]`))
  const measure = React.useRef({ getBoundingClientRect: () => anchor()?.getBoundingClientRect() ?? new DOMRect() })
  React.useEffect(() => {
    anchor()?.setAttribute("aria-expanded", String(open))
  }, [open])

  return (
    <Popover open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <PopoverAnchor virtualRef={measure} />
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        aria-label={tt("Export orders")}
        data-export-panel=""
        className={cn(pickerSurface, "flex max-h-[min(640px,var(--radix-popover-content-available-height))] w-[340px] flex-col")}
        onInteractOutside={(e) => {
          /* The Export button closes it with its own click. */
          if (anchor()?.contains(e.target as Node)) e.preventDefault()
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          const el = e.currentTarget as HTMLElement | null
          el?.querySelector<HTMLElement>("[data-row][data-checked]")?.focus({ preventScroll: true })
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          anchor()?.focus({ preventScroll: true })
        }}
      >
        <p className="shrink-0 px-4 pb-0.5 pt-3 text-[13px] font-semibold text-[#1a1a2e]">{tt("Export orders")}</p>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">{body}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#eef0f2] px-3 py-2.5">
          <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
            {tt("Cancel")}
          </button>
          <button type="button" className={buttonPrimary} onClick={onRun} disabled={!ready || busy} aria-busy={busy || undefined}>
            {label}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
