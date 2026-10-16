"use client"

/**
 * ===========================================================================
 *  REVIEWS › IMPORT
 * ===========================================================================
 * Three steps on one page, nothing written until the last:
 *
 *   1. the file     chosen or dropped; read here, never uploaded as a file.
 *                   The template has every column the import reads.
 *   2. the columns  each field and the column it was found in (the server
 *                   guesses them the way Judge.me, Shopify and Yotpo name
 *                   them), changeable, with the first row's value beside it.
 *                   Every change checks the whole file again: how many rows
 *                   are ready, and every row that is not, with why.
 *   3. the report   how many came in, every row that did not and why, a CSV
 *                   of those rows with the reason added to fix and import
 *                   again, and the import kept in the list under it, where
 *                   it can be taken back.
 *
 * The rules are lib/reviews/import-csv.ts; the route is
 * app/api/app/reviews/import.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { formatNumber, formatRelative } from "@/lib/i18n/format"
import { IMPORT_FIELDS, MAX_IMPORT_BYTES, parseCsv, type ColumnMapping, type ImportField, type RowProblem, type RowResult } from "@/lib/reviews/import-csv"
import { buttonPrimary, buttonSecondary, card } from "@/app/app/orders/order-parts"
import { REVIEWS_BODY, reviewsHref } from "./reviews-nav"

interface Plan {
  header: string[]
  mapping: ColumnMapping
  sample: string[][]
  rows: RowResult[]
  missingFields: ImportField[]
  total: number
  ready: number
  imported?: number
  batchId?: string | null
}

interface Batch {
  id: string
  file_name: string | null
  total: number
  imported: number
  skipped: number
  created_at: string
  undone_at: string | null
}

const FIELD_LABEL: Record<ImportField, () => string> = {
  product: () => tt("Product"),
  rating: () => tt("Rating"),
  body: () => tt("Review"),
  title: () => tt("Title"),
  name: () => tt("Name"),
  email: () => tt("Email"),
  date: () => tt("Date"),
  reply: () => tt("Your reply"),
}

const FIELD_HINT: Partial<Record<ImportField, () => string>> = {
  product: () => tt("Its handle, SKU, id or exact title"),
  rating: () => tt("A whole number from 1 to 5"),
  name: () => tt("Shown as a first name and an initial"),
  email: () => tt("Never shown. That address is not asked to review it again"),
  reply: () => tt("Shown under the review as yours"),
}

/* The same words as lib/reviews/import-csv.ts ROW_PROBLEMS, written out here so each is translated. */
const PROBLEM_LABEL: Record<RowProblem, () => string> = {
  no_product: () => tt("No product with that handle, SKU, id or title"),
  ambiguous_product: () => tt("Two products have that title. Use the handle or SKU"),
  bad_rating: () => tt("The rating is not a whole number from 1 to 5"),
  no_words: () => tt("The review text is empty"),
  duplicate_in_file: () => tt("The same review is on an earlier row"),
  already_imported: () => tt("This review is already in your store"),
}

const REQUIRED: ImportField[] = ["product", "rating", "body"]

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: Plan } | { ok: false; error: string }> {
  const res = await fetch("/api/app/reviews/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }).catch(() => null)
  const data = res ? await res.json().catch(() => ({})) : {}
  if (!res?.ok) return { ok: false, error: data.error || tt("The file did not import.") }
  return { ok: true, data: data as Plan }
}

export function ImportFlow() {
  const router = useRouter()
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null)
  const [plan, setPlan] = React.useState<Plan | null>(null)
  const [mapping, setMapping] = React.useState<ColumnMapping | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<Plan | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [batches, setBatches] = React.useState<Batch[] | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const ask = React.useRef(0)

  const loadBatches = React.useCallback(async () => {
    const res = await fetch("/api/app/reviews/import", { credentials: "same-origin", cache: "no-store" }).catch(() => null)
    const data = res?.ok ? await res.json().catch(() => null) : null
    setBatches(data?.batches ?? [])
  }, [])
  React.useEffect(() => void loadBatches(), [loadBatches])

  const check = async (text: string, map: ColumnMapping | null) => {
    const n = ++ask.current
    setChecking(true)
    setError(null)
    const out = await post({ csv: text, ...(map ? { mapping: map } : {}) })
    if (n !== ask.current) return
    setChecking(false)
    if (!out.ok) return setError(out.error)
    setPlan(out.data)
    setMapping(out.data.mapping)
  }

  const choose = async (f: File) => {
    setError(null)
    setResult(null)
    if (f.size > MAX_IMPORT_BYTES) return setError(tt("That file is too large. Split it into files under 4 MB."))
    const text = await f.text().catch(() => "")
    if (!text.trim()) return setError(tt("That file is empty."))
    setFile({ name: f.name, text })
    setPlan(null)
    setMapping(null)
    void check(text, null)
  }

  const remap = (field: ImportField, column: string) => {
    if (!file) return
    const next: ColumnMapping = { ...(mapping ?? {}) }
    if (column === "") delete next[field]
    else {
      const at = Number(column)
      /* A column holds one field: taken from whatever had it. */
      for (const f of IMPORT_FIELDS) if (next[f] === at) delete next[f]
      next[field] = at
    }
    setMapping(next)
    void check(file.text, next)
  }

  const run = async () => {
    if (!file || !mapping) return
    setImporting(true)
    setError(null)
    const out = await post({ csv: file.text, mapping, commit: true, fileName: file.name })
    setImporting(false)
    if (!out.ok) return setError(out.error)
    setResult(out.data)
    void loadBatches()
    router.refresh()
  }

  const reset = () => {
    setFile(null)
    setPlan(null)
    setMapping(null)
    setResult(null)
    setError(null)
  }

  const undo = async (b: Batch) => {
    const res = await fetch(`/api/app/reviews/import?batch=${b.id}`, { method: "DELETE", credentials: "same-origin" }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) return setError(data.error || tt("The import was not taken back. Try again."))
    void loadBatches()
    router.refresh()
  }

  const skippedCsv = React.useMemo(() => {
    const done = result ?? plan
    if (!file || !done) return null
    const bad = done.rows.filter((r) => !r.ok)
    if (!bad.length) return null
    const rows = parseCsv(file.text)
    const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const lines = [[...(rows[0] ?? []), "problem"].map(quote).join(","), ...bad.map((r) => [...(rows[r.row - 1] ?? []), r.problem ? PROBLEM_LABEL[r.problem]() : ""].map(quote).join(","))]
    return `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${lines.join("\r\n")}\r\n`)}`
  }, [file, plan, result])

  return (
    <div className={REVIEWS_BODY} data-reviews-import="">
      <div className="mt-3 flex items-center gap-2 text-[13px] text-[#6b7280]">
        <Link href={reviewsHref("reviews")} className="font-medium text-[#4b5563] hover:text-[#1a1a2e]">
          {tt("Reviews")}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-[#1a1a2e]">{tt("Import")}</span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">
          {error}
        </p>
      ) : null}

      {result ? (
        <ImportReport result={result} skippedCsv={skippedCsv} onAgain={reset} />
      ) : !file ? (
        <section className={cn(card, "mt-3 p-4 sm:p-6")} aria-labelledby="import-title">
          <h2 id="import-title" className="text-[17px] font-semibold text-[#1a1a2e]">
            {tt("Import reviews from a CSV")}
          </h2>
          <p className="mt-1 max-w-[620px] text-[14px] leading-relaxed text-[#6b7280]">
            {tt("One row per review. Exports from Judge.me, Shopify Product Reviews and Yotpo work as they are. You check the columns before anything is added. Imported reviews are never marked as a verified purchase.")}
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) void choose(f)
            }}
            className={cn("mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center transition-colors", dragging ? "border-[#8b5cf6] bg-[#f6f3ff]" : "border-[#d6d9df] bg-[#fafbfb]")}
          >
            <Upload className="h-5 w-5 text-[#6b7280]" aria-hidden />
            <p className="mt-2 text-[14px] text-[#4b5563]">{tt("Drop a CSV here, or")}</p>
            <button type="button" onClick={() => fileRef.current?.click()} className={cn(buttonPrimary, "mt-3 h-10 px-4 text-[14px]")} data-import-choose="">
              {tt("Choose a file")}
            </button>
          </div>
          <p className="mt-3 text-[13px] text-[#6b7280]">
            <a href="/api/app/reviews/import/template" download className="font-medium text-[#1a1a2e] underline underline-offset-4" data-import-template="">
              {tt("Download the template")}
            </a>{" "}
            {tt("with every column the import reads. Up to 2,000 rows and 4 MB a file.")}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void choose(f)
            }}
          />
        </section>
      ) : (
        <ColumnsStep file={file} plan={plan} mapping={mapping} checking={checking} importing={importing} onRemap={remap} onImport={run} onCancel={reset} />
      )}

      {batches && batches.length ? (
        <section className={cn(card, "mt-3 overflow-hidden")} aria-labelledby="import-history">
          <h2 id="import-history" className="border-b border-[#f1f2f4] px-4 py-3 text-[15px] font-semibold text-[#1a1a2e] sm:px-6">
            {tt("Past imports")}
          </h2>
          <ul className="divide-y divide-[#f1f2f4]">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-6" data-import-batch={b.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{b.file_name || tt("A CSV file")}</p>
                  <p className="text-[13px] text-[#6b7280]" suppressHydrationWarning>
                    {b.undone_at ? tt("Taken back") : tt("{imported} imported, {skipped} skipped", { imported: formatNumber(b.imported), skipped: formatNumber(b.skipped) })} · {formatRelative(b.created_at)}
                  </p>
                </div>
                {!b.undone_at && b.imported > 0 ? <UndoButton onUndo={() => undo(b)} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function UndoButton({ onUndo }: { onUndo: () => Promise<void> }) {
  const [sure, setSure] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  if (!sure) {
    return (
      <button type="button" onClick={() => setSure(true)} className={cn(buttonSecondary, "max-md:h-10")}>
        {tt("Take back")}
      </button>
    )
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-[13px] text-[#6b7280]">{tt("Delete every review it added?")}</span>
      <button type="button" onClick={() => setSure(false)} disabled={busy} className={cn(buttonSecondary, "max-md:h-10")}>
        {tt("Keep")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await onUndo()
          setBusy(false)
          setSure(false)
        }}
        className="inline-flex h-8 items-center rounded-lg bg-[#c4290c] px-3 text-[13px] font-medium text-white hover:bg-[#a82309] disabled:opacity-50 max-md:h-10"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : tt("Delete them")}
      </button>
    </span>
  )
}

function ColumnsStep({ file, plan, mapping, checking, importing, onRemap, onImport, onCancel }: { file: { name: string }; plan: Plan | null; mapping: ColumnMapping | null; checking: boolean; importing: boolean; onRemap: (f: ImportField, column: string) => void; onImport: () => void; onCancel: () => void }) {
  const problems = plan ? plan.rows.filter((r) => !r.ok) : []
  const missing = plan?.missingFields ?? []
  return (
    <section className={cn(card, "mt-3 overflow-hidden")} aria-labelledby="import-columns">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 id="import-columns" className="text-[15px] font-semibold text-[#1a1a2e]">
            {tt("Check the columns")}
          </h2>
          <p className="truncate text-[13px] text-[#6b7280]">{file.name}</p>
        </div>
        <button type="button" onClick={onCancel} className={cn(buttonSecondary, "max-md:h-10")}>
          {tt("Choose another file")}
        </button>
      </div>
      {!plan ? (
        <div className="flex items-center gap-2 px-4 py-8 text-[14px] text-[#6b7280] sm:px-6">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {tt("Reading the file")}
        </div>
      ) : (
        <>
          <div className={cn("divide-y divide-[#f4f5f6] transition-opacity", checking && "opacity-60")}>
            {IMPORT_FIELDS.map((f) => {
              const at = mapping?.[f]
              const sample = at === undefined ? "" : (plan.sample[0]?.[at] ?? "")
              return (
                <div key={f} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_minmax(0,260px)_minmax(0,1fr)] sm:items-center sm:px-6" data-import-field={f}>
                  <div>
                    <p className="text-[14px] font-medium text-[#1a1a2e]">
                      {FIELD_LABEL[f]()}
                      {REQUIRED.includes(f) ? <span className="text-[#b42318]"> *</span> : null}
                    </p>
                    {FIELD_HINT[f] ? <p className="text-[12.5px] leading-[17px] text-[#9ca3af]">{FIELD_HINT[f]!()}</p> : null}
                  </div>
                  <label className="relative block">
                    <span className="sr-only">{tt("Column for {field}", { field: FIELD_LABEL[f]() })}</span>
                    <select
                      value={at === undefined ? "" : String(at)}
                      onChange={(e) => onRemap(f, e.target.value)}
                      className={cn(
                        "h-10 w-full cursor-pointer appearance-none truncate rounded-lg border bg-white pl-3 pr-8 text-[16px] text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-9 sm:text-[14px]",
                        missing.includes(f) ? "border-[#f3b2a6]" : "border-[#e3e4e8]",
                      )}
                    >
                      <option value="">{tt("Not in this file")}</option>
                      {plan.header.map((h, i) => (
                        <option key={i} value={i}>
                          {h || tt("Column {n}", { n: i + 1 })}
                        </option>
                      ))}
                    </select>
                    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </label>
                  <p className="truncate text-[13px] text-[#6b7280]" title={sample}>
                    {sample ? tt("First row: {value}", { value: sample }) : at === undefined ? "" : tt("Empty in the first row")}
                  </p>
                </div>
              )
            })}
          </div>

          <div className="border-t border-[#f1f2f4] px-4 py-4 sm:px-6">
            {missing.length ? (
              <p className="text-[14px] text-[#b42318]">{tt("Choose a column for {fields}.", { fields: missing.map((f) => FIELD_LABEL[f]()).join(", ") })}</p>
            ) : (
              <p className="text-[14px] text-[#1a1a2e]" data-import-ready={plan.ready}>
                <span className="font-semibold">{tt("{ready} of {total} rows are ready to import.", { ready: formatNumber(plan.ready), total: formatNumber(plan.total) })}</span>{" "}
                {problems.length ? <span className="text-[#6b7280]">{tt("{n, plural, one {# row will be skipped:} other {# rows will be skipped:}}", { n: problems.length })}</span> : null}
              </p>
            )}
            {problems.length && !missing.length ? <ProblemList rows={problems} /> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" disabled={importing || checking || !!missing.length || plan.ready === 0} onClick={onImport} className={cn(buttonPrimary, "h-10 px-4 text-[14px]")} data-import-run="">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {importing ? tt("Importing") : tt("{n, plural, one {Import # review} other {Import # reviews}}", { n: plan.ready })}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/** The rows that were not used, by reason, each with its line in the file and what it said. */
function ProblemList({ rows }: { rows: RowResult[] }) {
  const groups = new Map<RowProblem, RowResult[]>()
  for (const r of rows) if (r.problem) groups.set(r.problem, [...(groups.get(r.problem) ?? []), r])
  return (
    <ul className="mt-3 space-y-3" data-import-problems="">
      {[...groups.entries()].map(([problem, list]) => (
        <li key={problem} className="rounded-xl bg-[#fafbfb] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(16,24,40,0.05)]">
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">
            {PROBLEM_LABEL[problem]()} <span className="font-normal tabular-nums text-[#6b7280]">({formatNumber(list.length)})</span>
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[13px] text-[#4b5563]">
            {list.slice(0, 8).map((r) => (
              <li key={r.row} className="truncate">
                {tt("Row {row}", { row: r.row })}
                {problem === "bad_rating" ? `: “${r.rating ?? ""}”` : problem === "no_product" || problem === "ambiguous_product" ? `: “${r.product ?? ""}”` : ""}
              </li>
            ))}
            {list.length > 8 ? <li className="text-[#9ca3af]">{tt("and {n} more", { n: list.length - 8 })}</li> : null}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function ImportReport({ result, skippedCsv, onAgain }: { result: Plan; skippedCsv: string | null; onAgain: () => void }) {
  const skipped = result.rows.filter((r) => !r.ok)
  const noted = result.rows.filter((r) => r.ok && r.notes?.length)
  return (
    <section className={cn(card, "mt-3 p-4 sm:p-6")} aria-labelledby="import-done" data-import-report="">
      <h2 id="import-done" className="text-[17px] font-semibold text-[#1a1a2e]">
        {tt("{n, plural, one {# review imported} other {# reviews imported}}", { n: result.imported ?? 0 })}
      </h2>
      <p className="mt-1 text-[14px] text-[#6b7280]">
        {skipped.length ? tt("{n, plural, one {# row was skipped.} other {# rows were skipped.}}", { n: skipped.length }) : tt("Every row came in.")}{" "}
        {noted.length ? tt("{n, plural, one {# row came in with today's date because its date could not be read, or with its words cut to 2,000 characters.} other {# rows came in with today's date because their date could not be read, or with their words cut to 2,000 characters.}}", { n: noted.length }) : ""}
      </p>
      {skipped.length ? <ProblemList rows={skipped} /> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`${reviewsHref("reviews")}?verified=no`} className={cn(buttonPrimary, "h-10 px-4 text-[14px]")}>
          {tt("See the reviews")}
        </Link>
        {skippedCsv ? (
          <a href={skippedCsv} download="skipped-reviews.csv" className={cn(buttonSecondary, "h-10 px-4 text-[14px]")}>
            {tt("Download the skipped rows")}
          </a>
        ) : null}
        <button type="button" onClick={onAgain} className={cn(buttonSecondary, "h-10 px-4 text-[14px]")}>
          {tt("Import another file")}
        </button>
      </div>
    </section>
  )
}
