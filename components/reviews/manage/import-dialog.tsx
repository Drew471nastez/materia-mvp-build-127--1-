"use client"

/**
 * STORELIB REVIEWS › REVIEWS › IMPORT, in four steps on one sheet:
 *
 *   1. FILE      a CSV from another review app (Judge.me and the like)
 *                or typed by hand
 *   2. COLUMNS   which column holds the product, the rating, the review and
 *                the rest; found by name, changed by the store
 *   3. CHECK     every row read by the server, nothing written yet: which
 *                product each matched (by handle, SKU or title) and, for a
 *                row that will be skipped, one sentence saying why
 *   4. DONE      how many went in, each row that did not and why, and the
 *                report to download; an import can be undone from the list
 *
 * Imported reviews are marked Imported: they show on the website like any
 * other, but never say Verified purchase and never count in a Storelib
 * rating (lib/reviews/import-csv.ts, run-now part 134).
 */
import * as React from "react"
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { api } from "@/components/physical/ui"
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, REQUIRED_FIELDS, guessMapping, parseCsv, type ColumnMap, type ImportField, type RowOutcome } from "@/lib/reviews/import-csv"
import { buttonPrimary, buttonSecondary } from "@/app/app/orders/order-parts"
import { MUTED, SEG, Sheet, ToolbarSelect, formatCount, shortDate, useRead, errorOf } from "./parts"

type Step = "file" | "map" | "check" | "done"

const FIELD_LABEL: Record<ImportField, () => string> = {
  product: () => tt("Product (handle, SKU or title)"),
  rating: () => tt("Rating (1 to 5)"),
  body: () => tt("Review text"),
  title: () => tt("Review title"),
  name: () => tt("Reviewer's name"),
  date: () => tt("Date"),
}

interface Checked {
  header: string[]
  mapping: ColumnMap
  rows: RowOutcome[]
  counts: { ok: number; skipped: number }
  truncated: boolean
}

interface ImportRecord {
  id: string
  file_name: string | null
  imported: number
  skipped: number
  undone_at: string | null
  created_at: string
}

const MATCH_WORD: Record<string, () => string> = { id: () => tt("by id"), handle: () => tt("by handle"), sku: () => tt("by SKU"), title: () => tt("by title") }

/** A row's outcome in the dashboard's language, from its codes; the server's sentence for anything else. */
function rowMessage(r: RowOutcome): string {
  if (r.why === "no_product") return r.raw ? tt('No product matches "{value}". Use its handle, SKU or exact title.', { value: r.raw }) : tt("The product is empty.")
  if (r.why === "bad_rating") return r.raw ? tt('The rating "{value}" isn\'t a whole number from 1 to 5.', { value: r.raw }) : tt("The rating is empty.")
  if (r.why === "no_words") return tt("The review text is empty.")
  if (r.why === "duplicate") return r.dupOf ? tt("Same review as row {row}.", { row: r.dupOf }) : tt("This review is already on your store.")
  return r.message ?? ""
}

function rowNote(r: RowOutcome): string {
  return (r.notes ?? []).map((n) => (n === "bad_date" ? tt("The date couldn't be read, so today's date is used.") : tt("The text is cut to 2,000 characters."))).join(" ")
}

/** The outcome of every row as a CSV the store can open, to fix the skipped rows and import them again. */
function reportCsv(rows: RowOutcome[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  return ["row,result,product,reason", ...rows.map((r) => [r.row, r.ok ? "imported" : "skipped", q(r.productTitle ?? ""), q(r.ok ? rowNote(r) : rowMessage(r))].join(","))].join("\n")
}

export function ImportDialog({ onClose, onDone, onUndone }: { onClose: () => void; onDone: (n: number) => void; onUndone: () => void }) {
  const [step, setStep] = React.useState<Step>("file")
  const [csv, setCsv] = React.useState("")
  const [fileName, setFileName] = React.useState("")
  const [header, setHeader] = React.useState<string[]>([])
  const [sample, setSample] = React.useState<string[]>([])
  const [mapping, setMapping] = React.useState<ColumnMap>({})
  const [checked, setChecked] = React.useState<Checked | null>(null)
  const [result, setResult] = React.useState<{ imported: number; rows: RowOutcome[] } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [onlySkipped, setOnlySkipped] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const history = useRead<{ ready: boolean; imports: ImportRecord[] }>(step === "file" ? "/api/app/reviews/import" : null)

  const choose = async (file: File) => {
    setError(null)
    if (file.size > MAX_IMPORT_BYTES) return setError(tt("That file is too large. Split it into files under 4 MB."))
    const text = await file.text().catch(() => "")
    const rows = parseCsv(text.slice(0, 200_000))
    if (rows.length < 2) return setError(tt("That file has no rows under its header row."))
    setCsv(text)
    setFileName(file.name)
    setHeader(rows[0])
    setSample(rows[1] ?? [])
    setMapping(guessMapping(rows[0]))
    setStep("map")
  }

  const check = async () => {
    setBusy(true)
    setError(null)
    const r = await api<Checked>("/api/app/reviews/import", { method: "POST", body: { csv, mapping, preview: true }, timeoutMs: 60_000 })
    setBusy(false)
    if (!r.ok) return setError(errorOf(r))
    setChecked(r.data)
    setOnlySkipped(false)
    setStep("check")
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    const r = await api<{ imported: number; rows: RowOutcome[] }>("/api/app/reviews/import", { method: "POST", body: { csv, mapping, fileName }, timeoutMs: 60_000 })
    setBusy(false)
    if (!r.ok) return setError(errorOf(r))
    setResult({ imported: r.data.imported ?? 0, rows: r.data.rows ?? [] })
    setStep("done")
    if (r.data.imported) onDone(r.data.imported)
  }

  const undo = async (id: string) => {
    setBusy(true)
    const r = await api<{ removed: number }>(`/api/app/reviews/import?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    setBusy(false)
    if (!r.ok) return setError(errorOf(r))
    history.reload()
    onUndone()
  }

  const download = () => {
    const rows = result?.rows ?? checked?.rows ?? []
    const blob = new Blob([reportCsv(rows)], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${(fileName || "reviews").replace(/\.csv$/i, "")}-import-report.csv`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const missing = REQUIRED_FIELDS.filter((f) => mapping[f] === undefined)
  const list = (result?.rows ?? checked?.rows ?? []).filter((r) => !onlySkipped || !r.ok)

  const footer =
    step === "file" ? (
      <>
        <button type="button" onClick={onClose} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-[14px]")}>
          {tt("Cancel")}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:ml-auto sm:h-10 sm:flex-none sm:text-[14px]")} data-import-choose="">
          <FileUp className="h-4 w-4" aria-hidden />
          {tt("Choose CSV")}
        </button>
      </>
    ) : step === "map" ? (
      <>
        <button type="button" onClick={() => setStep("file")} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-[14px]")}>
          {tt("Back")}
        </button>
        <button type="button" onClick={() => void check()} disabled={busy || missing.length > 0} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:ml-auto sm:h-10 sm:flex-none sm:text-[14px]")} data-import-check="">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {tt("Check rows")}
        </button>
      </>
    ) : step === "check" ? (
      <>
        <button type="button" onClick={() => setStep("map")} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-[14px]")}>
          {tt("Back")}
        </button>
        <button type="button" onClick={() => void run()} disabled={busy || !checked?.counts.ok} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:ml-auto sm:h-10 sm:flex-none sm:text-[14px]")} data-import-run="">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {busy ? tt("Importing") : tt("{n, plural, one {Import # review} other {Import # reviews}}", { n: checked?.counts.ok ?? 0 })}
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={download} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:flex-none sm:text-[14px]")}>
          <Download className="h-4 w-4" aria-hidden />
          {tt("Download report")}
        </button>
        <button type="button" onClick={onClose} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:ml-auto sm:h-10 sm:flex-none sm:text-[14px]")}>
          {tt("Done")}
        </button>
      </>
    )

  return (
    <Sheet labelId="reviews-import-title" title={tt("Import reviews")} onClose={onClose} busy={busy} wide={step !== "file"} footer={footer}>
      <div data-reviews-import-dialog="" data-import-step={step}>
        <ol className="mb-4 flex gap-1.5 text-[12px] font-medium" aria-label={tt("Steps")}>
          {(["file", "map", "check", "done"] as Step[]).map((s, i) => (
            <li key={s} className={cn("flex-1 border-t-2 pt-1.5", (["file", "map", "check", "done"] as Step[]).indexOf(step) >= i ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-[#e5e7eb] text-[#9ca3af]")}>
              {[tt("File"), tt("Columns"), tt("Check"), tt("Done")][i]}
            </li>
          ))}
        </ol>

        {step === "file" ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("A CSV with a row per review: the product (its handle, SKU or exact title), a rating from 1 to 5 and the review. Exports from Judge.me and most review apps work as they are.")}</p>
            <p className="rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[13px] leading-[19px] text-[#4b5563]" data-import-trust="">
              {tt("Imported reviews are marked Imported. They can show on your website, but they never get the Verified purchase label and never count in your Storelib rating.")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ""
                if (f) void choose(f)
              }}
            />
            {history.data?.imports.length ? (
              <div>
                <p className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Earlier imports")}</p>
                <ul className="mt-1.5 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]">
                  {history.data.imports.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[#1a1a2e]">{h.file_name || tt("CSV import")}</span>
                        <span className="text-[#6b7280]">
                          {shortDate(h.created_at)} · {tt("{n} imported", { n: formatCount(h.imported) })}
                          {h.undone_at ? ` · ${tt("undone")}` : ""}
                        </span>
                      </span>
                      {!h.undone_at && h.imported > 0 ? (
                        <button type="button" disabled={busy} onClick={() => void undo(h.id)} className="text-[13px] font-medium text-[#b42318] hover:underline" data-import-undo="">
                          {tt("Undo")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "map" ? (
          <div className="space-y-3">
            <p className={MUTED}>{tt("{file} · {n} columns. Pick the column for each field. Product, rating and review text are needed.", { file: fileName, n: header.length })}</p>
            <div className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]">
              {IMPORT_FIELDS.map((f) => {
                const at = mapping[f]
                return (
                  <div key={f} className="grid gap-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] sm:items-center sm:gap-3">
                    <span className="text-[13.5px] font-medium text-[#1a1a2e]">
                      {FIELD_LABEL[f]()}
                      {REQUIRED_FIELDS.includes(f) ? null : <span className="font-normal text-[#9ca3af]"> {tt("(optional)")}</span>}
                    </span>
                    <ToolbarSelect
                      label={FIELD_LABEL[f]()}
                      value={at === undefined ? "" : String(at)}
                      onChange={(v) => setMapping((m) => {
                        const next: ColumnMap = { ...m }
                        for (const k of IMPORT_FIELDS) if (next[k] === Number(v) && k !== f) delete next[k]
                        if (v === "") delete next[f]
                        else next[f] = Number(v)
                        return next
                      })}
                      className="md:flex-1 [&_select]:md:max-w-none [&_select]:md:w-full"
                      data-map-field={f}
                    >
                      <option value="">{tt("Not in this file")}</option>
                      {header.map((h, i) => (
                        <option key={i} value={i}>
                          {h || tt("Column {n}", { n: i + 1 })}
                        </option>
                      ))}
                    </ToolbarSelect>
                    <span className="truncate text-[12.5px] text-[#6b7280]" title={at !== undefined ? sample[at] : undefined}>
                      {at !== undefined && sample[at] ? tt("e.g. {value}", { value: sample[at].slice(0, 60) }) : ""}
                    </span>
                  </div>
                )
              })}
            </div>
            {missing.length ? <p className="text-[13px] text-[#92400e]">{tt("Pick a column for: {fields}.", { fields: missing.map((f) => FIELD_LABEL[f]()).join(", ") })}</p> : null}
          </div>
        ) : null}

        {(step === "check" && checked) || (step === "done" && result) ? (
          <div className="space-y-3">
            {step === "check" && checked ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px]" data-import-counts="">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#067647]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {tt("{n, plural, one {# row ready} other {# rows ready}}", { n: checked.counts.ok })}
                </span>
                {checked.counts.skipped ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#b42318]">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    {tt("{n, plural, one {# row will be skipped} other {# rows will be skipped}}", { n: checked.counts.skipped })}
                  </span>
                ) : null}
                {checked.truncated ? <span className={MUTED}>{tt("Only the first 2,000 rows are read. Import the rest as another file.")}</span> : null}
              </div>
            ) : result ? (
              <div className="text-[14px]" data-import-result="">
                <p className="inline-flex items-center gap-1.5 font-medium text-[#067647]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  {tt("{n, plural, one {# review imported} other {# reviews imported}}", { n: result.imported })}
                </p>
                {result.rows.some((r) => !r.ok) ? <p className="mt-1 text-[#4b5563]">{tt("{n, plural, one {# row was skipped. Fix it in the file and import it again; rows already imported are skipped next time.} other {# rows were skipped. Fix them in the file and import them again; rows already imported are skipped next time.}}", { n: result.rows.filter((r) => !r.ok).length })}</p> : null}
              </div>
            ) : null}
            <div className="flex gap-1">
              <button type="button" onClick={() => setOnlySkipped(false)} className={SEG(!onlySkipped)}>
                {tt("All rows")}
              </button>
              <button type="button" onClick={() => setOnlySkipped(true)} className={SEG(onlySkipped)} data-import-only-skipped="">
                {tt("Skipped only")}
              </button>
            </div>
            <div className="max-h-[46dvh] overflow-y-auto rounded-xl border border-[#eef0f2]">
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-[#fafbfb] text-[12px] text-[#6b7280]">
                  <tr>
                    <th className="w-14 px-3 py-2 font-medium">{tt("Row")}</th>
                    <th className="px-3 py-2 font-medium">{tt("Product")}</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">{tt("Review")}</th>
                    <th className="px-3 py-2 font-medium">{tt("Result")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f2f4]">
                  {list.slice(0, 500).map((r) => (
                    <tr key={r.row} data-import-row={r.ok ? "ok" : "skip"} className="align-top">
                      <td className="px-3 py-2 tabular-nums text-[#6b7280]">{r.row}</td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[200px] truncate text-[#1a1a2e]">{r.productTitle ?? "–"}</span>
                        {r.matchedBy ? <span className="text-[12px] text-[#9ca3af]">{MATCH_WORD[r.matchedBy]?.()}</span> : null}
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {r.rating ? <span className="mr-1.5 tabular-nums text-[#4b5563]">{"★".repeat(r.rating)}</span> : null}
                        <span className="text-[#374151] [overflow-wrap:anywhere]">{r.excerpt ?? ""}</span>
                      </td>
                      <td className="px-3 py-2">
                        {r.ok ? <span className="font-medium text-[#067647]">{step === "done" ? tt("Imported") : tt("Ready")}</span> : <span className="font-medium text-[#b42318]">{tt("Skipped")}</span>}
                        {r.ok ? (r.notes?.length ? <span className="block text-[12px] text-[#6b7280]">{rowNote(r)}</span> : null) : <span className="block text-[12px] text-[#4b5563]">{rowMessage(r)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length > 500 ? <p className="px-3 py-2 text-[12px] text-[#6b7280]">{tt("The first 500 rows are listed. Download the report for all of them.")}</p> : null}
              {list.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-[#6b7280]">{tt("Nothing skipped.")}</p> : null}
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p> : null}
      </div>
    </Sheet>
  )
}
