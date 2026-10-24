"use client"

/**
 * ===========================================================================
 *  A PRODUCT'S SIZE CHART, ON A STORELIB THEME'S PRODUCT PAGE
 * ===========================================================================
 * Two ways in, one table:
 *
 *   the Size guide link   beside the size option in the variant picker,
 *                         drawn by itself when the product has a chart
 *                         (the picker's "Size guide link" setting)
 *   the Size chart block  a link or a button the creator places anywhere in
 *                         the main product section
 *
 * Either opens the chart over the page: a pop-up or a side panel on a
 * computer (the block's "Opens as"), a sheet from the bottom on a phone.
 * The table can be read in cm or in, converted by lib/size-charts/model.ts
 * (only the columns that are measurements), and the size the buyer has
 * chosen is marked in it.
 *
 * The chart is the product's own (`product.size_chart`, read with the rest
 * of the product by lib/products/product-section-data.ts), so another
 * product's page shows another chart, live and in the builder alike.
 * Everything in it is plain text the seller typed, drawn as text.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Ruler, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasMeasurements, rowsIn, type SizeChart, type SizeUnit } from "@/lib/size-charts/model"
import type { SectionPalette } from "../../_shared"

const UNIT_KEY = "storelib_size_unit"

function storedUnit(): SizeUnit | null {
  try {
    const v = window.localStorage.getItem(UNIT_KEY)
    return v === "cm" || v === "in" ? v : null
  } catch {
    return null
  }
}

function keepUnit(unit: SizeUnit) {
  try {
    window.localStorage.setItem(UNIT_KEY, unit)
  } catch {
    /* Storage refused: the chart opens in its own unit next time. */
  }
}

/** The table, in `unit`, with the chosen size's row marked. */
export function SizeChartTable({ chart, unit, palette, chosen }: { chart: SizeChart; unit: SizeUnit; palette: SectionPalette; chosen?: string | null }) {
  const rows = rowsIn(chart, unit)
  const line = palette.border
  const muted = palette.text_muted ?? palette.paragraph
  const mark = chosen ? chosen.trim().toLowerCase() : ""
  return (
    <div className="-mx-1 overflow-x-auto px-1" data-size-chart-table="">
      <table className="w-full border-collapse text-left text-[14px] tabular-nums" style={{ color: palette.text }}>
        <thead>
          <tr>
            {chart.columns.map((c, i) => (
              <th
                key={i}
                scope="col"
                className={cn("whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold", i === 0 && "sticky left-0 z-[1] pl-0")}
                style={{ borderBottom: `1px solid ${line}`, color: palette.heading, background: i === 0 ? palette.bg : undefined }}
              >
                {c.name}
                {c.measure ? <span className="ml-1 font-normal" style={{ color: muted }}>({unit})</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const on = !!mark && (row[0] ?? "").trim().toLowerCase() === mark
            return (
              <tr key={r} data-chosen={on ? "" : undefined} style={on ? { background: `color-mix(in srgb, ${palette.heading} 7%, transparent)` } : undefined}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="sticky left-0 z-[1] whitespace-nowrap py-2.5 pl-0 pr-3 font-medium" style={{ borderBottom: `1px solid ${line}`, color: palette.heading, background: on ? undefined : palette.bg }}>
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="whitespace-nowrap px-3 py-2.5" style={{ borderBottom: `1px solid ${line}` }}>
                      {cell || <span style={{ color: muted }}>&ndash;</span>}
                    </td>
                  ),
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function UnitSwitch({ unit, onChange, palette }: { unit: SizeUnit; onChange: (u: SizeUnit) => void; palette: SectionPalette }) {
  return (
    <div role="radiogroup" aria-label="Units" className="inline-flex rounded-full p-[3px]" style={{ background: `color-mix(in srgb, ${palette.heading} 7%, transparent)` }} data-size-units="">
      {(["cm", "in"] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={unit === u}
          onClick={() => onChange(u)}
          className="h-8 min-w-[48px] rounded-full px-3 text-[13px] font-medium transition-colors"
          style={unit === u ? { background: palette.bg, color: palette.heading, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: palette.text_muted ?? palette.paragraph }}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

/** Whether the page is phone width, where the chart rises from the bottom. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)")
    const set = () => setPhone(q.matches)
    set()
    q.addEventListener("change", set)
    return () => q.removeEventListener("change", set)
  }, [])
  return phone
}

/**
 * The chart over the page. Drawn into the builder's canvas frame when it is
 * in one (which holds fixed positioning, so it covers the canvas, never the
 * editor's bars), else onto the page's body, out of any section's stacking.
 */
export function SizeChartDialog({ chart, open, onClose, opens, palette, radius, chosen, anchor, closeLabel }: { chart: SizeChart; open: boolean; onClose: () => void; opens: "modal" | "drawer"; palette: SectionPalette; radius: string; chosen?: string | null; anchor: HTMLElement | null; closeLabel: string }) {
  const phone = usePhone()
  const [unit, setUnit] = useState<SizeUnit>(chart.unit)
  const [shown, setShown] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const convertible = hasMeasurements(chart)

  useEffect(() => {
    if (!open) {
      setShown(false)
      return
    }
    setUnit(convertible ? storedUnit() ?? chart.unit : chart.unit)
    const raf = requestAnimationFrame(() => setShown(true))
    const focus = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 30)
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", key)
    const inCanvas = !!anchor?.closest(".wb-canvas-frame")
    const html = document.documentElement
    const before = html.style.overflow
    if (!inCanvas) html.style.overflow = "hidden"
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(focus)
      window.removeEventListener("keydown", key)
      if (!inCanvas) html.style.overflow = before
    }
  }, [open, onClose, anchor, chart.unit, convertible])

  if (!open || typeof document === "undefined") return null
  const target = anchor?.closest<HTMLElement>(".wb-canvas-frame") ?? document.body
  const shape = phone ? "sheet" : opens
  const surface: CSSProperties = { background: palette.bg, color: palette.text }
  const panel =
    shape === "sheet"
      ? cn("absolute inset-x-0 bottom-0 max-h-[88%] rounded-t-[18px] pb-[max(16px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out", shown ? "translate-y-0" : "translate-y-full")
      : shape === "drawer"
        ? cn("absolute inset-y-0 right-0 w-full max-w-[520px] transition-transform duration-300 ease-out", shown ? "translate-x-0" : "translate-x-full")
        : cn("relative mx-4 max-h-[min(86%,760px)] w-full max-w-[680px] transition-[opacity,transform] duration-200", shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")

  return createPortal(
    <div className={cn("fixed inset-0 z-[70]", shape === "modal" && "flex items-center justify-center")} role="presentation" data-size-chart-dialog={shape} onClick={(e) => e.stopPropagation()}>
      <div className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("flex flex-col overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.25)] motion-reduce:transition-none", panel)}
        style={{ ...surface, ...(shape === "modal" ? { borderRadius: `calc(${radius} + 6px)` } : {}) }}
      >
        {shape === "sheet" ? <span aria-hidden className="mx-auto mt-2 block h-1 w-10 shrink-0 rounded-full" style={{ background: palette.border }} /> : null}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-[18px] font-semibold leading-6" style={{ color: palette.heading }}>
            {chart.name}
          </h2>
          <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors" style={{ background: `color-mix(in srgb, ${palette.heading} 7%, transparent)`, color: palette.heading }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
          {convertible ? (
            <div className="mb-3 mt-1">
              <UnitSwitch
                unit={unit}
                palette={palette}
                onChange={(u) => {
                  setUnit(u)
                  keepUnit(u)
                }}
              />
            </div>
          ) : null}
          {chart.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={chart.imageUrl} alt="" className="mb-4 max-h-[260px] w-auto max-w-full object-contain" style={{ borderRadius: radius }} />
          ) : null}
          <SizeChartTable chart={chart} unit={unit} palette={palette} chosen={chosen} />
          {chart.notes ? (
            <p className="mt-4 whitespace-pre-line text-[13.5px] leading-[1.55]" style={{ color: palette.text_muted ?? palette.paragraph }}>
              {chart.notes}
            </p>
          ) : null}
        </div>
      </div>
    </div>,
    target,
  )
}

/** The link or button that opens the chart, and the chart it opens. */
export function SizeGuideOpener({
  chart,
  label,
  look,
  opens,
  icon,
  color,
  palette,
  radius,
  buttonRadius,
  chosen,
  inert,
  closeLabel,
  className,
}: {
  chart: SizeChart
  label: ReactNode
  look: "link" | "button"
  opens: "modal" | "drawer"
  icon: boolean
  color: string
  palette: SectionPalette
  radius: string
  buttonRadius?: CSSProperties
  chosen?: string | null
  /** The builder's inspector is on: a press selects the block, it opens nothing. */
  inert?: boolean
  closeLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const close = useRef(() => setOpen(false)).current
  const button = look === "button"
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          if (inert) return
          e.stopPropagation()
          setOpen(true)
        }}
        className={cn("inline-flex items-center gap-1.5 text-[13.5px] font-medium transition-opacity hover:opacity-75", button && "h-11 w-full justify-center gap-2 border px-4 text-[14px]", className)}
        style={{ color, ...(button ? { borderColor: palette.border, ...buttonRadius } : {}) }}
        data-size-guide=""
      >
        {icon ? <Ruler className="h-4 w-4 shrink-0" aria-hidden /> : null}
        <span className={button ? "" : "underline underline-offset-4"}>{label}</span>
      </button>
      <SizeChartDialog chart={chart} open={open} onClose={close} opens={opens} palette={palette} radius={radius} chosen={chosen} anchor={ref.current} closeLabel={closeLabel} />
    </>
  )
}
