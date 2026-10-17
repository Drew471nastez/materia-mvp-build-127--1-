"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { Stars } from "@/components/reviews/stars"
import { buttonPrimary, buttonSecondary } from "@/app/app/orders/order-parts"
import { Sheet } from "./parts"
import {
  FIELDS,
  IMPORT_CHUNK_ROWS,
  IMPORT_CHUNK_ROWS_WITH_PHOTOS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_FILE_ROWS,
  NO_PRODUCT_KEY,
  PLATFORMS,
  ROW_ERRORS,
  autoMapping,
  detectPlatform,
  missingFields,
  planReviews,
  platformLabel,
  readImportFile,
  type Assignments,
  type CatalogProduct,
  type FieldId,
  type ImportMapping,
  type ImportPlan,
  type ImportTable,
  type PlatformId,
  type RowError,
  type UnmatchedGroup,
} from "@/lib/reviews/import"

/**
 * ===========================================================================
 *  STORELIB REVIEWS › REVIEWS › IMPORT
 * ===========================================================================
 * Reviews from another app in four steps, the way Shopify's own importers
 * go: the file, its columns, the products it names, the result. Opened from
 * the Reviews tab (reviews-view.tsx); its earlier imports and their Undo are
 * Reviews' own (lib/reviews/manage-server listImports, undoImport).
 *
 *   FILE       read here in the browser (CSV, TSV, JSON, a WordPress XML),
 *              up to 25 MB and 50,000 rows; the store's past imports below,
 *              each with its counts and Undo
 *   COLUMNS    the app that wrote it, detected from its header row and
 *              changeable; each Storelib field's column, changeable; the
 *              first rows as they will import
 *   PRODUCTS   rows naming a product the store does not have, grouped by
 *              what they name: pick a product for each group, or skip it
 *   RESULT     sent in chunks (fewer rows a chunk while photos are copied),
 *              then imported, already here, skipped and errors by row
 *
 * The server reads every row again (lib/reviews/import checkImportRow) and
 * writes only to the store's own products. lib/reviews/import-server.ts
 * says how each step is written and undone.
 */

/** An import as Reviews lists it (part 215), with the app and the counts apart once part 232 has run. */
interface ImportRecord {
  id: string
  file_name: string | null
  imported: number
  skipped: number
  undone_at: string | null
  created_at: string
  platform?: string
  duplicates?: number
  errors?: number
  undone_count?: number | null
}

type Step = "file" | "map" | "products" | "run" | "done"

interface Result {
  importId: string | null
  imported: number
  duplicates: number
  skipped: number
  errors: RowError[]
  stopped: boolean
}

const SELECT =
  "h-10 w-full min-w-0 cursor-pointer appearance-none truncate rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-9 md:text-[13px]"

function fieldLabel(f: FieldId): string {
  switch (f) {
    case "product_handle":
      return tt("Product handle")
    case "product_url":
      return tt("Product link")
    case "product_sku":
      return tt("SKU")
    case "product_id":
      return tt("Product ID")
    case "product_title":
      return tt("Product name")
    case "rating":
      return tt("Rating")
    case "body":
      return tt("Review text")
    case "title":
      return tt("Title")
    case "author":
      return tt("Name")
    case "email":
      return tt("Email")
    case "date":
      return tt("Date")
    case "verified":
      return tt("Verified purchase")
    case "photos":
      return tt("Photos")
    case "videos":
      return tt("Videos")
    case "reply":
      return tt("Reply")
    case "reply_date":
      return tt("Reply date")
    case "status":
      return tt("Status")
    case "external_id":
      return tt("Review ID")
    case "parent_id":
      return tt("Reply to")
  }
}

function rowError(e: string): string {
  switch (e) {
    case ROW_ERRORS.rating:
      return tt("No rating from 1 to 5")
    case ROW_ERRORS.words:
      return tt("No review text")
    case ROW_ERRORS.product:
      return tt("Product not found in your store")
    default:
      return tt("Not saved. Try again.")
  }
}

const appName = (id: string) => (id === "other" ? tt("Other") : platformLabel(id))

const shortDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
}

async function api(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: init?.method ?? "GET", headers: init?.body ? { "Content-Type": "application/json" } : undefined, body: init?.body ? JSON.stringify(init.body) : undefined }).catch(() => null)
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {}
  return { ok: !!res?.ok, data }
}

export function ImportDialog({ onClose, onDone, onUndone }: { onClose: () => void; onDone: (n: number) => void; onUndone: () => void }) {
  const [step, setStep] = useState<Step>("file")
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(true)
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [history, setHistory] = useState<ImportRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState("")
  const [table, setTable] = useState<ImportTable | null>(null)
  const [platform, setPlatform] = useState<PlatformId>("other")
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [assign, setAssign] = useState<Assignments>({})
  /* The file's unmatched groups as they were before any was answered: the products step lists them all. */
  const [groups, setGroups] = useState<UnmatchedGroup[]>([])
  const [copyPhotos, setCopyPhotos] = useState(true)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<Result | null>(null)
  const [undoing, setUndoing] = useState<ImportRecord | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const running = step === "run"

  useEffect(() => {
    let live = true
    void api("/api/app/reviews/import").then(({ ok, data }) => {
      if (!live) return
      setLoading(false)
      if (!ok) return setError(typeof data.error === "string" ? data.error : tt("That did not load. Try again."))
      setProducts((data.products as CatalogProduct[]) ?? [])
      setHistory((data.imports as ImportRecord[]) ?? [])
      setReady(data.ready !== false)
    })
    return () => {
      live = false
    }
  }, [])

  const choose = async (file: File) => {
    setError(null)
    if (file.size > MAX_IMPORT_FILE_BYTES) return setError(tt("That file is over 25 MB. Split it and import the parts."))
    const text = await file.text().catch(() => "")
    const read = readImportFile(text, file.name)
    if (!read || !read.headers.length || !read.rows.length) return setError(tt("Nothing in that file reads as reviews."))
    const found = detectPlatform(read.headers).platform
    setFileName(file.name)
    setTable(read)
    setPlatform(found)
    setMapping(autoMapping(read.headers, found))
    setAssign({})
    setGroups([])
    setStep("map")
  }

  const plan: ImportPlan | null = useMemo(() => (table && mapping ? planReviews(table, mapping, { platform, products, assign }) : null), [table, mapping, platform, products, assign])
  const preview: ImportPlan | null = useMemo(() => (table && mapping ? planReviews({ rows: table.rows.slice(0, 40) }, mapping, { platform, products }) : null), [table, mapping, platform, products])
  const missing = mapping ? missingFields(mapping) : []
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const toProducts = () => {
    if (!plan || !table || !mapping) return
    /* The groups as the mapping makes them now, answered or not; each starts as skipped until the creator picks a product. */
    const fresh = planReviews(table, mapping, { platform, products }).unmatched
    if (!fresh.length) return void run(plan)
    const next: Assignments = {}
    for (const g of fresh) next[g.key] = assign[g.key] ?? "skip"
    setGroups(fresh)
    setAssign(next)
    setStep("products")
  }

  const run = async (p: ImportPlan) => {
    setStep("run")
    setError(null)
    const rows = p.rows
    const total = rows.length
    setProgress({ done: 0, total })
    const out: Result = { importId: null, imported: 0, duplicates: p.duplicates, skipped: p.skipped, errors: [...p.errors], stopped: false }
    const started = await api("/api/app/reviews/import", { method: "POST", body: { action: "start", platform, fileName, totalRows: (table?.rows.length ?? total) } })
    if (!started.ok) {
      setError(typeof started.data.error === "string" ? started.data.error : tt("The import stopped. Import the file again: what is already here is skipped."))
      setStep("map")
      return
    }
    out.importId = typeof started.data.importId === "string" ? started.data.importId : null
    const photosOn = copyPhotos && mapping !== null && mapping.photos >= 0
    let skippedSent = false
    /* What the browser already set aside, counted on the import's row with the first chunk: skipped groups, rows twice in the file, rows it could not read. */
    const first = { skipped: p.skipped, duplicates: p.duplicates, planErrors: p.errors.slice(0, 50), planErrorCount: p.errors.length }
    for (let i = 0; i < total; ) {
      const size = photosOn && rows.slice(i, i + IMPORT_CHUNK_ROWS).some((r) => r.photos.length) ? IMPORT_CHUNK_ROWS_WITH_PHOTOS : IMPORT_CHUNK_ROWS
      const chunk = rows.slice(i, i + size)
      const res = await api("/api/app/reviews/import", { method: "POST", body: { action: "rows", importId: out.importId, rows: chunk, copyPhotos: photosOn, ...(skippedSent ? {} : first) } })
      if (!res.ok) {
        out.stopped = true
        break
      }
      skippedSent = true
      out.imported += Number(res.data.imported) || 0
      out.duplicates += Number(res.data.duplicates) || 0
      out.errors.push(...(((res.data.errors as RowError[]) ?? []) as RowError[]))
      i += chunk.length
      setProgress({ done: i, total })
    }
    if (!skippedSent && out.importId && !out.stopped) await api("/api/app/reviews/import", { method: "POST", body: { action: "rows", importId: out.importId, rows: [], ...first } })
    const finished = await api("/api/app/reviews/import", { method: "POST", body: { action: "finish", importId: out.importId, productIds: [...new Set(rows.map((r) => r.productId))] } })
    const record = finished.data.import as ImportRecord | null | undefined
    if (record) setHistory((h) => [record, ...h.filter((x) => x.id !== record.id)])
    else if (out.importId) setHistory((h) => [{ id: out.importId!, file_name: fileName, imported: out.imported, skipped: 0, undone_at: null, created_at: new Date().toISOString(), platform }, ...h])
    out.errors.sort((a, b) => a.line - b.line)
    setResult(out)
    setStep("done")
    if (out.imported) onDone(out.imported)
  }

  const undo = async (record: ImportRecord): Promise<boolean> => {
    const { ok, data } = await api(`/api/app/reviews/import?id=${encodeURIComponent(record.id)}`, { method: "DELETE" })
    if (!ok) {
      setError(typeof data.error === "string" ? data.error : tt("That did not save."))
      return false
    }
    setHistory((h) => h.map((x) => (x.id === record.id ? { ...x, undone_at: new Date().toISOString(), undone_count: Number(data.removed) || 0 } : x)))
    onUndone()
    return true
  }

  const close = () => {
    if (!running) onClose()
  }

  const footer = (
        <>
          {step === "file" ? (
            <>
              <button type="button" onClick={close} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
                {tt("Cancel")}
              </button>
              <button type="button" disabled={loading} onClick={() => fileRef.current?.click()} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")} data-import-choose="">
                {tt("Choose file")}
              </button>
            </>
          ) : step === "map" ? (
            <>
              <button type="button" onClick={() => setStep("file")} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
                {tt("Back")}
              </button>
              <button type="button" disabled={missing.length > 0 || !plan} onClick={toProducts} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")} data-import-continue="">
                {plan && !plan.unmatched.length && !groups.length ? tt("Import {n, plural, one {# review} other {# reviews}}", { n: plan.rows.length }) : tt("Continue")}
              </button>
            </>
          ) : step === "products" && plan ? (
            <>
              <button type="button" onClick={() => setStep("map")} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
                {tt("Back")}
              </button>
              <button type="button" disabled={plan.unmatched.length > 0 || plan.rows.length === 0} onClick={() => void run(plan)} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")} data-import-run="">
                {tt("Import {n, plural, one {# review} other {# reviews}}", { n: plan.rows.length })}
              </button>
            </>
          ) : step === "run" ? (
            <button type="button" disabled className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {tt("Importing")}
            </button>
          ) : (
            <>
              {result?.importId && result.imported > 0 && history.some((h) => h.id === result.importId && !h.undone_at) ? (
                <button type="button" onClick={() => setUndoing(history.find((h) => h.id === result.importId) ?? null)} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
                  {tt("Undo import")}
                </button>
              ) : null}
              <button type="button" onClick={onClose} className={cn(buttonPrimary, "h-11 flex-1 rounded-xl text-[15px] sm:h-9 sm:flex-none sm:px-4 sm:text-[14px]")}>
                {tt("Done")}
              </button>
            </>
          )}
        </>
  )

  return (
    <>
    <Sheet labelId="reviews-import-title" title={tt("Import reviews")} onClose={close} busy={running} wide={step !== "file"} footer={footer}>
      <div data-reviews-import-dialog="" data-import-step={step}>
          {table && step !== "file" ? (
            <p className="mb-3 truncate text-[13px] text-[#6b7280]">
              {fileName} · {tt("{n, plural, one {# row} other {# rows}}", { n: table.rows.length })}
            </p>
          ) : null}
          {error ? <p className="mb-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{error}</p> : null}
          {table?.truncated && step === "map" ? <p className="mb-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Only the first {n} rows are read. Import the rest as a second file.", { n: MAX_IMPORT_FILE_ROWS.toLocaleString(appLocale()) })}</p> : null}

          {step === "file" ? (
            <FileStep loading={loading} ready={ready} history={history} onChoose={() => fileRef.current?.click()} onUndo={setUndoing} />
          ) : step === "map" && table && mapping ? (
            <MapStep
              table={table}
              platform={platform}
              mapping={mapping}
              preview={preview}
              byId={byId}
              copyPhotos={copyPhotos}
              onCopyPhotos={setCopyPhotos}
              onPlatform={(p) => {
                setPlatform(p)
                setMapping(autoMapping(table.headers, p))
              }}
              onField={(f, col) => setMapping({ ...mapping, [f]: col })}
            />
          ) : step === "products" && plan ? (
            <ProductsStep groups={groups} products={products} assign={assign} onAssign={(key, v) => setAssign({ ...assign, [key]: v })} />
          ) : step === "run" ? (
            <div className="py-8" data-import-progress="">
              <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("Importing {done} of {total}", { done: progress.done, total: progress.total })}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eef0f2]">
                <div className="h-full rounded-full bg-[#1a1a2e] transition-[width] duration-200" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          ) : step === "done" && result ? (
            <ResultStep result={result} />
          ) : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.json,.jsonl,.xml,text/csv,application/json,text/xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) void choose(f)
          }}
        />

      </div>
    </Sheet>
      {undoing ? <UndoDialog record={undoing} onClose={() => setUndoing(null)} onUndo={() => undo(undoing)} /> : null}
    </>
  )
}

function FileStep({ loading, ready, history, onChoose, onUndo }: { loading: boolean; ready: boolean; history: ImportRecord[]; onChoose: () => void; onUndo: (r: ImportRecord) => void }) {
  return (
    <div>
      <button
        type="button"
        onClick={onChoose}
        disabled={loading}
        className="flex w-full cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#d6d9de] bg-[#fafbfb] px-4 py-8 text-center transition-colors hover:bg-[#f4f5f7]"
        data-import-drop=""
      >
        <span className="text-[15px] font-semibold text-[#1a1a2e]">{tt("Choose file")}</span>
        <span className="mt-1 max-w-[520px] text-[13px] leading-relaxed text-[#6b7280]">
          {tt("An export from Judge.me, Yotpo, Loox, Stamped.io, Okendo, Reviews.io, Trustpilot, Google, Etsy, Amazon, WooCommerce, Fera, Ali Reviews or Rivyo, or any CSV or JSON file.")}
        </span>
      </button>
      <p className="mt-3 rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[13px] leading-[19px] text-[#4b5563]" data-import-trust="">
        {tt("Imported reviews are marked Imported. They can show on your website, but they never get the Verified purchase label and never count in your Storelib rating.")}
      </p>
      {!ready ? <p className="mt-3 rounded-xl bg-[#fff8e6] px-3.5 py-2.5 text-[13px] text-[#5c4300]">{tt("Undo and import history turn on after the database update (SQL part 215).")}</p> : null}
      {history.length ? (
        <section className="mt-5" aria-labelledby="import-history">
          <h4 id="import-history" className="text-[13px] font-semibold text-[#1a1a2e]">
            {tt("Past imports")}
          </h4>
          <ul className="mt-2 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]" data-import-history="">
            {history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-3.5 py-2.5" data-import-row={h.undone_at ? "undone" : "done"}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#1a1a2e]">
                    {h.platform ? appName(h.platform) : h.file_name || tt("CSV import")}
                    {h.platform && h.file_name ? <span className="font-normal text-[#6b7280]"> · {h.file_name}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#6b7280]">
                    {shortDate(h.created_at)} ·{" "}
                    {h.undone_at
                      ? tt("Undone, {n} removed", { n: h.undone_count ?? h.imported })
                      : typeof h.duplicates === "number"
                        ? tt("{imported} imported, {duplicates} already here, {skipped} skipped, {errors} with errors", { imported: h.imported, duplicates: h.duplicates, skipped: Math.max(0, h.skipped - h.duplicates - (h.errors ?? 0)), errors: h.errors ?? 0 })
                        : tt("{n} imported", { n: h.imported })}
                  </p>
                </div>
                {!h.undone_at && h.imported > 0 ? (
                  <button type="button" onClick={() => onUndo(h)} className={cn(buttonSecondary, "max-md:h-10 max-md:px-3.5 max-md:text-[14px]")} data-import-undo="">
                    {tt("Undo")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MapStep({
  table,
  platform,
  mapping,
  preview,
  byId,
  copyPhotos,
  onCopyPhotos,
  onPlatform,
  onField,
}: {
  table: ImportTable
  platform: PlatformId
  mapping: ImportMapping
  preview: ImportPlan | null
  byId: Map<string, CatalogProduct>
  copyPhotos: boolean
  onCopyPhotos: (v: boolean) => void
  onPlatform: (p: PlatformId) => void
  onField: (f: FieldId, col: number) => void
}) {
  const missing = missingFields(mapping)
  const rows = preview?.rows.slice(0, 5) ?? []
  return (
    <div data-import-map="">
      <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-[13px] font-semibold text-[#1a1a2e] sm:w-[140px]">{tt("Read as")}</span>
        <span className="relative sm:w-[280px]">
          <select value={platform} onChange={(e) => onPlatform(e.target.value as PlatformId)} className={SELECT} data-import-platform="">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {appName(p.id)}
              </option>
            ))}
          </select>
          <Chevron />
        </span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2" data-import-fields="">
        {FIELDS.map((f) => (
          <label key={f} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-3">
            <span className={cn("truncate text-[13px]", missing.includes(f) ? "font-semibold text-[#b42318]" : "text-[#374151]")}>{fieldLabel(f)}</span>
            <span className="relative">
              <select value={mapping[f]} onChange={(e) => onField(f, Number(e.target.value))} className={SELECT} data-import-field={f}>
                <option value={-1}>{tt("Not in file")}</option>
                {table.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `#${i + 1}`}
                  </option>
                ))}
              </select>
              <Chevron />
            </span>
          </label>
        ))}
      </div>

      {missing.length ? <p className="mt-3 text-[13px] text-[#b42318]">{tt("Choose a column for the rating and one for the review.")}</p> : null}

      {mapping.photos >= 0 ? (
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[14px] text-[#1a1a2e]">
          <input type="checkbox" checked={copyPhotos} onChange={(e) => onCopyPhotos(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" data-import-copy-photos="" />
          {tt("Copy photos into Storelib")}
        </label>
      ) : null}

      <h4 className="mt-5 text-[13px] font-semibold text-[#1a1a2e]">{tt("Preview")}</h4>
      <div className="mt-2 overflow-x-auto rounded-xl border border-[#eef0f2]" data-import-preview="">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="bg-[#fafbfb] text-[12px] text-[#6b7280]">
            <tr>
              <th className="px-3 py-2 font-medium">{tt("Product")}</th>
              <th className="px-3 py-2 font-medium">{tt("Rating")}</th>
              <th className="px-3 py-2 font-medium">{tt("Review text")}</th>
              <th className="px-3 py-2 font-medium">{tt("Name")}</th>
              <th className="px-3 py-2 font-medium">{tt("Date")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f2f4] text-[#374151]">
            {rows.map((r) => (
              <tr key={r.line}>
                <td className="max-w-[160px] truncate px-3 py-2">{byId.get(r.productId)?.title ?? ""}</td>
                <td className="px-3 py-2">
                  <Stars rating={r.rating} size={12} />
                </td>
                <td className="max-w-[240px] truncate px-3 py-2">{r.title ? `${r.title}. ${r.body}` : r.body}</td>
                <td className="max-w-[120px] truncate px-3 py-2">{r.author ?? ""}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.date ? shortDate(r.date) : ""}</td>
              </tr>
            ))}
            {(preview?.unmatched ?? []).slice(0, Math.max(0, 5 - rows.length)).map((g) => (
              <tr key={g.key}>
                <td className="max-w-[160px] truncate px-3 py-2 text-[#b42318]">{tt("No match")}</td>
                <td className="px-3 py-2 text-[#6b7280]" colSpan={4}>
                  {g.label || tt("No product in the file")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ProductsStep({ groups, products, assign, onAssign }: { groups: UnmatchedGroup[]; products: CatalogProduct[]; assign: Assignments; onAssign: (key: string, value: string) => void }) {
  const waiting = groups.reduce((n, g) => n + g.count, 0)
  return (
    <div data-import-products="">
      <p className="text-[14px] text-[#374151]">{tt("{n, plural, one {# review names a product that isn't in your store.} other {# reviews name a product that isn't in your store.}}", { n: waiting })}</p>
      <ul className="mt-3 divide-y divide-[#f1f2f4] rounded-xl border border-[#eef0f2]">
        {groups.slice(0, 200).map((g) => (
          <li key={g.key} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-[#1a1a2e]">{g.key === NO_PRODUCT_KEY ? tt("No product in the file") : g.label}</p>
              <p className="text-[12px] text-[#6b7280]">{tt("{n, plural, one {# review} other {# reviews}}", { n: g.count })}</p>
            </div>
            <span className="relative sm:w-[260px]">
              <select value={assign[g.key] ?? "skip"} onChange={(e) => onAssign(g.key, e.target.value)} className={SELECT} data-import-assign="">
                <option value="skip">{tt("Skip")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || p.slug || p.id}
                  </option>
                ))}
              </select>
              <Chevron />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultStep({ result }: { result: Result }) {
  const counts = [
    { label: tt("Imported"), value: result.imported },
    { label: tt("Already here"), value: result.duplicates },
    { label: tt("Skipped"), value: result.skipped },
    { label: tt("Errors"), value: result.errors.length },
  ]
  return (
    <div data-import-result="">
      {result.stopped ? <p className="mb-3 rounded-xl bg-[#fef3f2] px-3.5 py-2.5 text-[14px] text-[#b42318]">{tt("The import stopped. Import the file again: what is already here is skipped.")}</p> : null}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#eef0f2] bg-[#eef0f2] sm:grid-cols-4">
        {counts.map((c) => (
          <div key={c.label} className="bg-white px-3.5 py-3">
            <dt className="text-[12px] text-[#6b7280]">{c.label}</dt>
            <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-[#1a1a2e]">{c.value.toLocaleString(appLocale())}</dd>
          </div>
        ))}
      </dl>
      {result.errors.length ? (
        <ul className="mt-4 max-h-[240px] overflow-y-auto rounded-xl border border-[#eef0f2] text-[13px] text-[#374151]" data-import-errors="">
          {result.errors.slice(0, 200).map((e, i) => (
            <li key={`${e.line}-${i}`} className="border-b border-[#f1f2f4] px-3.5 py-2 last:border-0">
              {tt("Row {line}: {error}", { line: e.line, error: rowError(e.error) })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function UndoDialog({ record, onClose, onUndo }: { record: ImportRecord; onClose: () => void; onUndo: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="undo-title">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative w-full rounded-t-2xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-md sm:rounded-2xl sm:pb-5">
        <h3 id="undo-title" className="text-[17px] font-semibold text-[#1a1a2e]">
          {tt("Undo this import?")}
        </h3>
        <p className="mt-1 text-[14px] text-[#6b7280]">{tt("The {n} reviews it added are deleted, with their photos. Reviews that were already here stay.", { n: record.imported })}</p>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={cn(buttonSecondary, "h-11 flex-1 rounded-xl text-[15px] sm:h-10 sm:text-[14px]")}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const ok = await onUndo()
              setBusy(false)
              if (ok) onClose()
            }}
            className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#c4290c] text-[15px] font-medium text-white transition-colors hover:bg-[#a82309] disabled:cursor-default disabled:opacity-50 sm:h-10 sm:text-[14px]"
            data-import-undo-confirm=""
          >
            {busy ? tt("Deleting") : tt("Undo import")}
          </button>
        </div>
      </div>
    </div>
  )
}
