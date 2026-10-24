"use client"

/**
 * EXPORT: every report on the page as one CSV file, for the period, place,
 * product and switch chosen (app/api/analytics/export writes it with the
 * code that counts the page). A browser downloads it; the phone app opens a
 * link signed for this one file in the system browser sheet, which saves it
 * (lib/platform/save-file).
 */
import * as React from "react"
import { Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { pickerButton } from "@/components/app/date-range-picker"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { tt } from "@/lib/i18n/text"

export function ExportButton({ query, name, className }: { query: string; name: string; className?: string }) {
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 4000)
    return () => window.clearTimeout(t)
  }, [note])

  const run = async () => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const outcome = await saveFile({
        name,
        file: async () => {
          const res = await fetch(`/api/analytics/export?${query}`, { cache: "no-store" })
          if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error || tt("The export could not be made. Try again."))
          /* The bytes as written, the byte order mark for spreadsheets included. */
          return new Blob([await res.arrayBuffer()], { type: "text/csv;charset=utf-8" })
        },
        link: async (disposition) => {
          const res = await fetch("/api/analytics/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, disposition }) })
          const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
          if (!res.ok || !data?.url) throw new Error(data?.error || tt("The export could not be made. Try again."))
          return new URL(data.url, window.location.origin).href
        },
      })
      setNote(outcome === "downloaded" ? tt("Exported") : savedMessage(outcome, tt("Analytics file")))
    } catch (error) {
      setNote((error as Error)?.message || tt("The export could not be made. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="relative inline-flex shrink-0 items-center">
      <button type="button" onClick={run} disabled={busy} aria-busy={busy} data-analytics-export="" className={cn(pickerButton, "disabled:cursor-default disabled:opacity-70", className)}>
        <Download className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
        {busy ? tt("Exporting…") : tt("Export")}
      </button>
      <span role="status" aria-live="polite" className={cn("pointer-events-none absolute right-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-md bg-[#1a1a2e] px-2 py-1 text-[12px] text-white transition-opacity duration-150", note ? "opacity-100" : "opacity-0")}>
        {note ?? ""}
      </span>
    </span>
  )
}
