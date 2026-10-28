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
 * Saving writes the chart to the store at once (POST or PUT /api/size-charts):
 * a chart is the store's, used by every product given it, not part of the
 * product being edited. Deleting asks once, inside the same sheet
 * (confirmDelete), saying how many products lose this chart.
 */

import * as React from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SizeChart } from "@/lib/size-charts/model"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Modal, Notice, api } from "./ui"
import { SizeChartFields, chartBodyOf, draftProblem, useSizeChartDraft } from "./size-chart-form"
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
  const state = useSizeChartDraft(chart)
  const { draft, error, setError } = state
  const [busy, setBusy] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const save = async () => {
    const problem = draftProblem(draft)
    if (problem) return setError(problem)
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
      setConfirmDelete(false)
      setError(problem)
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
      <button type="button" className={BTN_PRIMARY} onClick={save} disabled={busy} data-size-chart-save="">
        {busy ? tt("Saving") : chart ? tt("Save chart") : tt("Create chart")}
      </button>
    </>
  )

  return (
    /* Not the whole phone (round 24, the owner: "the edit size chart is too big on mobile"): 80% of the screen, its table a little narrower. */
    <Modal open={open} onClose={onClose} title={chart ? tt("Edit size chart") : tt("New size chart")} footer={footer} wide phoneMax={0.8}>
      <div className="space-y-5">
        <SizeChartFields state={state} uploadImage={uploadImage} targets={targets} rules={rules} />
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
