"use client"

/**
 * ===========================================================================
 *  ONE SIZE CHART, EDITED AS A TABLE
 * ===========================================================================
 * Opened from the product editor's Size chart card (./size-chart-card.tsx)
 * and from Products › Size charts (app/app/products/size-charts): a dialog
 * on a computer, the app's bottom sheet on a phone (./ui.tsx Modal).
 *
 * The chart is typed the way it is printed: a row per size, a column per
 * measurement. Column names are typed in the header; under each, the ruler
 * says whether it is a measurement (converted when a buyer switches between
 * cm and in) or a label like "EU size", and the cross takes the column out.
 * A row is taken out by the cross at its end. The first column is the size
 * and stays in place while the rest scroll sideways on a narrow screen.
 *
 * A new chart starts from a kind of garment (lib/size-charts/model.ts
 * sizeChartTemplate): its columns and sizes, with every number left for the
 * seller, since only their own garments can say them.
 *
 * Saving writes the chart to the store at once (POST or PUT /api/size-charts):
 * a chart is the store's, used by every product given it, not part of the
 * product being edited.
 */

import * as React from "react"
import { ImagePlus, Plus, Ruler, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SIZE_CHART_LIMITS, SIZE_CHART_TEMPLATES, sizeChartTemplate, type SizeChart, type SizeChartTemplate, type SizeUnit } from "@/lib/size-charts/model"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, FIELD, FIELD_COMPACT, Field, Modal, Notice, TextInput, api } from "./ui"
import { tt } from "@/lib/i18n/text"

export interface SavedSizeChart extends SizeChart {
  id: string
  productCount: number
  updatedAt?: string | null
  /** Round 13: the store's collections it also shows on, by id. */
  collectionIds?: string[]
  /** And the categories it also shows on. */
  categories?: string[]
}

/** What a chart can also be set for (GET /api/size-charts `targets`). */
export interface SizeChartTargets {
  collections: { id: string; title: string }[]
  categories: string[]
}

interface Column {
  key: string
  name: string
  measure: boolean
}
interface Row {
  key: string
  cells: string[]
}
interface Draft {
  name: string
  unit: SizeUnit
  columns: Column[]
  rows: Row[]
  notes: string
  imageUrl: string | null
  collectionIds: string[]
  categories: string[]
}

let seq = 0
const key = () => `k${++seq}`

function draftOf(chart: Omit<SizeChart, "id"> & { collectionIds?: string[]; categories?: string[] }): Draft {
  return {
    collectionIds: [...(chart.collectionIds ?? [])],
    categories: [...(chart.categories ?? [])],
    name: chart.name,
    unit: chart.unit,
    columns: chart.columns.map((c) => ({ key: key(), name: c.name, measure: c.measure })),
    rows: chart.rows.map((cells) => ({ key: key(), cells: [...cells] })),
    notes: chart.notes,
    imageUrl: chart.imageUrl,
  }
}

const TEMPLATE_LABEL: Record<SizeChartTemplate, () => string> = {
  tops: () => tt("Tops"),
  bottoms: () => tt("Bottoms"),
  dresses: () => tt("Dresses"),
  shoes: () => tt("Shoes"),
  blank: () => tt("Blank"),
}

/** What must be fixed before the chart can be saved, in the seller's words; null when it can. */
export function draftProblem(d: Pick<Draft, "name" | "columns" | "rows">): string | null {
  if (!d.name.trim()) return tt("Give the chart a name.")
  if (!d.columns.length) return tt("Add a column.")
  if (d.columns.some((c) => !c.name.trim())) return tt("Name every column.")
  const filled = d.rows.filter((r) => r.cells.some((c) => c.trim()))
  if (!filled.length) return tt("Add at least one size to the chart.")
  if (filled.some((r) => !(r.cells[0] ?? "").trim())) return tt("Fill in the {name} column for every row.", { name: d.columns[0].name.trim() })
  return null
}

/** The draft as the server takes it: rows as long as the columns, empty rows left out. */
function bodyOf(d: Draft, rules: boolean) {
  return {
    /* Only once part 309 has run: before it the server would refuse a list it cannot keep. */
    ...(rules ? { collectionIds: d.collectionIds, categories: d.categories } : {}),
    name: d.name.trim(),
    unit: d.unit,
    columns: d.columns.map((c, i) => ({ name: c.name.trim(), measure: i === 0 ? false : c.measure })),
    rows: d.rows.map((r) => d.columns.map((_, i) => (r.cells[i] ?? "").trim())).filter((cells) => cells.some(Boolean)),
    notes: d.notes.trim(),
    imageUrl: d.imageUrl,
  }
}

export function SizeChartEditor({
  open,
  chart,
  onClose,
  onSaved,
  onDelete,
  uploadImage,
  targets,
  rules = false,
}: {
  open: boolean
  /** The chart to edit, or null for a new one. */
  chart: SavedSizeChart | null
  onClose: () => void
  onSaved: (saved: { id: string; charts: SavedSizeChart[] }) => void
  /** Deleting is offered where the store's charts are managed (Products › Size charts); the product editor only edits. */
  onDelete?: (chart: SavedSizeChart) => Promise<string | null>
  uploadImage?: (file: File) => Promise<string>
  /** The store's collections and categories, for "Also show it on"; absent where the store's list was not read. */
  targets?: SizeChartTargets
  /** Whether SQL part 309 has run, so a chart can be set for collections and categories. */
  rules?: boolean
}) {
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(chart ?? sizeChartTemplate("tops", tt)))
  const [template, setTemplate] = React.useState<SizeChartTemplate | null>(chart ? null : "tops")
  const [touched, setTouched] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const tableRef = React.useRef<HTMLDivElement>(null)

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d))
    setTouched(true)
    setError(null)
  }
  const setCell = (r: number, c: number, v: string) =>
    edit((d) => ({ ...d, rows: d.rows.map((row, i) => (i === r ? { ...row, cells: d.columns.map((_, j) => (j === c ? v.slice(0, SIZE_CHART_LIMITS.cell) : row.cells[j] ?? "")) } : row)) }))
  const setColumn = (c: number, patch: Partial<Column>) => edit((d) => ({ ...d, columns: d.columns.map((col, i) => (i === c ? { ...col, ...patch } : col)) }))
  const addColumn = () => {
    if (draft.columns.length >= SIZE_CHART_LIMITS.columns) return
    edit((d) => ({ ...d, columns: [...d.columns, { key: key(), name: "", measure: true }], rows: d.rows.map((r) => ({ ...r, cells: [...r.cells, ""] })) }))
    /* The new column's name is typed next: it is brought into view and focused. */
    requestAnimationFrame(() => {
      const inputs = tableRef.current?.querySelectorAll<HTMLInputElement>("[data-column-name]")
      const last = inputs?.[inputs.length - 1]
      last?.focus()
      last?.scrollIntoView({ block: "nearest", inline: "nearest" })
    })
  }
  const removeColumn = (c: number) => edit((d) => ({ ...d, columns: d.columns.filter((_, i) => i !== c), rows: d.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== c) })) }))
  const addRow = () => {
    if (draft.rows.length >= SIZE_CHART_LIMITS.rows) return
    edit((d) => ({ ...d, rows: [...d.rows, { key: key(), cells: d.columns.map(() => "") }] }))
    requestAnimationFrame(() => {
      const firsts = tableRef.current?.querySelectorAll<HTMLInputElement>("[data-row-size]")
      firsts?.[firsts.length - 1]?.focus()
    })
  }
  const removeRow = (r: number) => edit((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== r) }))
  const pickTemplate = (t: SizeChartTemplate) => {
    setTemplate(t)
    setDraft(draftOf(sizeChartTemplate(t, tt)))
    setError(null)
  }

  const save = async () => {
    const problem = draftProblem(draft)
    if (problem) return setError(problem)
    setBusy(true)
    const res = await api<{ id: string; charts: SavedSizeChart[]; ready?: boolean }>(chart ? `/api/size-charts/${chart.id}` : "/api/size-charts", { method: chart ? "PUT" : "POST", body: bodyOf(draft, rules) })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onSaved({ id: res.data.id, charts: res.data.charts ?? [] })
  }

  const remove = async () => {
    if (!chart || !onDelete) return
    setBusy(true)
    const problem = await onDelete(chart)
    setBusy(false)
    if (problem) {
      setConfirmDelete(false)
      setError(problem)
    }
  }

  const pickImage = async (file: File | undefined) => {
    if (!file || !uploadImage) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      edit((d) => ({ ...d, imageUrl: url }))
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : tt("That picture did not upload. Try again."))
    } finally {
      setUploading(false)
    }
  }

  const footer = confirmDelete && chart ? (
    <>
      <p className="mr-auto self-center text-[13px] leading-[18px] text-[#b42318]">
        {chart.productCount > 0 ? tt("{n, plural, one {# product loses this chart.} other {# products lose this chart.}}", { n: chart.productCount }) : tt("No product uses this chart.")}
      </p>
      <button type="button" className={BTN_SECONDARY} onClick={() => setConfirmDelete(false)} disabled={busy}>
        {tt("Keep it")}
      </button>
      <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9b1c13]")} onClick={remove} disabled={busy} data-size-chart-delete-confirm="">
        {tt("Delete chart")}
      </button>
    </>
  ) : (
    <>
      {chart && onDelete ? (
        <button type="button" className={cn(BTN_GHOST, "mr-auto text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")} onClick={() => setConfirmDelete(true)} disabled={busy} data-size-chart-delete="">
          <Trash2 className="h-4 w-4" aria-hidden />
          {tt("Delete")}
        </button>
      ) : null}
      <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
        {tt("Cancel")}
      </button>
      <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || uploading} data-size-chart-save="">
        {busy ? tt("Saving") : chart ? tt("Save chart") : tt("Create chart")}
      </button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={chart ? tt("Edit size chart") : tt("New size chart")} footer={footer} wide>
      <div className="space-y-5" data-size-chart-editor="">
        {!chart && !touched ? (
          <div>
            <p className="mb-2 text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Start from")}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tt("Start from")}>
              {SIZE_CHART_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={template === t}
                  onClick={() => pickTemplate(t)}
                  className={cn("h-9 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors", template === t ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f7f7f8]")}
                >
                  {TEMPLATE_LABEL[t]()}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={tt("Name")} hint={tt("Buyers see it as the title of the chart.")}>
            <TextInput value={draft.name} maxLength={SIZE_CHART_LIMITS.name} onChange={(e) => edit((d) => ({ ...d, name: e.target.value }))} placeholder={tt("Tees, Jeans, Running shoes")} data-size-chart-name="" />
          </Field>
          <Field label={tt("Measured in")}>
            <div role="radiogroup" aria-label={tt("Measured in")} className="inline-flex h-11 rounded-lg bg-[#f1f2f4] p-1 sm:h-10">
              {(["cm", "in"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={draft.unit === u}
                  onClick={() => edit((d) => ({ ...d, unit: u }))}
                  className={cn("min-w-[56px] rounded-md px-3 text-[14px] font-medium transition-colors", draft.unit === u ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6b7280]")}
                  data-size-unit={u}
                >
                  {u}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Table")}</p>
              <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Buyers can switch between cm and in. Columns with the ruler on are converted.")}</p>
            </div>
            <button type="button" className={cn(BTN_GHOST, "shrink-0")} onClick={addColumn} disabled={draft.columns.length >= SIZE_CHART_LIMITS.columns} data-size-chart-add-column="">
              <Plus className="h-4 w-4" aria-hidden />
              {tt("Column")}
            </button>
          </div>
          <div ref={tableRef} className="overflow-x-auto rounded-xl border border-[#eceef1] [-webkit-overflow-scrolling:touch]" data-size-chart-grid="">
            <table className="w-full border-separate border-spacing-0 text-[14px]">
              <thead>
                <tr>
                  {draft.columns.map((col, c) => (
                    <th key={col.key} scope="col" className={cn("border-b border-[#eceef1] bg-[#f8f9fa] p-1.5 text-left align-top font-normal", c === 0 && "sticky left-0 z-[2] border-r")}>
                      <input
                        value={col.name}
                        maxLength={SIZE_CHART_LIMITS.cell}
                        onChange={(e) => setColumn(c, { name: e.target.value })}
                        placeholder={c === 0 ? tt("Size") : tt("Chest")}
                        aria-label={tt("Column {n} name", { n: c + 1 })}
                        className={cn(FIELD_COMPACT, "w-full min-w-[96px] font-medium sm:min-w-[104px]")}
                        data-column-name=""
                      />
                      {c > 0 ? (
                        <div className="mt-1 flex items-center gap-0.5">
                          <button
                            type="button"
                            aria-pressed={col.measure}
                            onClick={() => setColumn(c, { measure: !col.measure })}
                            title={col.measure ? tt("A measurement, converted between cm and in") : tt("A label, never converted")}
                            className={cn("inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors", col.measure ? "text-[#1a1a2e] hover:bg-[#eceef1]" : "text-[#9ca3af] hover:bg-[#eceef1]")}
                            data-column-measure={col.measure ? "on" : "off"}
                          >
                            <Ruler className="h-3.5 w-3.5" aria-hidden />
                            {col.measure ? draft.unit : tt("Label")}
                          </button>
                          <button type="button" onClick={() => removeColumn(c)} aria-label={tt("Remove column {name}", { name: col.name || String(c + 1) })} className="ml-auto grid h-7 w-7 place-items-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#eceef1] hover:text-[#1a1a2e]">
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      ) : (
                        /* The size column is never converted: no ruler, only the row's height so the names line up. */
                        <div aria-hidden className="mt-1 h-7" />
                      )}
                    </th>
                  ))}
                  <th aria-hidden className="w-10 border-b border-[#eceef1] bg-[#f8f9fa]" />
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, r) => (
                  <tr key={row.key}>
                    {draft.columns.map((col, c) => (
                      <td key={col.key} className={cn("border-b border-[#f1f2f4] bg-white p-1.5", c === 0 && "sticky left-0 z-[1] border-r border-r-[#eceef1]")}>
                        <input
                          value={row.cells[c] ?? ""}
                          maxLength={SIZE_CHART_LIMITS.cell}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          inputMode={col.measure && c > 0 ? "decimal" : undefined}
                          placeholder={c === 0 ? "M" : col.measure ? "0" : ""}
                          aria-label={tt("{column}, row {n}", { column: col.name || tt("Column {n}", { n: c + 1 }), n: r + 1 })}
                          className={cn(FIELD_COMPACT, "w-full min-w-[96px] tabular-nums sm:min-w-[104px]", c === 0 && "font-medium")}
                          {...(c === 0 ? { "data-row-size": "" } : {})}
                        />
                      </td>
                    ))}
                    <td className="border-b border-[#f1f2f4] bg-white pr-1.5">
                      <button type="button" onClick={() => removeRow(r)} aria-label={tt("Remove size {name}", { name: row.cells[0] || String(r + 1) })} className="grid h-9 w-9 place-items-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className={cn(BTN_GHOST, "mt-2 -ml-2")} onClick={addRow} disabled={draft.rows.length >= SIZE_CHART_LIMITS.rows} data-size-chart-add-row="">
            <Plus className="h-4 w-4" aria-hidden />
            {tt("Add size")}
          </button>
        </div>

        {targets ? <AlsoShowOn draft={draft} targets={targets} rules={rules} onChange={(patch) => edit((d) => ({ ...d, ...patch }))} /> : null}

        <Field label={tt("Note under the table")} hint={tt("Optional. How to measure, or how it fits.")}>
          <textarea
            value={draft.notes}
            maxLength={SIZE_CHART_LIMITS.notes}
            onChange={(e) => edit((d) => ({ ...d, notes: e.target.value }))}
            rows={2}
            placeholder={tt("Measured flat. Runs small, so size up if you are between sizes.")}
            className={cn(FIELD, "h-auto min-h-[72px] py-2.5 leading-5")}
          />
        </Field>

        {uploadImage ? (
          <Field label={tt("Picture")} hint={tt("Optional. Where to measure, shown above the table.")}>
            {draft.imageUrl ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.imageUrl} alt="" className="h-16 w-16 rounded-lg border border-[#eceef1] object-contain" />
                <button type="button" className={BTN_GHOST} onClick={() => edit((d) => ({ ...d, imageUrl: null }))}>
                  {tt("Remove")}
                </button>
              </div>
            ) : (
              <>
                <button type="button" className={BTN_SECONDARY} onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {uploading ? tt("Uploading") : tt("Add picture")}
                </button>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = "" }} />
              </>
            )}
          </Field>
        ) : null}

        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

/**
 * ROUND 13: ALSO SHOW IT ON. A chart can be set for whole collections and
 * categories, so a shop with fifty tees sets "Tees" once. A product's own
 * chart still comes first (lib/size-charts/storefront.ts). Chips, one tap
 * each, the way the store's tags are picked.
 */
function AlsoShowOn({ draft, targets, rules, onChange }: { draft: Draft; targets: SizeChartTargets; rules: boolean; onChange: (patch: Partial<Pick<Draft, "collectionIds" | "categories">>) => void }) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 max-w-full items-center truncate rounded-full border px-3.5 text-[13.5px] font-medium transition-colors [-webkit-tap-highlight-color:transparent]",
      on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#1a1a2e] [@media(hover:hover)]:hover:bg-[#f7f7f8]",
    )
  /* A category saved on the chart that no product has now is still listed, so it can be taken off. */
  const categories = [...targets.categories, ...draft.categories.filter((c) => !targets.categories.some((t) => t.toLowerCase() === c.toLowerCase()))]
  const none = !targets.collections.length && !categories.length
  return (
    <div data-size-chart-also="">
      <p className="text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Also show it on")}</p>
      <p className="mb-2 text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Every product in these collections or categories gets this chart. A chart picked on the product comes first.")}</p>
      {!rules ? (
        <Notice tone="gray">{tt("This needs a database update (SQL part 309). Until then, pick the chart on each product.")}</Notice>
      ) : none ? (
        <p className="text-[13px] leading-5 text-[#6b7280]">{tt("No collections or categories yet. Add one in Products, then come back.")}</p>
      ) : (
        <div className="space-y-3">
          {targets.collections.length ? (
            <div role="group" aria-label={tt("Collections")}>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Collections")}</p>
              <div className="flex flex-wrap gap-2">
                {targets.collections.map((c) => {
                  const on = draft.collectionIds.includes(c.id)
                  return (
                    <button key={c.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ collectionIds: toggle(draft.collectionIds, c.id) })} data-chart-collection={c.id}>
                      {c.title}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {categories.length ? (
            <div role="group" aria-label={tt("Categories")}>
              <p className="mb-1.5 text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Categories")}</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = draft.categories.some((x) => x.toLowerCase() === c.toLowerCase())
                  return (
                    <button key={c} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ categories: on ? draft.categories.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...draft.categories, c] })} data-chart-category={c}>
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
