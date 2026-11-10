"use client"

/**
 * ===========================================================================
 *  ONE SIZE CHART, EDITED AS A TABLE, OVER THE PRODUCT EDITOR
 * ===========================================================================
 * Opened from the product editor's Size chart card (./size-chart-card.tsx):
 * a dialog on a computer, the app's bottom sheet on a phone (./ui.tsx Modal),
 * so the product being edited stays exactly as it was under it. Products ›
 * Size charts opens a chart on a page of its own instead (app/app/products/
 * size-charts/size-chart-page.tsx). Both draw the same fields
 * (./size-chart-form.tsx): addColumn, removeColumn, addRow and removeRow,
 * the ruler (data-column-measure) per column and the unit (data-size-unit={u})
 * are there, with the first column sticky left-0 while the table scrolls
 * sideways (overflow-x-auto) in FIELD_COMPACT cells.
 *
 * WAVE 10 (the owner: "make the Edit size chart modal simpler, cleaner, good
 * Storelib UI, easier to use and set up ... opening and closing should feel
 * smooth and clean"). The shared SheetDialog (components/ui/sheet-dialog):
 * on a computer a dialog of one fixed height that rises in and settles and
 * leaves on its own quicker curve; on a phone the app's bottom sheet, 44px
 * to the touch. Inside, from the top: the title and which products use it,
 * Edit and Preview (the chart exactly as buyers open it, in cm or in), the
 * name, the unit and the table, and everything else folded under More
 * options. Save and Cancel stay at the foot whatever scrolls. Closing with
 * changes asks first, in the foot, never a second dialog over this one.
 *
 * Saving writes the chart to the store at once (POST or PUT /api/size-charts):
 * a chart is the store's, used by every product given it, not part of the
 * product being edited. Deleting asks once, inside the same sheet
 * (confirmDelete), saying how many products lose this chart.
 */

import * as React from "react"
import { Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SizeChart, SizeUnit } from "@/lib/size-charts/model"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Notice, api, useModalPhone } from "./ui"
import { SizeChartFields, chartBodyOf, draftProblem, useSizeChartDraft, type SizeChartDraft } from "./size-chart-form"
import { SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { SizeChartTable as BuyerTable } from "@/components/website-builder/sections/renderers/product/size-chart"
import type { SectionPalette } from "@/components/website-builder/sections/_shared"
import { tt } from "@/lib/i18n/text"

export { draftProblem }

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

/** A question's two answers in the foot: side by side, the whole width on a phone. */
const ASK_BUTTONS = "flex gap-2 max-sm:w-full max-sm:[&>button]:flex-1"

/** The buyer's product page in Storelib's own greys, for the preview. */
const PREVIEW_PALETTE = { text: "#374151", heading: "#1a1a2e", paragraph: "#6b7280", text_muted: "#9ca3af", border: "#eceef1", bg: "#ffffff" } as unknown as SectionPalette

/** Edit or Preview, and cm or in: the app's pill switch (the unit field's own look). */
function Segmented<T extends string>({ value, options, onChange, label, marker }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; marker: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex h-11 shrink-0 rounded-lg bg-[#f1f2f4] p-1 sm:h-9" data-segmented={marker}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("relative min-w-[64px] cursor-pointer rounded-md px-3 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] sm:after:hidden text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:text-[13px]", value === o.value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
          data-segment={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** What a buyer sees when they open Size guide: the title, cm and in, the picture, the table and the note. */
export function SizeChartPreview({ draft }: { draft: SizeChartDraft }) {
  const [unit, setUnit] = React.useState<SizeUnit>(draft.unit)
  React.useEffect(() => setUnit(draft.unit), [draft.unit])
  const chart: SizeChart = {
    name: draft.name.trim(),
    unit: draft.unit,
    columns: draft.columns.map((c, i) => ({ name: c.name.trim() || (i === 0 ? tt("Size") : tt("Column {n}", { n: i + 1 })), measure: i === 0 ? false : c.measure })),
    rows: draft.rows.map((r) => draft.columns.map((_, i) => (r.cells[i] ?? "").trim())).filter((cells) => cells.some(Boolean)),
    notes: draft.notes.trim(),
    imageUrl: draft.imageUrl,
  } as SizeChart
  const measures = chart.columns.some((c, i) => i > 0 && c.measure)
  return (
    <div className="rounded-2xl border border-[#eceef1] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-5" data-size-chart-preview="">
      <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.04em] text-[#9ca3af]">{tt("As buyers see it")}</p>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate text-[17px] font-semibold text-[#1a1a2e]">{chart.name || tt("Size guide")}</h3>
        {measures ? <Segmented value={unit} onChange={setUnit} label={tt("Units")} marker="preview-unit" options={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }]} /> : null}
      </div>
      {chart.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={chart.imageUrl} alt="" className="mb-3 max-h-40 w-auto rounded-lg object-contain" />
      ) : null}
      {chart.rows.length ? <BuyerTable chart={chart} unit={unit} palette={PREVIEW_PALETTE} /> : <p className="py-6 text-center text-[13px] text-[#6b7280]">{tt("Add a size to see the table.")}</p>}
      {chart.notes ? <p className="mt-3 whitespace-pre-line text-[13px] leading-5 text-[#6b7280]">{chart.notes}</p> : null}
    </div>
  )
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
  /** Deleting is offered where the store's charts are managed; the product editor only edits. */
  onDelete?: (chart: SavedSizeChart) => Promise<string | null>
  uploadImage?: (file: File) => Promise<string>
  /** The store's collections and categories, for "Also show it on"; absent where the store's list was not read. */
  targets?: SizeChartTargets
  /** Whether SQL part 309 has run, so a chart can be set for collections and categories. */
  rules?: boolean
}) {
  const phone = useModalPhone()
  const state = useSizeChartDraft(chart)
  const { draft, error, setError, dirty } = state
  const [busy, setBusy] = React.useState(false)
  /* What the foot is asking: nothing, whether to delete, or whether to throw away the changes. */
  const [asking, setAsking] = React.useState<null | "delete" | "discard">(null)
  const [tab, setTab] = React.useState<"edit" | "preview">("edit")

  const save = async () => {
    const problem = draftProblem(draft)
    if (problem) {
      setTab("edit")
      return setError(problem)
    }
    setBusy(true)
    const res = await api<{ id: string; charts: SavedSizeChart[]; ready?: boolean }>(chart ? `/api/size-charts/${chart.id}` : "/api/size-charts", { method: chart ? "PUT" : "POST", body: chartBodyOf(draft, rules) })
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
      setAsking(null)
      setError(problem)
    }
  }

  /* EVERY WAY OUT (the X, Escape, the scrim, a pull down, Cancel) asks first when something would be lost. */
  const requestClose = React.useCallback(() => {
    if (busy) return
    if (dirty) return setAsking("discard")
    onClose()
  }, [busy, dirty, onClose])

  /* Cmd or Ctrl and S saves, as the chart's own page does. */
  const saveRef = React.useRef(save)
  React.useEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const used = chart ? (chart.productCount > 0 ? tt("{n, plural, one {On # product. A change shows there too.} other {On # products. A change shows on all of them.}}", { n: chart.productCount }) : tt("Not on any product yet.")) : tt("Start from a kind of garment, then type your measurements.")
  const status = busy ? tt("Saving") : dirty ? tt("Unsaved changes") : null

  const foot =
    asking === "delete" && chart ? (
      <>
        <p className="mr-auto self-center text-[13px] leading-[18px] text-[#b42318] max-sm:basis-full">
          {chart.productCount > 0 ? tt("{n, plural, one {# product loses this chart.} other {# products lose this chart.}}", { n: chart.productCount }) : tt("No product uses this chart.")}
        </p>
        <div className={ASK_BUTTONS}>
          <button type="button" className={BTN_SECONDARY} onClick={() => setAsking(null)} disabled={busy}>
            {tt("Keep it")}
          </button>
          <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9b1c13]")} onClick={remove} disabled={busy} data-size-chart-delete-confirm="">
            {tt("Delete chart")}
          </button>
        </div>
      </>
    ) : asking === "discard" ? (
      <>
        <p className="mr-auto self-center text-[13px] font-medium leading-[18px] text-[#1a1a2e] max-sm:basis-full" data-size-chart-discard-ask="">
          {chart ? tt("Discard your changes?") : tt("Discard this chart?")}
        </p>
        <div className={ASK_BUTTONS}>
          <button type="button" className={BTN_SECONDARY} onClick={() => setAsking(null)} data-size-chart-keep-editing="">
            {tt("Keep editing")}
          </button>
          <button type="button" className={cn(BTN_PRIMARY, "bg-[#b42318] hover:bg-[#9b1c13]")} onClick={onClose} data-size-chart-discard="">
            {tt("Discard")}
          </button>
        </div>
      </>
    ) : (
      <>
        {chart && onDelete ? (
          <button type="button" className={cn(BTN_GHOST, "text-[#b42318] hover:bg-[#fef2f2] hover:text-[#b42318]")} onClick={() => setAsking("delete")} disabled={busy} data-size-chart-delete="">
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">{tt("Delete")}</span>
          </button>
        ) : null}
        <p className="mr-auto flex min-w-0 items-center gap-2 self-center text-[13px] leading-[18px]" aria-live="polite" data-size-chart-status={busy ? "saving" : dirty ? "unsaved" : "saved"}>
          {status ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#111113]" />
              <span className="truncate font-medium text-[#1a1a2e]">{status}</span>
            </>
          ) : null}
        </p>
        <button type="button" className={BTN_SECONDARY} onClick={requestClose} disabled={busy} data-size-chart-cancel="">
          {tt("Cancel")}
        </button>
        <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy || (!!chart && !dirty)} data-size-chart-save="">
          {busy ? tt("Saving") : chart ? tt("Save") : tt("Create chart")}
        </button>
      </>
    )

  const title = chart ? tt("Edit size chart") : tt("New size chart")
  return (
    <SheetDialog
      open={open}
      onClose={requestClose}
      phone={phone}
      label={title}
      showCloseButton={false}
      /* One height on a computer, whatever Edit or Preview shows, so switching never moves the dialog. */
      className="flex h-[min(86dvh,760px)] w-full flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[720px]"
      sheet={{ maxHeight: "calc(var(--vv-h, 100dvh) * 0.92)" }}
      dialog={{ "aria-describedby": undefined }}
      /* The name, ready to type, on a computer; on a phone nothing is focused, so the keyboard does not cover the chart as it rises. */
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        document.querySelector<HTMLInputElement>("[data-size-chart-dialog] [data-size-chart-name]")?.focus({ preventScroll: true })
      }}
    >
      <div className={cn("flex min-h-0 flex-1 flex-col", phone && "h-[calc(var(--vv-h,100dvh)*0.92-28px)]")} data-size-chart-dialog="" onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && !(e.target as HTMLElement).hasAttribute("data-cell") && !(e.target as HTMLElement).hasAttribute("data-column-name")) e.preventDefault()
      }}>
        {/* The title and its products, then Edit and Preview: beside them on a computer, a row of their own under them on a phone. */}
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 border-b border-[#f1f2f4] px-4 pb-3 pt-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-6 sm:pt-5" data-size-chart-head="">
          <div className="min-w-0">
            <SheetDialogTitle className="text-[17px] font-semibold leading-6 text-[#1a1a2e]">{title}</SheetDialogTitle>
            <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]" data-size-chart-used="">{used}</p>
          </div>
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-1 sm:col-start-2 [&>[role=tablist]]:w-full sm:[&>[role=tablist]]:w-auto [&_[role=tab]]:flex-1">
            <Segmented value={tab} onChange={setTab} label={tt("Size chart")} marker="view" options={[{ value: "edit", label: tt("Edit") }, { value: "preview", label: tt("Preview") }]} />
          </div>
          <button type="button" onClick={requestClose} aria-label={tt("Close")} className="col-start-2 row-start-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-[#6b7280] transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] max-sm:bg-[#f3f4f6] sm:col-start-3 sm:h-9 sm:w-9 sm:rounded-lg" data-size-chart-close="">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5" data-size-chart-body="">
          {error ? <Notice className="mb-4">{error}</Notice> : null}
          {/* Both stay mounted: switching is a swap of what shows, never a remount that would lose a focus or a scroll. */}
          <div hidden={tab !== "edit"} data-size-chart-tab="edit">
            <SizeChartFields state={state} uploadImage={uploadImage} targets={targets} rules={rules} folded />
          </div>
          <div hidden={tab !== "preview"} data-size-chart-tab="preview">
            <SizeChartPreview draft={draft} />
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#f1f2f4] bg-white px-4 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] max-sm:[&_button]:min-h-11 sm:px-6 sm:pb-3" data-size-chart-foot="">
          {foot}
        </footer>
      </div>
    </SheetDialog>
  )
}
