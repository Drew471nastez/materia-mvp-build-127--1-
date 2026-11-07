"use client"

/**
 * ===========================================================================
 *  THE SMALL TREND CHART OF A REPORT CARD, READ THE WAY THE BIG ONE IS
 * ===========================================================================
 * The Page views, Visits, Link clicks and Refunds cards and the Sales over
 * time card each drew a line of their own in an SVG nobody could point at:
 * one marked the busiest bucket, the other re-rendered React on every
 * pointer move. Now each draws the two layers the figures' chart at the top
 * of Analytics draws:
 *
 *   components/app/morph-lines   the line, its soft fill and the dashed
 *                                period it is compared with; new numbers (a
 *                                range, a refresh, the first answer) move
 *                                every point from where it is drawn, so a
 *                                card never blinks from one line to the next
 *   components/app/chart-scrub   the crosshair, the dots and the readout,
 *                                moved by transforms, light on a card; a
 *                                finger scrubs sideways and the page keeps
 *                                the vertical
 *
 * So every chart on Analytics has the same hover, and the readout lists this
 * period and the one it is compared with at the point under the pointer.
 * The values a hover shows are also the line's accessible name and rows of
 * the export, so nothing is reached only by hovering.
 */
import * as React from "react"
import { ChartScrub, type ScrubRow, type ScrubSeries } from "@/components/app/chart-scrub"
import { MorphLines } from "@/components/app/morph-lines"
import { fixedScale } from "@/components/app/chart-morph"
import { tt } from "@/lib/i18n/text"
import { nothingToDraw } from "./empty-state"

const ACCENT = "#8b5cf6"
const COMPARED = "#b8bcc6"
/** Room for the end dot and its ring at the top and the right. */
const TOP = 6
const RIGHT = 6
const BOTTOM = 2

export interface TrendMiniChartProps {
  /** The bucket names, the same the figures' chart reads ("Oct 21"). */
  labels: string[]
  current: number[]
  /** The period it is compared with, bucket for bucket; empty for none. */
  previous: number[]
  format: (n: number) => string
  /** The plot's height in pixels. */
  height: number
  /** A count steps its scale in whole numbers. */
  integer?: boolean
  /** The readout's name for this period's line. */
  label?: string
  /** Nothing to read yet: a grey line on the floor and no readout. */
  loading?: boolean
  /** Where the readout floats, from the chart's top: above a short plot, so it never covers the line it reads. */
  readoutTop?: number
  /** Round 51: the one short line over a chart with nothing to draw ("No sales in this period."). */
  emptyText?: string
}

function TrendMiniChartInner({ labels, current, previous, format, height, integer = true, label, loading = false, readoutTop = -58, emptyText }: TrendMiniChartProps) {
  const n = current.length
  /* Nothing in this period or the one it is compared with. Changed on purpose (round AL): the line lies flat on the floor in its own purple, as it did before round 51, with no grey shape over it. */
  const blank = !loading && nothingToDraw(current, previous)
  const compared = previous.length > 0
  const before = React.useMemo(() => (compared ? current.map((_, i) => previous[i] ?? 0) : null), [compared, current, previous])
  const top = React.useMemo(() => fixedScale(Math.max(0, ...current, ...(before ?? [])), integer).top, [current, before, integer])
  const plotHeight = height - TOP - BOTTOM
  const yOf = React.useCallback((v: number) => TOP + (1 - Math.max(0, v) / (top || 1)) * plotHeight, [top, plotHeight])
  const lines = React.useMemo(() => [current], [current])

  const series = React.useMemo<ScrubSeries[]>(
    () => [...(before ? [{ ys: before.map(yOf), color: COMPARED, hollow: true }] : []), { ys: current.map(yOf), color: ACCENT }],
    [before, current, yOf],
  )
  const rows = React.useMemo<ScrubRow[]>(
    () => [
      { label: label ?? tt("This period"), value: (i) => format(current[i] ?? 0), mark: "line", tone: "value", color: ACCENT },
      ...(before ? [{ label: tt("Compared"), value: (i: number) => format(before[i] ?? 0), mark: "dashed", tone: "compared", color: COMPARED } as ScrubRow] : []),
    ],
    [label, format, current, before],
  )
  const title = React.useCallback((i: number) => labels[i] ?? "", [labels])

  return (
    <div
      role="img"
      aria-label={current.map((v, i) => `${labels[i] ?? ""}: ${format(v)}`).join(", ")}
      data-trend-chart=""
      className="relative"
      style={{ height }}
    >
      <span aria-hidden className="absolute inset-x-0 h-px bg-[#eef0f2]" style={{ top: TOP + plotHeight }} />
      {emptyText ? (
        <p aria-hidden={!blank} data-empty={blank ? "" : undefined} className="pointer-events-none absolute left-0 top-0 text-[13px] leading-5 text-[#6b7280] transition-opacity duration-200 ease-out" style={{ opacity: blank ? 1 : 0 }}>
          {emptyText}
        </p>
      ) : null}
      <MorphLines lines={lines} compared={before} top={top} left={0} right={RIGHT} plotTop={TOP} plotHeight={plotHeight} loading={loading} color={ACCENT} comparedColor={COMPARED} />
      <ChartScrub count={n} left={0} right={RIGHT} top={TOP} bottom={TOP + plotHeight} series={series} title={title} rows={rows} disabled={loading || blank || n === 0} tone="light" readoutTop={readoutTop} crosshairColor="#d1d5db" />
    </div>
  )
}

/** Memoised: a card hands it the answer's own arrays, so a render above it does not reach the chart. */
export const TrendMiniChart = React.memo(TrendMiniChartInner)
