"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE ADMIN'S OWN SMALL VOCABULARY
 * ===========================================================================
 * Four shapes, used everywhere, so a panel is assembled rather than styled:
 * a card, a stat, a table and a chart.
 *
 * IT IS THE SAME LIGHT SURFACE AS /app, NOT A DARK PANEL. The reference this
 * was modelled on is dark by design, and copying that would have given
 * Storelib a second visual language reachable from the same login — one for
 * the dashboard a creator uses and another for the one an operator uses.
 * CLAUDE.md is explicit that the existing language is preserved, so the page
 * is #f8f9fa, the cards are white with a hairline ring, the accent is the
 * violet already in use, and green and red only ever mean up and down.
 */

/* ── Formatting: one place, so two panels cannot disagree about a number ── */

export const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })

export const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US")

export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "—" : `${n.toFixed(digits)}%`

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return "—"
  const s = Math.max(Math.round(ms / 1000), 0)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/* ── Card ────────────────────────────────────────────────────────────────── */

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function Section({
  title,
  hint,
  right,
  children,
}: {
  title: string
  hint?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb]/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#1a1a2e]">{title}</h2>
          {hint ? <p className="mt-0.5 text-[13px] text-[#6b7280]">{hint}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}

/* ── Stat ────────────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  unavailable,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: "neutral" | "up" | "down"
  /**
   * The reason the figure could not be read. A dashboard that prints 0 for a
   * query that failed is worse than one that prints nothing, because an
   * operator acts on a zero.
   */
  unavailable?: string | null
}) {
  return (
    <Card className="p-4">
      <p className="text-[12px] font-medium uppercase tracking-wider text-[#6b7280]">{label}</p>
      {unavailable ? (
        <>
          <p className="mt-2 text-[20px] font-bold text-[#b91c1c]">Unavailable</p>
          <p className="mt-1 line-clamp-2 text-[12px] text-[#b91c1c]/80" title={unavailable}>
            {unavailable}
          </p>
        </>
      ) : (
        <>
          <p
            className={cn(
              "mt-2 text-[26px] font-bold leading-none tabular-nums",
              tone === "up" && "text-[#15803d]",
              tone === "down" && "text-[#b91c1c]",
              tone === "neutral" && "text-[#1a1a2e]",
            )}
          >
            {value}
          </p>
          {sub ? <p className="mt-1.5 text-[13px] text-[#6b7280]">{sub}</p> : null}
        </>
      )}
    </Card>
  )
}

export function Delta({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-[#6b7280]">no earlier period</span>
  const up = value >= 0
  return (
    <span className={up ? "text-[#15803d]" : "text-[#b91c1c]"}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}% vs the period before
    </span>
  )
}

/* ── Table ───────────────────────────────────────────────────────────────── */

export type Column<T> = {
  key: string
  head: string
  /** Right-align and tabular figures, which is what a number wants. */
  numeric?: boolean
  render: (row: T) => React.ReactNode
}

export function Table<T>({
  columns,
  rows,
  empty = "Nothing here yet.",
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: string
  rowKey: (row: T, i: number) => string
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-[#6b7280]">{empty}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-[#e5e7eb]/60">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]",
                  c.numeric ? "text-right" : "text-left",
                )}
              >
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-[#e5e7eb]/40 last:border-0 hover:bg-[#f8f9fa]">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-5 py-3 text-[#1a1a2e]",
                    c.numeric && "text-right tabular-nums",
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Chart ───────────────────────────────────────────────────────────────── */

/**
 * A bar chart in inline SVG. No charting library: this draws rectangles from
 * one array of numbers, and a dependency that renders rectangles is a
 * dependency to keep in step with React for as long as this page exists.
 *
 * The axis is the series' own maximum, labelled, so a tall bar means
 * something rather than just being tall.
 */
export function BarChart({
  days,
  values,
  format = num,
  colour = "#8b5cf6",
  height = 160,
}: {
  days: string[]
  values: number[]
  format?: (n: number) => string
  colour?: string
  height?: number
}) {
  const max = Math.max(1, ...values)
  const total = values.reduce((a, b) => a + b, 0)

  return (
    <div className="px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between text-[13px] text-[#6b7280]">
        <span>
          Peak <span className="font-semibold text-[#1a1a2e]">{format(max)}</span>
        </span>
        <span>
          Total <span className="font-semibold text-[#1a1a2e]">{format(total)}</span>
        </span>
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {values.map((v, i) => (
          <div
            key={days[i] ?? i}
            className="group relative flex-1 rounded-t-[3px] transition-[height] duration-300"
            style={{
              height: `${Math.max((v / max) * 100, v > 0 ? 3 : 1)}%`,
              backgroundColor: v > 0 ? colour : "#e5e7eb",
            }}
            title={`${days[i]}: ${format(v)}`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[#6b7280]">
        <span>{days[0]}</span>
        <span>{days[days.length - 1]}</span>
      </div>
    </div>
  )
}

/* ── Loading and failure ─────────────────────────────────────────────────── */

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-[#eef0f3]" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function Problems({ problems }: { problems: { metric: string; table: string; reason: string }[] }) {
  if (!problems.length) return null
  return (
    <Card className="border-[#fecaca] bg-[#fef2f2] p-4">
      <p className="text-[13px] font-semibold text-[#b91c1c]">
        {problems.length} {problems.length === 1 ? "query" : "queries"} could not be read
      </p>
      <ul className="mt-2 space-y-1">
        {problems.map((p, i) => (
          <li key={i} className="text-[13px] text-[#b91c1c]/90">
            <span className="font-medium">{p.metric}</span> ({p.table}): {p.reason}
          </li>
        ))}
      </ul>
    </Card>
  )
}
