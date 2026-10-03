"use client"

import * as React from "react"

import type { Problem } from "@/lib/admin/types"

import { statusWord, tone } from "./format"

/**
 * ===========================================================================
 *  THE ADMIN'S OWN SMALL VOCABULARY, ON A DARK SURFACE
 * ===========================================================================
 * The owner asked for a dark console. It is a separate room from /app, used
 * by one person, so it gets its own surface rather than a second copy of the
 * creator dashboard: near black (#0b0b0f) behind, #111116 for a panel, one
 * hairline (white at 8%) for every edge, Inter, and one accent, Storelib's
 * violet, kept for the thing that is selected and the thing that has focus.
 *
 * No gradients, no glow, no icons beside labels. Colour carries meaning only:
 * a small dot in green, amber or red beside a status word, red on the one
 * button that destroys something. Everything else is type and spacing.
 *
 * Figures sit in one panel divided by hairlines, not in a grid of identical
 * cards, and a figure that could not be read says so where the number would
 * have been.
 */

export const C = {
  page: "#0b0b0f",
  panel: "#111116",
  raised: "#17171d",
  line: "rgba(255,255,255,0.08)",
  text: "#ededf0",
  muted: "#9b9ba6",
  faint: "#6b6b76",
  accent: "#8b5cf6",
  good: "#3fb950",
  wait: "#d4a72c",
  bad: "#f47067",
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

/* ── Panel ─────────────────────────────────────────────────────────────── */

export function Panel({
  title,
  meta,
  action,
  children,
  className,
  id,
}: {
  title?: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-[10px] border border-white/[0.08] bg-[#111116]", className)}>
      {title || action ? (
        <header className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-white/[0.08] px-4 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            {title ? <h2 className="shrink-0 text-[13px] font-semibold text-[#ededf0]">{title}</h2> : null}
            {meta ? <span className="truncate text-[12px] text-[#6b6b76]">{meta}</span> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/* ── Figures: one panel, divided, not a grid of cards ──────────────────── */

export type FigureItem = {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  /** Set when the value could not be read: the reason, in plain words. */
  unreadable?: string | null
}

export function Figures({ items, columns = 4 }: { items: FigureItem[]; columns?: 2 | 3 | 4 | 5 }) {
  const desktop = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[columns]
  return (
    <div className={cx("grid grid-cols-2 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111116]", desktop)}>
      {items.map((f) => (
        <div
          key={f.label}
          data-figure={f.label}
          className="min-w-0 border-b border-r border-white/[0.08] px-4 py-3.5 [margin:0_-1px_-1px_0]"
        >
          <p className="truncate text-[12px] text-[#9b9ba6]">{f.label}</p>
          {f.unreadable ? (
            <Unreadable reason={f.unreadable} />
          ) : (
            <>
              <p className="mt-1 truncate text-[22px] font-semibold leading-7 tabular-nums tracking-[-0.01em] text-[#ededf0]">{f.value}</p>
              {f.sub ? <p className="mt-0.5 truncate text-[12px] text-[#6b6b76] tabular-nums">{f.sub}</p> : null}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export function Unreadable({ reason }: { reason: string }) {
  return (
    <div className="mt-1" data-unreadable>
      <p className="text-[13px] font-medium text-[#d4a72c]">Could not be read</p>
      <p className="mt-0.5 line-clamp-3 text-[12px] leading-4 text-[#9b9ba6]">{reason}</p>
    </div>
  )
}

/** The reason one named read failed, from the view's problems. */
export function reasonFor(problems: Problem[] | undefined, ...metrics: string[]): string | null {
  for (const m of metrics) {
    const p = problems?.find((x) => x.metric === m)
    if (p) return p.reason
  }
  return null
}

/* ── What could not be read, said once at the top of a view ────────────── */

export function ReadNotes({ problems, notices }: { problems?: Problem[]; notices?: string[] }) {
  const [open, setOpen] = React.useState(false)
  const list = problems ?? []
  if (!list.length && !(notices ?? []).length) return null
  return (
    <div className="space-y-2" data-read-notes>
      {list.length ? (
        <div className="rounded-[10px] border border-[#d4a72c]/30 bg-[#d4a72c]/[0.06] px-4 py-3">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
            <span className="text-[13px] text-[#ededf0]">
              {list.length === 1 ? "1 query could not be read." : `${list.length} queries could not be read.`}
              <span className="text-[#9b9ba6]"> The rest of this page is current.</span>
            </span>
            <span className="shrink-0 text-[12px] text-[#9b9ba6]">{open ? "Hide" : "Show why"}</span>
          </button>
          {open ? (
            <ul className="mt-2 space-y-1.5 border-t border-white/[0.08] pt-2">
              {list.map((p) => (
                <li key={`${p.metric}-${p.table}`} className="text-[12px] leading-4">
                  <span className="text-[#ededf0]">{p.metric}</span>
                  <span className="text-[#6b6b76]"> ({p.table}) </span>
                  <span className="text-[#9b9ba6]">{p.reason}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {(notices ?? []).map((n) => (
        <p key={n} className="rounded-[10px] border border-white/[0.08] px-4 py-2.5 text-[12px] text-[#9b9ba6]">
          {n}
        </p>
      ))}
    </div>
  )
}

/* ── Status: a dot and a word ──────────────────────────────────────────── */

export function Status({ value, label }: { value: string | null | undefined; label?: string }) {
  const t = tone(value)
  const colour = t === "good" ? C.good : t === "wait" ? C.wait : t === "bad" ? C.bad : C.faint
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px] text-[#c9c9d1]">
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colour }} />
      <span className="truncate">{label ?? statusWord(value)}</span>
    </span>
  )
}

/* ── Buttons ───────────────────────────────────────────────────────────── */

export function Button({
  children,
  variant = "plain",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "plain" | "primary" | "danger" | "quiet" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 disabled:cursor-default disabled:opacity-50",
        variant === "plain" && "border border-white/[0.1] bg-[#17171d] text-[#ededf0] hover:bg-[#1d1d24]",
        variant === "primary" && "bg-[#ededf0] text-[#0b0b0f] hover:bg-white",
        variant === "danger" && "bg-[#da3633] text-white hover:bg-[#e5484d]",
        variant === "quiet" && "text-[#9b9ba6] hover:bg-white/[0.05] hover:text-[#ededf0]",
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ── Search and filters ────────────────────────────────────────────────── */

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="relative block min-w-0 flex-1 sm:max-w-[340px]">
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-10 w-full rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 text-[14px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70 sm:h-9"
      />
    </label>
  )
}

export function Filters<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex min-w-0 max-w-full gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "h-10 shrink-0 rounded-[7px] px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 sm:h-8",
            value === o.id ? "bg-white/[0.08] text-[#ededf0]" : "text-[#9b9ba6] hover:text-[#ededf0]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">{children}</div>
}

/* ── A list that is a table on a desk and two lines on a phone ─────────── */

export type Column<T> = {
  key: string
  label: string
  /** CSS grid track on a wide screen, e.g. "minmax(0,2fr)" or "96px". */
  width: string
  align?: "left" | "right"
  render: (row: T) => React.ReactNode
  /** On a phone: the first line, the second line, or not shown. */
  phone?: "primary" | "secondary" | "hide" | "end"
}

export function DataList<T>({
  columns,
  rows,
  rowKey,
  empty,
  onOpen,
  label,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  empty: string
  onOpen?: (row: T) => void
  label: string
}) {
  const template = columns.map((c) => c.width).join(" ")
  if (!rows.length) return <p className="px-4 py-8 text-center text-[13px] text-[#6b6b76]">{empty}</p>
  return (
    <div role="table" aria-label={label} className="min-w-0">
      <div role="row" className="hidden gap-3 border-b border-white/[0.08] px-4 py-2 lg:grid" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className={cx("truncate text-[12px] font-medium text-[#6b6b76]", c.align === "right" && "text-right")}>
            {c.label}
          </span>
        ))}
      </div>
      {rows.map((row) => {
        const primary = columns.filter((c) => (c.phone ?? "secondary") === "primary")
        const secondary = columns.filter((c) => (c.phone ?? "secondary") === "secondary")
        const end = columns.filter((c) => c.phone === "end")
        const inner = (
          <>
            {/* Wide: every column in its track. */}
            <div className="hidden min-h-7 items-center gap-3 lg:grid" style={{ gridTemplateColumns: template }}>
              {columns.map((c) => (
                <div key={c.key} role="cell" className={cx("min-w-0 truncate text-[13px] text-[#c9c9d1]", c.align === "right" && "text-right tabular-nums")}>
                  {c.render(row)}
                </div>
              ))}
            </div>
            {/* Narrow: what matters on the first line, the rest under it. */}
            <div className="flex min-w-0 items-start justify-between gap-3 lg:hidden">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2 text-[14px] text-[#ededf0]">
                  {primary.map((c) => (
                    <div key={c.key} className="min-w-0 truncate">
                      {c.render(row)}
                    </div>
                  ))}
                </div>
                {secondary.length ? (
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[#9b9ba6]">
                    {secondary.map((c) => (
                      <div key={c.key} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
                        {c.render(row)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {end.length ? (
                <div className="shrink-0 text-right text-[13px] tabular-nums text-[#ededf0]">
                  {end.map((c) => (
                    <div key={c.key}>{c.render(row)}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        )
        return onOpen ? (
          <div
            key={rowKey(row)}
            role="row"
            tabIndex={0}
            onClick={() => onOpen(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(row)
            }}
            className="cursor-pointer border-b border-white/[0.06] px-4 py-2.5 outline-none transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:bg-white/[0.05]"
            data-row
          >
            {inner}
          </div>
        ) : (
          <div key={rowKey(row)} role="row" className="border-b border-white/[0.06] px-4 py-2.5 last:border-b-0" data-row>
            {inner}
          </div>
        )
      })}
    </div>
  )
}

/* ── Pages ─────────────────────────────────────────────────────────────── */

export function Pager({ page, pages, total, size = 25, onPage }: { page: number; pages: number; total: number; size?: number; onPage: (p: number) => void }) {
  if (total <= size && page === 1) {
    return <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] text-[#6b6b76] tabular-nums">{total === 1 ? "1 row" : `${total.toLocaleString("en-US")} rows`}</p>
  }
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2">
      <p className="text-[12px] text-[#6b6b76] tabular-nums">
        {from.toLocaleString("en-US")} to {to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
      <div className="flex gap-1.5">
        <Button variant="quiet" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-10 sm:h-8">
          Previous
        </Button>
        <Button variant="quiet" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-10 sm:h-8">
          Next
        </Button>
      </div>
    </div>
  )
}

/* ── A 30 day bar chart, drawn rather than imported ────────────────────── */

export function Bars({ values, days, format, label }: { values: number[]; days: string[]; format: (v: number) => string; label: string }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const max = Math.max(1, ...values)
  const shown = hover ?? values.length - 1
  return (
    <div className="px-4 pb-4 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-[#9b9ba6] tabular-nums">{days[shown] ? new Date(`${days[shown]}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}</p>
        <p className="text-[13px] font-medium text-[#ededf0] tabular-nums">{format(values[shown] ?? 0)}</p>
      </div>
      <div
        role="img"
        aria-label={label}
        className="mt-2 flex h-[120px] items-end gap-[2px]"
        onMouseLeave={() => setHover(null)}
      >
        {values.map((v, i) => (
          <div
            key={days[i] ?? i}
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <div
              className="w-full rounded-t-[2px]"
              style={{
                height: `${v > 0 ? Math.max(2, (v / max) * 100) : 1}%`,
                background: i === shown ? C.accent : v > 0 ? "rgba(237,237,240,0.28)" : "rgba(255,255,255,0.06)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── A small row of label and value, for detail pages ──────────────────── */

export function Facts({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-white/[0.06]">
      {items.map((f) => (
        <div key={f.label} className="flex min-w-0 items-baseline justify-between gap-4 px-4 py-2">
          <dt className="shrink-0 text-[13px] text-[#9b9ba6]">{f.label}</dt>
          <dd className="min-w-0 truncate text-right text-[13px] text-[#ededf0] tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── Shown only if the wait is long enough to notice ───────────────────── */

export function Delayed({ ms = 350, children }: { ms?: number; children: React.ReactNode }) {
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setShow(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return show ? <>{children}</> : null
}

export function Placeholder({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden data-placeholder>
      <div className="h-[84px] rounded-[10px] border border-white/[0.06] bg-white/[0.02]" />
      <div className="rounded-[10px] border border-white/[0.06]">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-11 border-b border-white/[0.04] last:border-b-0" />
        ))}
      </div>
    </div>
  )
}

/* ── Confirmation, as a real dialog ────────────────────────────────────── */

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: React.ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  React.useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault()
      }}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-[14px] border border-white/[0.1] bg-[#111116] p-0 text-[#ededf0] backdrop:bg-black/60 sm:m-auto sm:w-[440px] sm:rounded-[12px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {open ? (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault()
            onConfirm()
          }}
          className="p-5"
        >
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <div className="mt-2 space-y-3 text-[13px] leading-5 text-[#9b9ba6]">{children}</div>
          {error ? <p className="mt-3 text-[13px] text-[#f47067]" role="alert">{error}</p> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="quiet" onClick={onClose} disabled={busy} className="h-10 sm:h-9">
              Cancel
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy} className="h-10 sm:h-9">
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-[#9b9ba6]">{label}</span>
      <textarea
        rows={2}
        {...rest}
        className="w-full resize-none rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-3 py-2 text-[14px] text-[#ededf0] outline-none placeholder:text-[#6b6b76] focus:border-[#8b5cf6]/70"
      />
    </label>
  )
}

export function Banner({ tone: t = "plain", children, onClose }: { tone?: "plain" | "good" | "bad"; children: React.ReactNode; onClose?: () => void }) {
  const edge = t === "good" ? "border-[#3fb950]/30" : t === "bad" ? "border-[#f47067]/40" : "border-white/[0.1]"
  return (
    <div role="status" className={cx("flex items-start justify-between gap-3 rounded-[10px] border bg-[#111116] px-4 py-2.5 text-[13px] text-[#ededf0]", edge)}>
      <div className="min-w-0">{children}</div>
      {onClose ? (
        <button type="button" onClick={onClose} className="-my-2.5 min-h-10 shrink-0 px-1 text-[12px] text-[#9b9ba6] hover:text-[#ededf0] sm:-my-0 sm:min-h-0 sm:px-0">
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

export function LinkText({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="min-w-0 max-w-full truncate text-left text-[#ededf0] underline decoration-white/20 underline-offset-2 hover:decoration-white/60"
    >
      {children}
    </button>
  )
}
