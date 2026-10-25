"use client"

/**
 * ===========================================================================
 *  SIZE GUIDE
 * ===========================================================================
 * A size chart on the page, with a cm / in switch, a fit guide and the
 * model's measurements.
 *
 * Round 13, the owner: "The size guide block doesn't work. It doesn't pull
 * product size charts from Storelib." Its rows were a sample written into
 * this file, the same five sizes on every shop. Now the table is, by
 * "Chart from" (`chart_source`):
 *
 *   product   On a product page, that product's size chart from Products ›
 *   (default) Size charts: its own, else one set for its collection or its
 *             category (lib/size-charts/storefront.ts), read with the product
 *             and handed to every section on the page by ThemePage
 *             (lib/products/page-product.ts). Else this section's table.
 *   table     This section's table only (`table_data`, a row per line,
 *             cells split by |, the first line the column names), in
 *             `table_unit`.
 *
 * Measurement columns are converted between cm and in by the same rule as
 * the product page's Size chart (lib/size-charts/model.ts): a range stays a
 * range, a label like "EU 38" is never touched. The first column stays put
 * while the rest scroll sideways on a phone. Everything in a chart is plain
 * text, drawn as text.
 */

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { hasMeasurements, rowsIn, type SizeChart, type SizeUnit } from "@/lib/size-charts/model"
import { sizeChartFromTable, SIZE_GUIDE_TABLE } from "@/lib/size-charts/table-text"
import { useStorefront } from "../../theme/storefront-context"
import { sectionColors, str, bool, SectionWrapper, type SectionProps } from "../_shared"

const UNIT_KEY = "storelib_size_unit"

export function SizeGuideSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const { pageProduct, inEditor: canvas } = useStorefront()
  const inEditor = isEditing === true || canvas === true

  /* The chart: the page's product's, unless this section says its own table. */
  const own = sizeChartFromTable(typeof s.table_data === "string" ? s.table_data : SIZE_GUIDE_TABLE, str(s.table_unit, "cm") === "in" ? "in" : "cm")
  const source = str(s.chart_source, "product") === "table" ? "table" : "product"
  const fromProduct = source === "product" ? pageProduct?.sizeChart ?? null : null
  const chart: SizeChart | null = fromProduct ?? own
  const convertible = !!chart && hasMeasurements(chart)

  const startUnit: SizeUnit = str(s.unit_system, "metric") === "imperial" ? "in" : "cm"
  const [unit, setUnit] = useState<SizeUnit>(startUnit)
  /* The unit the buyer chose last on this site's size charts (the product page's Size chart keeps the same one). The builder shows the section's own. */
  useEffect(() => {
    if (inEditor) {
      setUnit(startUnit)
      return
    }
    try {
      const v = window.localStorage.getItem(UNIT_KEY)
      if (v === "cm" || v === "in") setUnit(v)
    } catch {
      /* Storage refused: the section's own unit. */
    }
  }, [inEditor, startUnit])
  const choose = (u: SizeUnit) => {
    setUnit(u)
    try {
      window.localStorage.setItem(UNIT_KEY, u)
    } catch {
      /* Kept for this page only. */
    }
  }

  const bg = str(s.bg_color) || c.bg
  const color = str(s.text_color) || c.text
  const headingColor = str(s.text_color) || c.heading
  const headerBg = str(s.header_bg_color) || c.background_secondary
  const borderColor = str(s.border_color) || c.border
  const showToggle = bool(s.show_unit_toggle, true) && convertible
  const chartStyle = str(s.chart_style, "bordered-table")
  /* The size the guide recommends, if the creator named one. */
  const highlightRow = str(s.highlight_size).trim().toLowerCase()
  const highlight = str(s.highlight_color, "#fff3e0")
  const showFit = bool(s.show_fit_guide, true)
  const showModel = bool(s.show_model_measurements, true)
  const padTop = typeof s.padding_top === "number" ? s.padding_top : 60
  const padBottom = typeof s.padding_bottom === "number" ? s.padding_bottom : 60
  const shownUnit: SizeUnit = convertible ? unit : chart?.unit ?? "cm"
  const rows = chart ? rowsIn(chart, shownUnit) : []
  const stacked = chartStyle === "cards" || chartStyle === "visual"
  const fitImage = str(s.fit_guide_image) || (fromProduct?.imageUrl ?? "")
  const isOn = (row: string[]) => !!highlightRow && (row[0] ?? "").trim().toLowerCase() === highlightRow

  /* Nothing to show a visitor: no chart and no table. The builder says why. */
  if (!chart && !inEditor) return null

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="mx-auto max-w-4xl px-4 @[480px]:px-6" style={{ color, paddingTop: padTop, paddingBottom: padBottom }} data-size-guide-section={fromProduct ? "product" : "table"}>
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-3xl font-bold" style={{ color: headingColor }}>{str(s.heading, "Size guide")}</h2>
          {!!s.description && <p className="mx-auto max-w-2xl opacity-70">{str(s.description)}</p>}
        </div>
        {inEditor ? (
          <p className="mb-4 text-center text-[12px] italic opacity-60" data-size-guide-note="">
            {fromProduct
              ? `${fromProduct.name}: this product's size chart from Products, Size charts`
              : source === "table"
                ? "This section's own table"
                : pageProduct
                  ? "This product has no size chart, so this section's own table shows"
                  : "On a product page, that product's size chart shows here. Elsewhere, this section's own table"}
          </p>
        ) : null}
        {showToggle && (
          <div className="mb-6 flex justify-center">
            {/* The product page's own switch (product/size-chart.tsx UnitSwitch): the page's colours, round whatever the theme does to buttons. */}
            <div role="radiogroup" aria-label="Units" className="inline-flex p-1" style={{ background: `color-mix(in srgb, ${headingColor} 7%, transparent)`, borderRadius: 9999 }}>
              {(["cm", "in"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={shownUnit === u}
                  onClick={(e) => {
                    e.stopPropagation()
                    choose(u)
                  }}
                  className={cn("min-h-9 min-w-[64px] px-4 py-1.5 text-sm font-medium transition-[background-color,box-shadow,color] duration-150 [-webkit-tap-highlight-color:transparent]", shownUnit === u && "shadow-[0_1px_2px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)]")}
                  style={{ borderRadius: 9999, ...(shownUnit === u ? { background: bg, color: headingColor } : { color: c.text_muted ?? color }) }}
                >
                  {u === "cm" ? "cm" : "inches"}
                </button>
              ))}
            </div>
          </div>
        )}
        {chart ? (
          <>
            {fromProduct?.name ? <p className="mb-3 text-[15px] font-semibold" style={{ color: headingColor }}>{fromProduct.name}</p> : null}
            {/*
              `chart_style`: Minimal drops the outer rule and the zebra fill;
              Cards and Visual stack each size as its own block on a narrow
              page (the only readable shape on a phone) and are a table from
              560px. Every table scrolls sideways with its size column held.
            */}
            {stacked ? (
              <div className="grid gap-3 @[560px]:hidden" data-size-guide-cards="">
                {rows.map((row, r) => (
                  <div key={r} className="rounded-lg p-4" style={{ border: `1px solid ${borderColor}`, background: isOn(row) ? highlight : undefined }}>
                    <p className="mb-2 font-semibold">{row[0]}</p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {chart.columns.slice(1).map((col, i) => (
                        <div key={i} className="contents">
                          <dt className="opacity-70">
                            {col.name}
                            {col.measure ? ` (${shownUnit})` : ""}
                          </dt>
                          <dd className="tabular-nums">{row[i + 1] || "–"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={cn("overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]", stacked && "hidden @[560px]:block")} data-size-guide-table="">
              <table
                className="w-full text-left text-sm tabular-nums"
                style={{
                  borderCollapse: "separate",
                  borderSpacing: 0,
                  border: chartStyle === "minimal-table" ? "none" : `1px solid ${borderColor}`,
                  borderRadius: 8,
                }}
              >
                <thead>
                  <tr style={{ background: headerBg }}>
                    {chart.columns.map((col, i) => (
                      <th key={i} scope="col" className={cn("whitespace-nowrap p-3 font-semibold", i === 0 && "sticky left-0 z-[1]")} style={i === 0 ? { background: headerBg } : undefined}>
                        {col.name}
                        {col.measure ? <span className="ml-1 font-normal opacity-70">({shownUnit})</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, r) => {
                    const fill = isOn(row) ? highlight : chartStyle === "minimal-table" ? undefined : r % 2 === 1 ? headerBg : undefined
                    return (
                      <tr key={r} style={{ background: fill }} data-highlight={isOn(row) ? "" : undefined}>
                        {chart.columns.map((_, i) =>
                          i === 0 ? (
                            <th key={i} scope="row" className="sticky left-0 z-[1] whitespace-nowrap border-t p-3 font-semibold" style={{ borderColor, background: fill ?? bg }}>
                              {row[0]}
                            </th>
                          ) : (
                            <td key={i} className="whitespace-nowrap border-t p-3" style={{ borderColor }}>
                              {row[i] || <span className="opacity-40">&ndash;</span>}
                            </td>
                          ),
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {fromProduct?.notes ? <p className="mt-3 whitespace-pre-line text-center text-[13px] leading-[1.55] opacity-70">{fromProduct.notes}</p> : null}
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm opacity-60" style={{ borderColor }}>
            Add rows to Table, or give the product a size chart in Products, Size charts
          </p>
        )}
        {!!s.note_text && !fromProduct && <p className="mt-3 text-center text-xs opacity-60">{str(s.note_text)}</p>}
        {showFit && (
          <div className="mt-10 grid items-start gap-6 @[768px]:grid-cols-2">
            {fitImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fitImage} alt="Fit guide" className="w-full rounded object-contain" loading="lazy" decoding="async" />
            ) : inEditor ? (
              <div className="aspect-[3/4] w-full rounded border-2 border-dashed border-current opacity-30" />
            ) : null}
            <div className={cn(!fitImage && !inEditor && "@[768px]:col-span-2")}>
              <h3 className="mb-3 text-lg font-semibold">How to measure</h3>
              <pre className="whitespace-pre-wrap font-sans text-sm opacity-80">{str(s.fit_guide_text)}</pre>
              {showModel && !!s.model_info && <p className="mt-4 text-sm italic opacity-70">{str(s.model_info)}</p>}
            </div>
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

export default SizeGuideSection
