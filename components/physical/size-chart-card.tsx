"use client"

/**
 * ===========================================================================
 *  THE PRODUCT EDITOR'S SIZE CHART CARD
 * ===========================================================================
 * Under Variants for a physical product (./product-cards.tsx). One choice:
 * which of the store's size charts this product shows, or none. The chart
 * shows on the product page, live, in the builder and in an imported
 * Shopify theme alike (lib/size-charts).
 *
 * A chart is the store's, not the product's: one "Tees" chart serves every
 * tee. So a chart made or changed here is saved to the store at once
 * (./size-chart-editor.tsx), and the card says how many products share it.
 * Which chart this product uses is saved with the product, by the editor's
 * Save, through `handle.save(productId)` (PUT /api/size-charts/product).
 *
 * Before SQL part 283 has run the card says so, and the product saves as
 * usual without a chart.
 */

import * as React from "react"
import Link from "next/link"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_SECONDARY, Card, Notice, SelectInput, api } from "./ui"
import { SizeChartEditor, type SavedSizeChart } from "./size-chart-editor"
import { tt } from "@/lib/i18n/text"

export interface SizeChartHandle {
  /** Saves which chart the product uses; a sentence on failure, else null. */
  save: (productId: string) => Promise<string | null>
}

export const SIZE_CHARTS_HREF = "/app/products/size-charts"

/** The first rows of a chart, small, so the seller sees which one they picked. */
export function SizeChartPreview({ chart, rows = 4 }: { chart: SavedSizeChart; rows?: number }) {
  const shown = chart.rows.slice(0, rows)
  return (
    <div className="overflow-x-auto rounded-xl border border-[#eceef1]" data-size-chart-preview="">
      <table className="w-full border-collapse text-left text-[13px] tabular-nums">
        <thead>
          <tr className="bg-[#f8f9fa] text-[#6b7280]">
            {chart.columns.map((c, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">
                {c.name}
                {c.measure ? <span className="ml-1 font-normal text-[#9ca3af]">({chart.unit})</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, r) => (
            <tr key={r} className="border-t border-[#f1f2f4]">
              {row.map((cell, i) => (
                <td key={i} className={cn("whitespace-nowrap px-3 py-2", i === 0 ? "font-medium text-[#1a1a2e]" : "text-[#4b5563]")}>
                  {cell || <span className="text-[#c4c8ce]">&ndash;</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {chart.rows.length > rows ? <p className="border-t border-[#f1f2f4] px-3 py-1.5 text-[12px] text-[#6b7280]">{tt("{n, plural, one {and # more size} other {and # more sizes}}", { n: chart.rows.length - rows })}</p> : null}
    </div>
  )
}

export function SizeChartCard({ productId, handle, onDirty, uploadImage }: { productId: string | null; handle: React.MutableRefObject<SizeChartHandle | null>; onDirty: () => void; uploadImage?: (file: File) => Promise<string> }) {
  const [loading, setLoading] = React.useState(true)
  const [ready, setReady] = React.useState(true)
  const [charts, setCharts] = React.useState<SavedSizeChart[]>([])
  const [chosen, setChosen] = React.useState<string | null>(null)
  /* What the server has for this product, so Save writes only a change. */
  const saved = React.useRef<string | null>(null)
  const [editing, setEditing] = React.useState<{ key: number; chart: SavedSizeChart | null } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let gone = false
    ;(async () => {
      const [list, mine] = await Promise.all([
        api<{ ready: boolean; charts: SavedSizeChart[] }>("/api/size-charts"),
        productId ? api<{ ready: boolean; chartId: string | null }>(`/api/size-charts/product?productId=${encodeURIComponent(productId)}`) : Promise.resolve(null),
      ])
      if (gone) return
      if (list.ok) {
        setReady(list.data.ready !== false)
        setCharts(list.data.charts ?? [])
      } else setError(list.error)
      if (mine?.ok) {
        saved.current = mine.data.chartId
        setChosen(mine.data.chartId)
      }
      setLoading(false)
    })()
    return () => {
      gone = true
    }
  }, [productId])

  handle.current = {
    save: async (id: string) => {
      if (!ready || chosen === saved.current) return null
      const res = await api<{ chartId: string | null }>("/api/size-charts/product", { method: "PUT", body: { productId: id, chartId: chosen } })
      if (!res.ok) return res.error
      saved.current = res.data.chartId
      return null
    },
  }

  const choose = (id: string | null) => {
    setChosen(id)
    onDirty()
  }
  const chart = charts.find((c) => c.id === chosen) ?? null
  const open = (c: SavedSizeChart | null) => setEditing({ key: Date.now(), chart: c })

  return (
    <Card
      id="physical-size-chart"
      title={tt("Size chart")}
      description={chart ? tt("Buyers open it from Size guide on the product page.") : tt("Show buyers a table of measurements on the product page.")}
      action={
        ready && !loading ? (
          <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3 text-[13.5px]")} onClick={() => open(null)} data-size-chart-new="">
            <Plus className="h-4 w-4 text-[#6b7280]" aria-hidden />
            {tt("New chart")}
          </button>
        ) : null
      }
    >
      {loading ? (
        <div className="h-11 animate-pulse rounded-lg bg-[#f3f4f6]" aria-busy="true" aria-label={tt("Loading size charts")} />
      ) : !ready ? (
        <Notice tone="gray">{tt("Size charts need a database update (SQL part 283) before they can be used. The product saves as usual.")}</Notice>
      ) : (
        <div className="space-y-3" data-size-chart-card="">
          {charts.length ? (
            <SelectInput value={chosen ?? ""} onChange={(v) => choose(v || null)} aria-label={tt("Size chart")} className="sm:max-w-[360px]" data-size-chart-pick="">
              <option value="">{tt("No size chart")}</option>
              {charts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectInput>
          ) : (
            <p className="text-[13.5px] leading-5 text-[#4b5563]">{tt("No size charts yet. Make one for each cut you sell, like Tees or Jeans, and use it on every product it fits.")}</p>
          )}
          {chart ? (
            <>
              <SizeChartPreview chart={chart} />
              <p className="text-[12.5px] leading-[18px] text-[#6b7280]">
                {chart.productCount > (saved.current === chart.id ? 1 : 0)
                  ? tt("{n, plural, one {Also on # other product. A change shows on it too.} other {Also on # other products. A change shows on all of them.}}", { n: chart.productCount - (saved.current === chart.id ? 1 : 0) })
                  : tt("Only on this product so far.")}
              </p>
            </>
          ) : null}
          {/* The chart's own edit, and the store's list, on one line. */}
          <div className="flex items-center justify-between gap-3">
            {chart ? (
              <button type="button" className={cn(BTN_SECONDARY, "h-9 px-3 text-[13.5px]")} onClick={() => open(chart)} data-size-chart-edit="">
                {tt("Edit chart")}
              </button>
            ) : (
              <span />
            )}
            <Link href={SIZE_CHARTS_HREF} className="text-[13px] font-medium text-[#4b5563] underline-offset-2 hover:text-[#1a1a2e] hover:underline">
              {tt("All size charts")}
            </Link>
          </div>
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
      {editing ? (
        <SizeChartEditor
          key={editing.key}
          open
          chart={editing.chart}
          uploadImage={uploadImage}
          onClose={() => setEditing(null)}
          onSaved={({ id, charts: next }) => {
            setCharts(next)
            setEditing(null)
            /* A chart made from here is the one this product gets. */
            if (!editing.chart) choose(id)
          }}
        />
      ) : null}
    </Card>
  )
}
