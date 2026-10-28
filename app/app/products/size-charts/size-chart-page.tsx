"use client"

/**
 * ===========================================================================
 *  ONE SIZE CHART, ON A PAGE OF ITS OWN
 * ===========================================================================
 * /app/products/size-charts/new and /app/products/size-charts/<id>, framed
 * as a coupon or an offer is (app/app/coupons/coupon-editor.tsx): on a phone
 * a layer over the app's header with Cancel or Back and Save at the top;
 * from lg the 1200px page with a header, the chart on the left and where it
 * is used on the right, Cancel and Save along the foot.
 *
 * The fields are the ones the product editor's dialog draws
 * (components/physical/size-chart-form.tsx), each part a card here. A save
 * or a delete goes back to the list, which says so and tints the row
 * (./list-return).
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { api } from "@/components/physical/ui"
import { SizeChartFields, chartBodyOf, draftProblem, useSizeChartDraft } from "@/components/physical/size-chart-form"
import type { SavedSizeChart, SizeChartTargets } from "@/components/physical/size-chart-editor"
import { uploadDescriptionImage } from "@/lib/rich-text/upload-image"
import { LeaveButton } from "../new/editor-buttons"
import { useConfirm } from "../new/confirm-sheet"
import { iconButton } from "../../orders/order-parts"
import { CouponSaveButton, quietDanger } from "../../coupons/coupon-parts"
import { sizeChartsReturn } from "./list-return"

const CARD = "scroll-mt-4 space-y-4 rounded-2xl border border-[#e5e7eb]/60 bg-white app-card-x py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:py-6"
const CARD_TITLE = "text-[16px] font-semibold leading-6 text-[#1a1a2e] sm:text-[17px]"
const HINT = "text-[13px] leading-5 text-[#6b7280]"

export function SizeChartPage({ creatorId, chart, ready, rules, targets }: { creatorId: string; chart: SavedSizeChart | null; ready: boolean; rules: boolean; targets: SizeChartTargets }) {
  const router = useRouter()
  const state = useSizeChartDraft(chart)
  const { draft, dirty, error, setError, markSaved } = state
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)
  const busy = saving || deleting
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [ask, confirmSheet] = useConfirm()
  const upload = React.useCallback(async (file: File) => (await uploadDescriptionImage(file, { creatorId })).url, [creatorId])

  React.useEffect(() => {
    sizeChartsReturn.warm(router)
  }, [router])
  sizeChartsReturn.useOrigin()

  const isNew = !chart
  const canSave = ready && !busy && (isNew || dirty)

  const save = async () => {
    if (!canSave) return
    const problem = draftProblem(draft)
    if (problem) {
      setError(problem)
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setSaving(true)
    const res = await api<{ id: string; charts: SavedSizeChart[] }>(chart ? `/api/size-charts/${chart.id}` : "/api/size-charts", { method: chart ? "PUT" : "POST", body: chartBodyOf(draft, rules) })
    if (!res.ok) {
      setSaving(false)
      setError(res.error)
      paneRef.current?.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    markSaved()
    sizeChartsReturn.leave(router, { id: res.data.id, charts: res.data.charts ?? null, message: chart ? tt("Size chart saved") : tt("Size chart created") })
  }

  const leaveMode = chart && !dirty ? "back" : "cancel"
  const leave = async () => {
    if (busy) return
    if (dirty) {
      const yes = await ask(
        chart
          ? { title: tt("Discard changes?"), body: tt("Your edits since the last save will be lost."), confirm: tt("Discard"), cancel: tt("Keep editing") }
          : { title: tt("Discard this chart?"), body: tt("It has not been saved yet, so it will not be kept."), confirm: tt("Discard"), cancel: tt("Keep editing") },
      )
      if (!yes) return
    }
    sizeChartsReturn.leave(router, { id: chart?.id ?? null })
  }

  const remove = async () => {
    if (!chart || busy) return
    const yes = await ask({
      title: tt("Delete {name}?", { name: chart.name }),
      body: chart.productCount > 0 ? tt("{n, plural, one {# product loses this chart.} other {# products lose this chart.}}", { n: chart.productCount }) : tt("No product uses this chart."),
      confirm: tt("Delete chart"),
      cancel: tt("Keep it"),
    })
    if (!yes) return
    setDeleting(true)
    const res = await api<{ charts: SavedSizeChart[] }>(`/api/size-charts/${chart.id}`, { method: "DELETE" })
    if (!res.ok) {
      setDeleting(false)
      setError(res.error)
      return
    }
    sizeChartsReturn.leave(router, { id: chart.id, deleted: true, charts: res.data.charts ?? null, message: tt("{name} deleted", { name: chart.name }) })
  }

  /* Cmd or Ctrl and S, from anywhere on the page. */
  const saveRef = React.useRef(save)
  React.useEffect(() => {
    saveRef.current = save
  })
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return
      e.preventDefault()
      void saveRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const title = chart ? chart.name : tt("New size chart")
  const sizes = draft.rows.filter((r) => r.cells.some((c) => c.trim())).length
  const saveState = saving ? "saving" : isNew ? "new" : dirty ? "unsaved" : "saved"
  const stateLine = saveState === "saving" ? tt("Saving") : saveState === "unsaved" ? tt("Unsaved changes") : saveState === "new" ? tt("Not saved yet") : tt("{n, plural, =0 {No products use it} one {# product uses it} other {# products use it}}", { n: chart!.productCount })
  const saveWord = isNew ? tt("Create") : tt("Save")

  return (
    <div
      ref={paneRef}
      data-size-chart-page=""
      className="page-scroll h-full overflow-y-auto overflow-x-hidden bg-[#f8f9fa] max-md:[[data-page-layer]_&]:pb-[calc(32px+env(safe-area-inset-bottom))] lg:flex lg:flex-col"
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {saving ? tt("Saving") : deleting ? tt("Deleting") : ""}
      </p>

      <div data-editor-bar="" className={cn("sticky top-0 z-30 bg-[#f8f9fa] transition-shadow duration-150 max-md:[[data-page-layer]_&]:pt-[env(safe-area-inset-top)] lg:hidden", scrolled ? "shadow-[0_1px_0_#e3e5e8,0_4px_12px_-8px_rgba(17,24,39,0.12)]" : "")}>
        <h1 className="sr-only">{chart ? tt("Edit size chart {name}", { name: chart.name }) : tt("New size chart")}</h1>
        <div className="mx-auto flex h-14 max-w-[760px] items-center justify-between gap-2 app-gutter sm:h-16 sm:px-6">
          <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to size charts")} onLeave={() => void leave()} />
          <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
        </div>
      </div>

      <div data-editor-page="" className="mx-auto w-full max-w-[760px] app-gutter pb-6 pt-3 sm:pb-16 sm:pt-4 lg:max-w-[1200px] lg:pb-8 lg:pt-6">
        <header data-editor-head="" className="mb-5 hidden min-h-9 items-center gap-2 lg:flex">
          <button type="button" aria-label={tt("Back to size charts")} title={tt("Size charts")} disabled={busy} onClick={() => void leave()} className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 truncate text-[24px] font-bold leading-9 text-[#1a1a2e] sm:text-[28px]">{title}</h1>
        </header>

        {!ready ? (
          <p data-sql-needed="283" className="mb-3 rounded-xl bg-[#fff8e6] px-4 py-3 text-[14px] leading-5 text-[#5c4300] lg:mb-4">
            {tt("They need a database update (SQL part 283) before they can be used.")}
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="mb-3 rounded-xl border border-[#f5c2bd] bg-[#fef3f2] px-4 py-3 text-[14px] leading-5 text-[#8a1c0f] lg:mb-4">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:gap-4 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(272px,1fr)] lg:items-start">
          <div data-editor-main="" className="min-w-0">
            <SizeChartFields state={state} uploadImage={upload} targets={targets} rules={rules} card={CARD} cardTitle={CARD_TITLE} />
          </div>

          <div data-editor-side="" className="flex min-w-0 flex-col gap-3 sm:gap-4 lg:sticky lg:top-6">
            <section className={CARD} aria-labelledby="size-chart-summary-title" data-size-chart-summary="">
              <h2 id="size-chart-summary-title" className={CARD_TITLE}>
                {tt("Summary")}
              </h2>
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div>
                  <dt className={HINT}>{tt("Sizes")}</dt>
                  <dd className="mt-1 text-[15px] font-medium tabular-nums text-[#1a1a2e] sm:text-[14px]">{sizes}</dd>
                </div>
                <div>
                  <dt className={HINT}>{tt("Measured in")}</dt>
                  <dd className="mt-1 text-[15px] font-medium text-[#1a1a2e] sm:text-[14px]">{draft.unit}</dd>
                </div>
                {chart ? (
                  <div>
                    <dt className={HINT}>{tt("Products")}</dt>
                    <dd className="mt-1 text-[15px] font-medium tabular-nums text-[#1a1a2e] sm:text-[14px]">{chart.productCount}</dd>
                  </div>
                ) : null}
              </dl>
              <p className={HINT}>{tt("Give a product its chart in the product editor, under Size chart.")}</p>
            </section>

            {chart ? (
              <div className="flex justify-start lg:justify-end">
                <button type="button" data-size-chart-delete="" disabled={busy} onClick={() => void remove()} className={cn(quietDanger, "h-10 rounded-[10px] px-3.5 text-[15px] sm:h-8 sm:rounded-lg sm:px-3 sm:text-[13px]")}>
                  {tt("Delete chart")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div data-editor-foot="" data-app-foot="up" className="sticky bottom-0 z-30 mt-auto hidden shrink-0 border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_rgba(17,24,39,0.10)] lg:block">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-8">
          <p data-editor-state={saveState} className="flex min-w-0 items-center gap-2 text-[14px] leading-5">
            <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", saveState === "unsaved" ? "bg-[#111113]" : "bg-[#b6bac1]")} />
            <span className={cn("truncate", saveState === "unsaved" ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{stateLine}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <LeaveButton mode={leaveMode} disabled={busy} asks={dirty} label={tt("Going back to size charts")} onLeave={() => void leave()} />
            <CouponSaveButton saving={saving} disabled={!canSave} label={saveWord} onSave={() => void save()} />
          </div>
        </div>
      </div>

      {confirmSheet}
    </div>
  )
}
