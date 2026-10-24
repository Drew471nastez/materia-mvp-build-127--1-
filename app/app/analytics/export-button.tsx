"use client"

/**
 * ===========================================================================
 *  EXPORT: WHICH REPORTS, AND IN WHICH FILE
 * ===========================================================================
 * The owner: "positioned somewhere else, without creating multiple rows ...
 * options on what to export exactly and in which format ... a modal, smooth
 * and clean". So Export is the last control in the period's own row (no row
 * of its own, never above the figures), and it opens the /app dialog (the
 * shared bottom sheet on a phone):
 *
 *   Reports   every report the page draws, each a checkbox, all on
 *             (lib/analytics/export-csv EXPORT_REPORTS; Sales only for a
 *             store that sells)
 *   Range     the page's period and place, as they are; changed on the page
 *   Format    one CSV file with them all, or a zip with a CSV per report.
 *             No Excel: no spreadsheet library is in the app, and a CSV opens
 *             in Excel, Numbers and Google Sheets as it is
 *
 * The file is written on the server (app/api/analytics/export) with the code
 * that counts the page, for the signed in owner only, cells that start like
 * a formula kept as text. A browser downloads it; the phone app opens a link
 * signed for this one file in the system browser sheet, which saves it
 * (lib/platform/save-file).
 */
import * as React from "react"
import { Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { pickerButton } from "@/components/app/date-range-picker"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { tt } from "@/lib/i18n/text"
import { EXPORT_REPORTS, type ExportFormat, type ExportReport } from "@/lib/analytics/export-csv"
import { ReportCheckbox, SECONDARY_BUTTON, PRIMARY_BUTTON } from "./add-reports"

/** Each report's name in the dialog, in the dashboard's language. */
const NAME: Record<ExportReport, () => string> = {
  summary: () => tt("Summary"),
  "over-time": () => tt("Over time"),
  sales: () => tt("Sales"),
  traffic: () => tt("Traffic sources and referrers"),
  pages: () => tt("Pages and links"),
  products: () => tt("Products and downloads"),
  funnel: () => tt("Funnel"),
  subscribers: () => tt("Subscribers"),
  countries: () => tt("Countries"),
  devices: () => tt("Devices and systems"),
}

export interface ExportChoice {
  reports: ExportReport[]
  format: ExportFormat
}

/** The address of the file for the page's question and the choice: the route reads `reports` and `format`. */
export function exportAddress(query: string, choice: ExportChoice): string {
  const q = new URLSearchParams(query)
  if (choice.reports.length < EXPORT_REPORTS.length) q.set("reports", choice.reports.join(","))
  if (choice.format === "zip") q.set("format", "zip")
  return q.toString()
}

/** A radio row, drawn as the picker's checkbox rows are. */
function FormatRow({ value, on, label, line, onPick }: { value: ExportFormat; on: boolean; label: string; line: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      data-export-format={value}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left outline-none hover:bg-[#f6f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.22)] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
    >
      <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border border-[#c9ccd2] bg-white">
        <span className={cn("h-2.5 w-2.5 rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[#1a1a2e]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[#6b7280]">{line}</span>
      </span>
    </button>
  )
}

function Body({ options, picked, toggle, setAll, format, setFormat, range }: { options: readonly ExportReport[]; picked: ReadonlySet<ExportReport>; toggle: (id: ExportReport) => void; setAll: (on: boolean) => void; format: ExportFormat; setFormat: (f: ExportFormat) => void; range: string }) {
  const all = options.every((id) => picked.has(id))
  return (
    <div className="flex flex-col gap-4" data-export-body="">
      <div role="group" aria-label={tt("Reports")}>
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-[12px] font-medium text-[#6b7280]">{tt("Reports")}</p>
          <button type="button" onClick={() => setAll(!all)} data-export-all="" className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]">
            {all ? tt("Clear all") : tt("Select all")}
          </button>
        </div>
        {options.map((id) => (
          <button
            key={id}
            type="button"
            role="checkbox"
            aria-checked={picked.has(id)}
            onClick={() => toggle(id)}
            data-export-report={id}
            className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] text-[#1a1a2e] outline-none hover:bg-[#f6f7f8] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.22)] active:bg-[#f1f2f4] [-webkit-tap-highlight-color:transparent]"
          >
            <ReportCheckbox on={picked.has(id)} />
            {NAME[id]()}
          </button>
        ))}
      </div>
      <div className="px-3">
        <p className="text-[12px] font-medium text-[#6b7280]">{tt("Range")}</p>
        <p className="mt-1 text-[14px] tabular-nums text-[#1a1a2e]" data-export-range="">{range}</p>
      </div>
      <div role="radiogroup" aria-label={tt("Format")}>
        <p className="px-3 pb-1 text-[12px] font-medium text-[#6b7280]">{tt("Format")}</p>
        <FormatRow value="csv" on={format === "csv"} label={tt("CSV")} line={tt("One file, a section per report")} onPick={() => setFormat("csv")} />
        <FormatRow value="zip" on={format === "zip"} label={tt("CSV per report")} line={tt("A .zip with one file for each report")} onPick={() => setFormat("zip")} />
      </div>
    </div>
  )
}

/**
 * The control in the period's row and the dialog it opens. `options` are the
 * reports this page draws; `range` is the period and place as the page names
 * them; `query` is the page's question; `name` the file's name without its
 * ending.
 */
export function ExportButton({ query, name, options, range, className }: { query: string; name: string; options: readonly ExportReport[]; range: string; className?: string }) {
  const phone = usePhoneWidth()
  const [open, setOpen] = React.useState(false)
  const [picked, setPicked] = React.useState<Set<ExportReport>>(() => new Set(options))
  const [format, setFormat] = React.useState<ExportFormat>("csv")
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  /* Every report is chosen each time it opens: the dialog never remembers a narrower file than the page. */
  React.useEffect(() => {
    if (open) setPicked(new Set(options))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 4000)
    return () => window.clearTimeout(t)
  }, [note])

  const toggle = (id: ExportReport) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const chosen = options.filter((id) => picked.has(id))

  const run = async () => {
    if (busy || chosen.length === 0) return
    setBusy(true)
    setNote(null)
    const address = exportAddress(query, { reports: chosen, format })
    const file = `${name}.${format}`
    try {
      const outcome = await saveFile({
        name: file,
        file: async () => {
          const res = await fetch(`/api/analytics/export?${address}`, { cache: "no-store" })
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error || tt("The export could not be made. Try again."))
          /* The bytes as written, the byte order mark for spreadsheets included. */
          return new Blob([await res.arrayBuffer()], { type: format === "zip" ? "application/zip" : "text/csv;charset=utf-8" })
        },
        link: async (disposition) => {
          const res = await fetch("/api/analytics/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: address, disposition }) })
          const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
          if (!res.ok || !data?.url) throw new Error(data?.error || tt("The export could not be made. Try again."))
          return new URL(data.url, window.location.origin).href
        },
      })
      setOpen(false)
      setNote(outcome === "downloaded" ? tt("Exported") : savedMessage(outcome, tt("Analytics file")))
    } catch (error) {
      setNote((error as Error)?.message || tt("The export could not be made. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const body = <Body options={options} picked={picked} toggle={toggle} setAll={(on) => setPicked(new Set(on ? options : []))} format={format} setFormat={setFormat} range={range} />
  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" className={cn(SECONDARY_BUTTON, phone && "flex-1")} onClick={() => setOpen(false)}>
        {tt("Cancel")}
      </button>
      <button type="button" data-export-download="" disabled={busy || chosen.length === 0} aria-busy={busy} className={cn(PRIMARY_BUTTON, "gap-1.5 disabled:cursor-default disabled:opacity-50", phone && "flex-1")} onClick={run}>
        <Download className="h-4 w-4" aria-hidden />
        {busy ? tt("Exporting…") : tt("Download")}
      </button>
    </div>
  )

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <button type="button" aria-haspopup="dialog" aria-label={tt("Export")} onClick={() => setOpen(true)} data-analytics-export="" className={cn(pickerButton, "px-2 sm:px-2.5", className)}>
        <Download className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
        <span className="hidden sm:inline">{tt("Export")}</span>
      </button>
      <span role="status" aria-live="polite" className={cn("pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-md bg-[#1a1a2e] px-2 py-1 text-[12px] text-white transition-opacity duration-150", note ? "opacity-100" : "opacity-0")}>
        {note ?? ""}
      </span>
      {phone ? (
        <BottomSheet isOpen={open} onClose={() => setOpen(false)} title={tt("Export")}>
          <div className="px-1 pb-3" data-export-sheet="">
            {body}
          </div>
          <div data-panel-foot="" className="sticky bottom-0 border-t border-[#eef0f2] bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>
        </BottomSheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            data-export-dialog=""
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
            }}
            className="w-[calc(100%-32px)] max-w-[440px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_64px_-12px_rgba(17,24,39,0.28),0_2px_8px_rgba(17,24,39,0.06)]"
          >
            <div className="border-b border-[#eef0f2] px-5 py-4">
              <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{tt("Export")}</DialogTitle>
            </div>
            <div className="max-h-[min(64vh,560px)] overflow-y-auto px-2 py-3">{body}</div>
            <div className="border-t border-[#eef0f2] px-5 py-3">{footer}</div>
          </DialogContent>
        </Dialog>
      )}
    </span>
  )
}
