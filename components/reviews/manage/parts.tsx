"use client"

/**
 * The small pieces every view of Storelib Reviews' page shares: the card,
 * the section heading, a figure with its label, the tab strip, a date, and a
 * read that keeps the last answer while the next one comes (so a filter
 * change never blanks the list).
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { api } from "@/components/physical/ui"
import { appLocale, zoned } from "@/lib/i18n/format"
import { FillBar } from "@/components/ui/fill-bar"

/* The integration page's card (components/app/settings/integrations-directory DEPTH): a hairline, a contact shadow and a soft one under it. */
export const CARD = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.14)]"
export const CARD_HEAD = "flex min-h-[52px] flex-wrap items-center justify-between gap-2 border-b border-[#f1f2f4] px-4 py-3 sm:px-5"
export const H3 = "text-[15px] font-semibold text-[#1a1a2e]"
export const MUTED = "text-[13px] leading-[19px] text-[#6b7280]"

export const SELECT =
  "h-10 w-full cursor-pointer appearance-none truncate rounded-lg border border-[#e3e4e8] bg-white py-0 pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-8 md:w-auto md:max-w-[220px] md:text-[13px]"

export const SEG = (selected: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium transition-colors duration-100 md:h-8 md:rounded-lg md:text-[13px]",
    selected ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
  )

export function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7280]">
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A select in the list's toolbar: a full width row on a phone, compact beside the others from 768px. */
export function ToolbarSelect({ label, value, onChange, children, className, ...rest }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value">) {
  return (
    <label className={cn("relative min-w-0 flex-1 md:flex-none", className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT} {...rest}>
        {children}
      </select>
      <Chevron />
    </label>
  )
}

export function shortDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", year: "numeric" }))
}

export function formatCount(n: number): string {
  try {
    return new Intl.NumberFormat(appLocale()).format(n)
  } catch {
    return String(n)
  }
}

/** A figure with its label above it; `sub` is a quiet line under it. */
export function Figure({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="truncate text-[12.5px] text-[#6b7280]">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.01em] text-[#1a1a2e]">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">{sub}</p> : null}
    </div>
  )
}

/** The five rows of stars with a bar each. */
export function Distribution({ rows, total }: { rows: { stars: number; count: number }[]; total: number }) {
  const most = Math.max(1, ...rows.map((r) => r.count))
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.stars} className="grid grid-cols-[14px_minmax(0,1fr)_40px] items-center gap-2 text-[12.5px] text-[#6b7280]">
          <span className="tabular-nums">{r.stars}</span>
          <FillBar quiet value={r.count} max={most} />
          <span className="text-right tabular-nums" title={total ? `${Math.round((r.count / total) * 100)}%` : undefined}>
            {formatCount(r.count)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A read from one of the page's routes. The answer stays on screen while
 * the next read runs (`loading` says one is running), so changing a filter
 * dims the list instead of emptying it.
 */
export function useRead<T>(path: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => void; set: React.Dispatch<React.SetStateAction<T | null>> } {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!path) return
    let live = true
    setLoading(true)
    void api<T>(path).then((r) => {
      if (!live) return
      setLoading(false)
      if (r.ok) {
        setData(r.data)
        setError(null)
      } else setError(errorOf(r))
    })
    return () => {
      live = false
    }
  }, [path, tick])
  const reload = React.useCallback(() => setTick((n) => n + 1), [])
  return { data, error, loading, reload, set: setData }
}

/** Why a read or a write did not go through (the result's own words). */
export function errorOf(r: unknown): string {
  return ((r as { error?: unknown }).error as string) || ""
}

/** A grey block the size of what is coming, only while nothing has arrived yet. */
export function Placeholder({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-[#f3f4f6]", className)} />
}

/** A bottom sheet on a phone, a centred box from 640px: the frame every dialog on the page uses. */
export function Sheet({ title, onClose, busy, children, footer, wide, labelId }: { title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean; labelId: string }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [busy, onClose])
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className={cn("relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl", wide ? "sm:max-w-[760px]" : "sm:max-w-md")}>
        <h3 id={labelId} className="px-5 pt-5 text-[17px] font-semibold text-[#1a1a2e]">
          {title}
        </h3>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">{children}</div>
        {footer ? <div className="flex gap-2 border-t border-[#f1f2f4] px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div> : null}
      </div>
    </div>
  )
}
