"use client"

/**
 * ===========================================================================
 *  A SIZE CHART ON STORELIB'S OWN PAGES (round 13)
 * ===========================================================================
 * The OnePage's product sheet shows the product's size chart the way a
 * website's product page does: a "Size guide" row that opens to the table,
 * a cm / in switch when the chart has measurements (converted by
 * lib/size-charts/model.ts, labels like "EU 38" never touched), the picture
 * and the note. The size column stays put while the rest scroll sideways on
 * a phone. Everything in a chart is plain text the seller typed, drawn as
 * text. The unit chosen is kept for the next chart (the same key the
 * website's charts keep).
 */

import * as React from "react"
import { ChevronDown, Ruler } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasMeasurements, rowsIn, type SizeChart, type SizeUnit } from "@/lib/size-charts/model"

const UNIT_KEY = "storelib_size_unit"

export function SizeChartPanel({ chart, label = "Size guide", className, defaultOpen = false }: { chart: SizeChart; label?: string; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cn("group/size rounded-xl border border-[#ececf1] bg-white", className)} open={defaultOpen || undefined} data-size-chart-panel="">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-[14.5px] font-medium text-[#111113] [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
        <Ruler aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280]" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="truncate text-[13px] font-normal text-[#6b7280]">{chart.name}</span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280] transition-[rotate] duration-200 group-open/size:rotate-180" />
      </summary>
      <SizeChartBody chart={chart} className="px-4 pb-4" />
    </details>
  )
}

/**
 * Round 43: the chart itself (units, picture, table, note) without its folding row, for a place that opens it its own
 * way: the OnePage's product sheet slides it open under the size option (components/onepage/product-sheet).
 */
export function SizeChartBody({ chart, className }: { chart: SizeChart; className?: string }) {
  const convertible = hasMeasurements(chart)
  const [unit, setUnit] = React.useState<SizeUnit>(chart.unit)
  React.useEffect(() => {
    if (!convertible) return
    try {
      const v = window.localStorage.getItem(UNIT_KEY)
      if (v === "cm" || v === "in") setUnit(v)
    } catch {
      /* The chart's own unit. */
    }
  }, [convertible])
  const choose = (u: SizeUnit) => {
    setUnit(u)
    try {
      window.localStorage.setItem(UNIT_KEY, u)
    } catch {
      /* Kept for this page only. */
    }
  }
  const shown = convertible ? unit : chart.unit
  const rows = rowsIn(chart, shown)
  return (
      <div className={className} data-size-chart-body="">
        {convertible ? (
          <div role="radiogroup" aria-label="Units" className="mb-3 inline-flex rounded-full bg-[#f1f2f4] p-[3px]" data-size-chart-units="">
            {(["cm", "in"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={shown === u}
                onClick={() => choose(u)}
                className={cn("h-8 min-w-[52px] rounded-full px-3 text-[13px] font-medium transition-[background-color,box-shadow,color] duration-150 [-webkit-tap-highlight-color:transparent]", shown === u ? "bg-white text-[#111113] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]" : "text-[#6b7280]")}
              >
                {u}
              </button>
            ))}
          </div>
        ) : null}
        {chart.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chart.imageUrl} alt="" className="mb-3 max-h-[240px] w-auto max-w-full rounded-lg object-contain" loading="lazy" decoding="async" />
        ) : null}
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [-webkit-overflow-scrolling:touch]" data-sheet-no-drag="">
          <table className="w-full border-collapse text-left text-[14px] tabular-nums text-[#374151]">
            <thead>
              <tr>
                {chart.columns.map((c, i) => (
                  <th key={i} scope="col" className={cn("whitespace-nowrap border-b border-[#ececf1] px-3 py-2.5 text-[13px] font-semibold text-[#111113]", i === 0 && "sticky left-0 z-[1] bg-white pl-0")}>
                    {c.name}
                    {c.measure ? <span className="ml-1 font-normal text-[#9ca3af]">({shown})</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-b border-[#f1f2f4] bg-white py-2.5 pl-0 pr-3 font-medium text-[#111113]">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="whitespace-nowrap border-b border-[#f1f2f4] px-3 py-2.5">
                        {cell || <span className="text-[#c4c8ce]">&ndash;</span>}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {chart.notes ? <p className="mt-3 whitespace-pre-line text-[13px] leading-[1.55] text-[#6b7280]">{chart.notes}</p> : null}
      </div>
  )
}

/** A product's own questions, folded, in the product editor's order. Plain text, lines kept. */
export function ProductQuestions({ faqs, heading = "Questions", className }: { faqs: readonly { question: string; answer: string }[]; heading?: string; className?: string }) {
  if (!faqs.length) return null
  return (
    <div className={className} data-product-questions="">
      {heading ? <p className="mb-1 text-[15px] font-semibold text-[#111113]">{heading}</p> : null}
      {/*
        Round 53: every line is the same one, each question's own bottom border under a top one, all `border-[#f0f0f3]`.
        The lines between used to be `divide-[#f0f0f3]`, which the page's theme does not recolour (the .op-sheet rules in
        globals.css name the border classes): in the product sheet the first and last took the theme's line and the ones
        between stayed #f0f0f3, a lighter line between two darker ones on a light page and a white one on a dark page.
      */}
      <div className="border-t border-[#f0f0f3]">
        {faqs.map((f, i) => (
          <details key={i} className="group/faq border-b border-[#f0f0f3]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[14.5px] font-medium text-[#111113] [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">{f.question}</span>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-[#6b7280] transition-[rotate] duration-200 group-open/faq:rotate-180" />
            </summary>
            <p className="whitespace-pre-line pb-3 text-[14px] leading-relaxed text-[#4b5563]">{f.answer}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
