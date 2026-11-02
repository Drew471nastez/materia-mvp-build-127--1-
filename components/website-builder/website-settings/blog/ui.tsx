"use client"

/**
 * The Blog screen's own small parts, drawn in Website Settings' vocabulary
 * (../parts.tsx): a question asked in a sheet, a check box, a select, and the
 * pill row the status filter is.
 */
import * as React from "react"
import { Check, ChevronDown, Loader2, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/**
 * A question in a sheet on a phone and a dialog above it, as Backups asks
 * before a restore: focus starts on Cancel, Tab stays inside, Escape is
 * caught before Website Settings' own (which would close the whole page), and
 * nothing closes it while it works. A refusal is said inside it.
 */
export function BlogDialog({
  title,
  lead,
  children,
  confirmLabel,
  busyLabel,
  destructive = false,
  busy,
  error,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: {
  title: string
  lead?: React.ReactNode
  children?: React.ReactNode
  confirmLabel: string
  busyLabel?: string
  destructive?: boolean
  busy: boolean
  error: string | null
  confirmDisabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const id = React.useId()
  const panel = React.useRef<HTMLDivElement>(null)
  const cancel = React.useRef<HTMLButtonElement>(null)
  const latest = React.useRef({ busy, onCancel })
  React.useEffect(() => {
    latest.current = { busy, onCancel }
  })

  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    /* A field inside takes the first focus; a plain question starts on Cancel, the answer that changes nothing. */
    const field = panel.current?.querySelector<HTMLElement>("input, select, textarea")
    ;(field ?? cancel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        if (!latest.current.busy) latest.current.onCancel()
        return
      }
      const box = panel.current
      if (e.key !== "Tab" || !box) return
      const stops = [...box.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)")]
      const at = document.activeElement
      if (stops.length === 0) e.preventDefault()
      else if (!box.contains(at) || (e.shiftKey && at === stops[0])) {
        e.preventDefault()
        stops[e.shiftKey ? stops.length - 1 : 0].focus()
      } else if (!e.shiftKey && at === stops[stops.length - 1]) {
        e.preventDefault()
        stops[0].focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/60 px-3 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] md:items-center md:p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={panel}
        role={destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={lead ? `${id}-lead` : undefined}
        onClick={(e) => e.stopPropagation()}
        className="wb-settings-in w-full max-w-[460px] rounded-2xl border border-white/10 bg-[#1a1a1a] p-5 text-white shadow-[0_32px_80px_-24px_rgba(0,0,0,0.9)] md:p-6"
      >
        <h2 id={`${id}-title`} className="text-[20px] font-semibold">
          {title}
        </h2>
        {lead && (
          <p id={`${id}-lead`} className="mt-2 text-[15px] leading-relaxed text-white/70">
            {lead}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[14px] leading-snug text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2.5 md:flex md:justify-end">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-11 rounded-xl px-4 text-[15px] font-medium text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white active:bg-white/[0.06] md:h-10 md:text-[14px]"
          >
            {tt("Cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            data-blog-confirm=""
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 md:h-10 md:text-[14px]",
              destructive ? "bg-red-600 text-white" : "bg-white text-[#0f0f0f]",
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * A check box drawn for the dark page (and turned over by the light sheet:
 * white on, near black words, becomes near black on, white words). A real
 * checkbox underneath, so a keyboard and a screen reader have one.
 */
export function CheckBox({ checked, mixed = false, onChange, label }: { checked: boolean; mixed?: boolean; onChange: () => void; label: string }) {
  const on = checked || mixed
  return (
    <label className="relative inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center after:absolute after:-inset-3 after:content-[''] [-webkit-tap-highlight-color:transparent]">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        aria-checked={mixed ? "mixed" : checked}
        aria-label={label}
        onChange={onChange}
      />
      <span
        aria-hidden
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-100 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60",
          on ? "border-transparent bg-white text-[#0f0f0f]" : "border-white/30 bg-white/[0.03]",
        )}
      >
        {mixed ? <Minus className="h-3 w-3" strokeWidth={3} /> : checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
      </span>
    </label>
  )
}

/** A native select, so a phone opens its own picker, in a field's edge and fill. */
export function SelectField({
  value,
  onChange,
  label,
  children,
  className,
  id,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <span className={cn("relative inline-flex min-w-0", className)}>
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full min-w-0 appearance-none truncate rounded-lg border border-white/12 bg-[#171717] pl-3 pr-8 text-[16px] text-white outline-none transition-colors duration-150 focus:border-white/35 md:h-9 md:text-[14px]"
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
    </span>
  )
}

/** A row of filters, one pressed: each a button that says it is, with its count. Scrolls sideways on a phone rather than wrapping. */
export function PillRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="wb-slim-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            data-blog-status={o.id}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[14px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:h-8 md:text-[13.5px] [-webkit-tap-highlight-color:transparent]",
              on ? "bg-white/[0.1] text-white" : "text-white/60 hover:bg-white/[0.05] hover:text-white",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cn("tabular-nums", on ? "text-white/70" : "text-white/40")}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A line of placeholder rows while the list loads. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="divide-y divide-white/[0.07]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4 md:px-6">
          <span className="h-[18px] w-[18px] rounded-[5px] bg-white/[0.06]" />
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3.5 w-2/5 animate-pulse rounded bg-white/[0.08] motion-reduce:animate-none" />
            <span className="h-3 w-1/4 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
          </span>
        </div>
      ))}
    </div>
  )
}
