"use client"

/**
 * ===========================================================================
 *  A SIZE CHART'S FIELDS, WHEREVER IT IS EDITED
 * ===========================================================================
 * The chart as a seller types it, shared by its own page (app/app/products/
 * size-charts/size-chart-page.tsx, a sub page like an order's) and the
 * product editor's dialog (./size-chart-editor.tsx), so both type the same
 * table the same way.
 *
 * The chart is typed the way it is printed: a row per size, a column per
 * measurement. Column names are typed in the header; under each, the ruler
 * says whether it is a measurement (converted when a buyer switches between
 * cm and in) or a label like "EU size", and the cross takes the column out.
 * A row is moved or taken out by the buttons at its end. The first column is
 * the size and stays in place while the rest scroll sideways on a narrow
 * screen.
 *
 * THE KEYBOARD. Tab goes along a row, as in any form. Enter and the down
 * arrow go one row down in the same column (Enter on the last row adds a
 * size), Shift and Enter and the up arrow one row up. Cells copied from a
 * spreadsheet paste as a block from the cell they land in (lib/size-charts/
 * grid.ts).
 *
 * A new chart starts from a kind of garment (lib/size-charts/model.ts
 * sizeChartTemplate): its columns and sizes, with every number left for the
 * seller, since only their own garments can say them.
 */

import * as React from "react"
import { ArrowDown, ArrowUp, ImagePlus, Plus, Ruler, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SIZE_CHART_LIMITS, SIZE_CHART_TEMPLATES, sizeChartTemplate, type SizeChart, type SizeChartTemplate, type SizeUnit } from "@/lib/size-charts/model"
import { moveRow, nextCell, pasteIntoRows, readPastedBlock, type GridKey } from "@/lib/size-charts/grid"
import { secondaryDepth } from "@/components/ui/depth-button"
import { FIELD, FIELD_COMPACT, Field, Notice, TextInput } from "./ui"
import { tt } from "@/lib/i18n/text"

export interface SizeChartTargetsLike {
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
export interface SizeChartDraft {
  name: string
  unit: SizeUnit
  columns: Column[]
  rows: Row[]
  notes: string
  imageUrl: string | null
  collectionIds: string[]
  categories: string[]
}

type ChartLike = Omit<SizeChart, "id"> & { collectionIds?: string[]; categories?: string[] }

let seq = 0
const key = () => `k${++seq}`

export function chartDraftOf(chart: ChartLike): SizeChartDraft {
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

/** A draft without its keys, to tell whether anything changed. */
const plain = (d: SizeChartDraft) => JSON.stringify({ ...d, columns: d.columns.map((c) => [c.name, c.measure]), rows: d.rows.map((r) => r.cells) })

const TEMPLATE_LABEL: Record<SizeChartTemplate, () => string> = {
  tops: () => tt("Tops"),
  bottoms: () => tt("Bottoms"),
  dresses: () => tt("Dresses"),
  shoes: () => tt("Shoes"),
  blank: () => tt("Blank"),
}

/** What must be fixed before the chart can be saved, in the seller's words; null when it can. */
export function draftProblem(d: Pick<SizeChartDraft, "name" | "columns" | "rows">): string | null {
  if (!d.name.trim()) return tt("Give the chart a name.")
  if (!d.columns.length) return tt("Add a column.")
  if (d.columns.some((c) => !c.name.trim())) return tt("Name every column.")
  const filled = d.rows.filter((r) => r.cells.some((c) => c.trim()))
  if (!filled.length) return tt("Add at least one size to the chart.")
  if (filled.some((r) => !(r.cells[0] ?? "").trim())) return tt("Fill in the {name} column for every row.", { name: d.columns[0].name.trim() })
  return null
}

/** The draft as the server takes it: rows as long as the columns, empty rows left out. */
export function chartBodyOf(d: SizeChartDraft, rules: boolean) {
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

/** The draft, its changes and the template a new one started from. */
export function useSizeChartDraft(chart: ChartLike | null) {
  const [first] = React.useState(() => chartDraftOf(chart ?? sizeChartTemplate("tops", tt)))
  const [draft, setDraft] = React.useState<SizeChartDraft>(first)
  const [saved, setSaved] = React.useState(() => plain(first))
  const [template, setTemplate] = React.useState<SizeChartTemplate | null>(chart ? null : "tops")
  const [touched, setTouched] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const edit = React.useCallback((fn: (d: SizeChartDraft) => SizeChartDraft) => {
    setDraft((d) => fn(d))
    setTouched(true)
    setError(null)
  }, [])
  const pickTemplate = (t: SizeChartTemplate) => {
    setTemplate(t)
    const next = chartDraftOf(sizeChartTemplate(t, tt))
    setDraft(next)
    /* A template is a starting point, not a change: until it is typed into, nothing would be lost. */
    setSaved(plain(next))
    setError(null)
  }
  const dirty = plain(draft) !== saved
  const markSaved = () => setSaved(plain(draft))
  return { draft, edit, template, pickTemplate, touched, dirty, markSaved, error, setError, isNew: !chart }
}

export type SizeChartDraftState = ReturnType<typeof useSizeChartDraft>

/**
 * Everything a chart is, in the order it is decided: where it starts from
 * (a new one), its name and unit, the table, what else it shows on, a note
 * and a picture. `layout="page"` lays them out as cards on a page; the
 * dialog keeps them in one column.
 */
export function SizeChartFields({
  state,
  uploadImage,
  targets,
  rules = false,
  card,
  cardTitle,
}: {
  state: SizeChartDraftState
  uploadImage?: (file: File) => Promise<string>
  targets?: SizeChartTargetsLike
  rules?: boolean
  /** A card's classes, to draw each part as its own card (the page); none keeps one column (the dialog). */
  card?: string
  cardTitle?: string
}) {
  const { draft, edit, template, pickTemplate, touched, isNew, setError } = state
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
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
  return (
    <div className={card ? "flex flex-col gap-3 sm:gap-4" : "space-y-5"} data-size-chart-editor="">
      {isNew && !touched ? (
        <FieldPart card={card} cardTitle={cardTitle} id="start" title={card ? tt("Start from") : undefined}>
          {!card ? <p className="mb-2 text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Start from")}</p> : null}
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tt("Start from")}>
            {SIZE_CHART_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={template === t}
                onClick={() => pickTemplate(t)}
                data-size-template={t}
                className={cn(
                  "h-9 cursor-pointer rounded-full border px-3.5 text-[13.5px] font-medium transition-colors [-webkit-tap-highlight-color:transparent]",
                  template === t ? "border-[#1a1a2e] bg-[#1a1a2e] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(16,24,40,0.2)]" : "border-[#d9dbe0] bg-white text-[#1a1a2e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] [@media(hover:hover)]:hover:bg-[#f7f7f8]",
                )}
              >
                {TEMPLATE_LABEL[t]()}
              </button>
            ))}
          </div>
          {card ? <p className="text-[13px] leading-5 text-[#6b7280]">{tt("Its columns and sizes, with the numbers left for you.")}</p> : null}
        </FieldPart>
      ) : null}

      <FieldPart card={card} cardTitle={cardTitle} id="name" title={card ? tt("Chart") : undefined}>
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
                  className={cn("min-w-[56px] cursor-pointer rounded-md px-3 text-[14px] font-medium transition-colors", draft.unit === u ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6b7280]")}
                  data-size-unit={u}
                >
                  {u}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </FieldPart>

      <FieldPart card={card} cardTitle={cardTitle} id="table" title={card ? tt("Table") : undefined}>
        <SizeChartTable state={state} labelled={!card} />
      </FieldPart>

      {targets ? (
        <FieldPart card={card} cardTitle={cardTitle} id="also" title={card ? tt("Also show it on") : undefined}>
          <AlsoShowOn draft={draft} targets={targets} rules={rules} titled={!card} onChange={(patch) => edit((d) => ({ ...d, ...patch }))} />
        </FieldPart>
      ) : null}

      <FieldPart card={card} cardTitle={cardTitle} id="notes" title={card ? tt("Note and picture") : undefined}>
        <div className="space-y-4">
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
                  <button type="button" className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[14px] sm:h-8 sm:text-[13px]")} onClick={() => edit((d) => ({ ...d, imageUrl: null }))}>
                    {tt("Remove")}
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className={cn(secondaryDepth, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")} onClick={() => fileRef.current?.click()} disabled={uploading}>
                    <ImagePlus className="h-4 w-4" aria-hidden />
                    {uploading ? tt("Uploading") : tt("Add picture")}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      void pickImage(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </>
              )}
            </Field>
          ) : null}
        </div>
      </FieldPart>
    </div>
  )
}

/** One part of the chart: a card of its own on the page, a plain block in the dialog. A component of its own, so typing never remounts what is in it. */
function FieldPart({ title, children, id, card, cardTitle }: { title?: string; children: React.ReactNode; id: string; card?: string; cardTitle?: string }) {
  if (!card) return <div data-size-chart-part={id}>{children}</div>
  return (
    <section className={card} aria-labelledby={title ? `${id}-title` : undefined} data-size-chart-part={id}>
      {title ? (
        <h2 id={`${id}-title`} className={cardTitle}>
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

/** A small square button in the table: a quiet icon that darkens under the pointer. */
const CELL_BUTTON = "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-[#9ca3af] outline-none transition-colors hover:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:bg-[#eceef1] focus-visible:text-[#1a1a2e] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent sm:h-7 sm:w-7"

/** The table itself: the column names on top, a row per size, the keyboard and the paste. */
function SizeChartTable({ state, labelled }: { state: SizeChartDraftState; labelled: boolean }) {
  const { draft, edit } = state
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [pasted, setPasted] = React.useState<string | null>(null)

  const focusCell = (row: number, col: number) =>
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`)
      el?.focus()
      el?.select()
    })
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
  const addRow = (focusCol = 0) => {
    if (draft.rows.length >= SIZE_CHART_LIMITS.rows) return
    const at = draft.rows.length
    edit((d) => ({ ...d, rows: [...d.rows, { key: key(), cells: d.columns.map(() => "") }] }))
    focusCell(at, focusCol)
  }
  const removeRow = (r: number) => edit((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== r) }))
  const shiftRow = (r: number, by: -1 | 1) => edit((d) => ({ ...d, rows: moveRow(d.rows, r, by) }))

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const k: GridKey | null = e.key === "Enter" ? (e.shiftKey ? "ShiftEnter" : "Enter") : e.key === "ArrowUp" || e.key === "ArrowDown" ? e.key : null
    if (!k || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    const to = nextCell({ row, col }, k, draft.rows.length)
    if (!to) return
    if (to.addRow) return addRow(col)
    focusCell(to.row, to.col)
  }
  const onCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, row: number, col: number) => {
    const block = readPastedBlock(e.clipboardData.getData("text/plain"))
    if (!block) return
    e.preventDefault()
    const laid = pasteIntoRows(
      draft.rows.map((r) => r.cells),
      draft.columns.length,
      { row, col },
      block,
    )
    edit((d) => ({ ...d, rows: laid.rows.map((cells, i) => ({ key: d.rows[i]?.key ?? key(), cells })) }))
    setPasted(
      laid.dropped
        ? tt("{n, plural, one {Pasted. # cell did not fit the columns.} other {Pasted. # cells did not fit the columns.}}", { n: laid.dropped })
        : tt("{n, plural, one {Pasted # row.} other {Pasted # rows.}}", { n: block.length }),
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {labelled ? <p className="text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Table")}</p> : null}
          <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Buyers can switch between cm and in. Columns with the ruler on are converted.")}</p>
        </div>
        <button type="button" className={cn(secondaryDepth, "h-9 shrink-0 rounded-lg px-3 text-[14px] sm:h-8 sm:text-[13px]")} onClick={addColumn} disabled={draft.columns.length >= SIZE_CHART_LIMITS.columns} data-size-chart-add-column="">
          <Plus className="h-4 w-4" aria-hidden />
          {tt("Column")}
        </button>
      </div>
      <div ref={tableRef} className="page-scroll overflow-x-auto overscroll-x-contain rounded-xl border border-[#e5e7eb] [-webkit-overflow-scrolling:touch]" data-size-chart-grid="">
        <table className="w-full border-separate border-spacing-0 text-[13.5px] sm:text-[14px]">
          <thead>
            <tr>
              {draft.columns.map((col, c) => (
                <th key={col.key} scope="col" className={cn("border-b border-[#e5e7eb] bg-[#f8f9fa] p-1.5 text-left align-top font-normal", c === 0 && "sticky left-0 z-[2] border-r")}>
                  <input
                    value={col.name}
                    maxLength={SIZE_CHART_LIMITS.cell}
                    onChange={(e) => setColumn(c, { name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== "ArrowDown") return
                      e.preventDefault()
                      if (draft.rows.length) focusCell(0, c)
                      else addRow(c)
                    }}
                    placeholder={c === 0 ? tt("Size") : tt("Chest")}
                    aria-label={tt("Column {n} name", { n: c + 1 })}
                    className={cn(FIELD_COMPACT, "w-full min-w-[80px] font-medium sm:min-w-[104px]")}
                    data-column-name=""
                  />
                  {c > 0 ? (
                    <div className="mt-1 flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-pressed={col.measure}
                        onClick={() => setColumn(c, { measure: !col.measure })}
                        title={col.measure ? tt("A measurement, converted between cm and in") : tt("A label, never converted")}
                        className={cn("inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] font-medium transition-colors", col.measure ? "text-[#1a1a2e] hover:bg-[#eceef1]" : "text-[#9ca3af] hover:bg-[#eceef1]")}
                        data-column-measure={col.measure ? "on" : "off"}
                      >
                        <Ruler className="h-3.5 w-3.5" aria-hidden />
                        {col.measure ? draft.unit : tt("Label")}
                      </button>
                      <button type="button" onClick={() => removeColumn(c)} aria-label={tt("Remove column {name}", { name: col.name || String(c + 1) })} className={cn(CELL_BUTTON, "ml-auto")} data-size-chart-remove-column={c}>
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    /* The size column is never converted: no ruler, only the row's height so the names line up. */
                    <div aria-hidden className="mt-1 h-7" />
                  )}
                </th>
              ))}
              <th aria-label={tt("Row actions")} className="w-[92px] border-b border-[#e5e7eb] bg-[#f8f9fa] sm:w-[84px]" />
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, r) => (
              <tr key={row.key} className="group/row">
                {draft.columns.map((col, c) => (
                  <td key={col.key} className={cn("border-b border-[#f1f2f4] bg-white p-1.5 group-last/row:border-b-0", c === 0 && "sticky left-0 z-[1] border-r border-r-[#eceef1]")}>
                    <input
                      value={row.cells[c] ?? ""}
                      maxLength={SIZE_CHART_LIMITS.cell}
                      onChange={(e) => setCell(r, c, e.target.value)}
                      onKeyDown={(e) => onCellKey(e, r, c)}
                      onPaste={(e) => onCellPaste(e, r, c)}
                      inputMode={col.measure && c > 0 ? "decimal" : undefined}
                      enterKeyHint={r === draft.rows.length - 1 ? "done" : "next"}
                      placeholder={c === 0 ? "M" : col.measure ? "0" : ""}
                      aria-label={tt("{column}, row {n}", { column: col.name || tt("Column {n}", { n: c + 1 }), n: r + 1 })}
                      className={cn(FIELD_COMPACT, "w-full min-w-[72px] tabular-nums sm:min-w-[104px]", c === 0 && "font-medium")}
                      data-cell={`${r}:${c}`}
                      {...(c === 0 ? { "data-row-size": "" } : {})}
                    />
                  </td>
                ))}
                <td className="border-b border-[#f1f2f4] bg-white pr-1.5 group-last/row:border-b-0">
                  <div className="flex items-center justify-end gap-0.5">
                    <button type="button" onClick={() => shiftRow(r, -1)} disabled={r === 0} aria-label={tt("Move size {name} up", { name: row.cells[0] || String(r + 1) })} className={CELL_BUTTON} data-size-chart-row-up={r}>
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" onClick={() => shiftRow(r, 1)} disabled={r === draft.rows.length - 1} aria-label={tt("Move size {name} down", { name: row.cells[0] || String(r + 1) })} className={CELL_BUTTON} data-size-chart-row-down={r}>
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button type="button" onClick={() => removeRow(r)} aria-label={tt("Remove size {name}", { name: row.cells[0] || String(r + 1) })} className={CELL_BUTTON} data-size-chart-remove-row={r}>
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {draft.rows.length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-[#6b7280]">{tt("No sizes yet.")}</p> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <button type="button" className={cn(secondaryDepth, "h-9 rounded-lg px-3 text-[14px] sm:h-8 sm:text-[13px]")} onClick={() => addRow()} disabled={draft.rows.length >= SIZE_CHART_LIMITS.rows} data-size-chart-add-row="">
          <Plus className="h-4 w-4" aria-hidden />
          {tt("Add size")}
        </button>
        <p className="text-[12.5px] leading-[18px] text-[#6b7280]" aria-live="polite" data-size-chart-paste-note="">
          {pasted ?? tt("Enter goes down a row. Paste cells from a spreadsheet into any cell.")}
        </p>
      </div>
    </div>
  )
}

/**
 * ROUND 13: ALSO SHOW IT ON. A chart can be set for whole collections and
 * categories, so a shop with fifty tees sets "Tees" once. A product's own
 * chart still comes first (lib/size-charts/storefront.ts). Chips, one tap
 * each, the way the store's tags are picked.
 */
function AlsoShowOn({ draft, targets, rules, titled, onChange }: { draft: SizeChartDraft; targets: SizeChartTargetsLike; rules: boolean; titled: boolean; onChange: (patch: Partial<Pick<SizeChartDraft, "collectionIds" | "categories">>) => void }) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 max-w-full cursor-pointer items-center truncate rounded-full border px-3.5 text-[13.5px] font-medium transition-colors [-webkit-tap-highlight-color:transparent]",
      on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d9dbe0] bg-white text-[#1a1a2e] [@media(hover:hover)]:hover:bg-[#f7f7f8]",
    )
  /* A category saved on the chart that no product has now is still listed, so it can be taken off. */
  const categories = [...targets.categories, ...draft.categories.filter((c) => !targets.categories.some((t) => t.toLowerCase() === c.toLowerCase()))]
  const none = !targets.collections.length && !categories.length
  return (
    <div data-size-chart-also="">
      {titled ? <p className="text-[13px] font-medium text-[#374151] sm:text-[13.5px]">{tt("Also show it on")}</p> : null}
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
