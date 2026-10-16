"use client"

/**
 * ===========================================================================
 *  EXPORT ORDERS
 * ===========================================================================
 * Which orders (this view, the ones ticked, this page, all of them, or a
 * range of dates) and which kind of file. The page has one page of orders
 * (lib/orders/paged.ts): this page, and ticked orders it still has, are
 * written here in a browser with nothing sent anywhere; anything wider is
 * written by the server, from the same rows by the same function, and saved
 * the same way. The phone app cannot save a file written in the page, so
 * there the server writes the file behind a short lived link
 * (lib/platform/save-file.ts, app/api/app/orders/export).
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
import { paramsFromQuery, type ListQuery, type Order } from "@/lib/orders/order-view"
import { CSV_HEADER, csvCell, encodeRuns, ordersCsv, pickByNumber, type ExportFormat } from "@/lib/orders/export-csv"
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

/**
 * What the server is asked to write when the orders are not all on this
 * page (app/api/app/orders/export): orders by number, or a list as the page
 * draws it, its address and its dates (every order for no dates).
 */
export type ExportAsk = { numbers: string } | { query: string; window: { start: number; end: number } | null }

export function ExportOrders({
  open,
  onClose,
  total,
  known,
  numbers,
  pageOrders,
  matching,
  query,
  span,
  period,
  filtering,
  selected,
  timeZone,
  onDone,
}: {
  open: boolean
  onClose: () => void
  /** Every order the store has had. */
  total: number
  /** The orders the page has whole (this page, the ones beside it, an open one). */
  known: Order[]
  /** Every order number the page has seen, by order id: ticked orders on other pages are named by it. */
  numbers: Record<string, number>
  pageOrders: Order[]
  /** How many orders the table shows across its pages: the page's dates, view, filters and search. */
  matching: number
  /** The table's view, filters, search and sort, and the instants its dates cover. */
  query: ListQuery
  span: { start: number; end: number }
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
  /* By date: how many orders those dates hold, counted by the server (the page has one page of them). */
  const [dateCount, setDateCount] = React.useState<number | null>(null)

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

  const bounds = React.useMemo(() => boundsOf(dates, timeZone), [dates, timeZone])
  React.useEffect(() => {
    if (!open || scope !== "dates") return
    const ctrl = new AbortController()
    setDateCount(null)
    fetch(`/api/app/orders/list?count=1&ws=${Math.round(bounds.start)}&we=${Math.round(bounds.end)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { count?: number }) => setDateCount(typeof data.count === "number" ? data.count : null))
      .catch(() => undefined)
    return () => ctrl.abort()
  }, [open, scope, bounds])

  /* Ticked orders, newest first as the list has them, by the numbers they were shown with. */
  const selectedNumbers = React.useMemo(
    () => [...selected].map((id) => numbers[id]).filter((n): n is number => typeof n === "number" && n > 0).sort((a, b) => b - a),
    [selected, numbers],
  )

  /* The orders already here whole, written on this device as before; anything wider is written by the server. */
  const local: Order[] | null =
    scope === "page" ? pageOrders
      : scope === "selected" ? pickByNumber(known, selectedNumbers).length === selectedNumbers.length ? pickByNumber(known, selectedNumbers) : null
        : null
  const ask: ExportAsk =
    scope === "page" ? { numbers: encodeRuns(pageOrders.map((o) => o.number)) }
      : scope === "selected" ? { numbers: encodeRuns(selectedNumbers) }
        : scope === "all" ? { query: "", window: null }
          : scope === "matching" ? { query: paramsFromQuery(query).toString(), window: { start: span.start, end: span.end } }
            : { query: "", window: { start: bounds.start, end: bounds.end } }
  const size =
    scope === "page" ? pageOrders.length
      : scope === "all" ? total
        : scope === "selected" ? selectedNumbers.length
          : scope === "matching" ? matching
            : dateCount ?? 0

  const run = async () => {
    if (!ready || busy) return
    const name = scope === "dates" ? `orders-${dates.start}-to-${dates.end}.csv` : `orders-${today}.csv`
    const what = plural(size)
    /* The file itself (download) or a link to it, written by the server for this choice. */
    const fromServer = async (download: boolean) => {
      const res = await fetch("/api/app/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ask, format, timeZone, name, download }),
      })
      if (download && res.ok) return res
      const data = await res.json().catch(() => ({}))
      if (!res.ok || (!download && !data?.url)) throw new Error(data?.error || tt("The export could not be made. Try again."))
      return data.url as string
    }
    setBusy(true)
    try {
      /* A browser saves the file written here (or by the server, for orders
         this page does not have); the phone app opens a link the server
         writes the same file behind (lib/platform/save-file.ts). */
      const outcome = await saveFile({
        name,
        file: async () =>
          local
            ? new Blob([ordersCsv(local, timeZone, format)], { type: "text/csv;charset=utf-8" })
            : /* The bytes as written, the byte order mark for spreadsheets included (text() would drop it). */
              new Blob([await ((await fromServer(true)) as Response).arrayBuffer()], { type: "text/csv;charset=utf-8" }),
        link: async () => (await fromServer(false)) as string,
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

  /* By date while its count is on its way: the button waits rather than saying there is nothing. */
  const counting = scope === "dates" && dateCount === null
  const ready = size > 0 && !counting
  const label = busy ? tt("Exporting…") : counting ? tt("Export") : size === 0 ? tt("Nothing to export") : tt("Export {count}", { count: plural(size) })
  const viewDetail = `${valueLabel(period)}${filtering ? tt(", filtered") : ""} · ${count(matching)}`

  const choices = (compact: boolean) => (
    <>
      <Group compact={compact} label={tt("Orders")}>
        <Choice compact={compact} checked={scope === "matching"} onSelect={() => setScope("matching")} label={tt("This view")} detail={viewDetail} />
        {selected.size > 0 ? (
          <Choice compact={compact} checked={scope === "selected"} onSelect={() => setScope("selected")} label={tt("Selected")} detail={count(selected.size)} />
        ) : null}
        <Choice compact={compact} checked={scope === "page"} onSelect={() => setScope("page")} label={tt("This page")} detail={count(pageOrders.length)} />
        <Choice compact={compact} checked={scope === "all"} onSelect={() => setScope("all")} label={tt("All orders")} detail={count(total)} />
        <Choice
          compact={compact}
          checked={scope === "dates"}
          onSelect={() => setScope("dates")}
          label={tt("By date")}
          detail={scope === "dates" ? (dateCount === null ? rangeLabel(dates) : `${rangeLabel(dates)} · ${count(dateCount)}`) : null}
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
            disabled={!ready || busy}
            aria-busy={busy || undefined}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-colors duration-100 active:bg-[#111122] disabled:bg-[#d4d4d8] disabled:shadow-none"
          >
            {label}
          </button>
        </div>
      </BottomSheet>
    )
  }

  return <ExportPanel open={open} busy={busy} onClose={onClose} onRun={run} label={label} ready={ready} body={choices(false)} />
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
