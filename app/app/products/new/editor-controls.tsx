"use client"

import { cn } from "@/lib/utils"

/**
 * A switch, drawn for this form: a track and a knob that slides, the /app
 * violet when on. A real button with role="switch", so it is a 44px press on
 * a phone and a key press on a computer.
 */
export function FormSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group relative -m-2 inline-flex shrink-0 cursor-pointer items-center p-2 outline-none"
    >
      <span
        className={cn(
          "relative block h-7 w-[46px] rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[#8b5cf6] group-focus-visible:ring-offset-2 sm:h-6 sm:w-10",
          checked ? "bg-[#8b5cf6]" : "bg-[#e1e3e8]",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(17,24,39,0.25)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] sm:h-5 sm:w-5",
            checked ? "translate-x-[18px] sm:translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  )
}

/**
 * A setting as one row of a grouped list: what it is, a line on what it
 * does, and its switch at the end. The whole row turns it, as a row does in a
 * phone's own settings.
 */
export function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div
      className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5 active:bg-[#f6f7f8] sm:min-h-[52px] sm:active:bg-transparent"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[role=switch]")) return
        onChange(!checked)
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">{title}</p>
        {hint ? <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{hint}</p> : null}
      </div>
      <FormSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

/** The group a SwitchRow sits in: one rounded block, a hairline between rows. */
export const SWITCH_GROUP = "divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]"

/**
 * Two or three choices of which exactly one is on, side by side in one
 * track, the chosen one lifted onto white. A radio group underneath, so the
 * arrow keys move it and a screen reader reads it as one.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid rounded-[10px] bg-[#eceef1] p-0.5"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]
        onChange(next.value)
        ;(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-10 truncate rounded-lg px-3 text-[15px] font-medium outline-none transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:h-8 sm:rounded-md sm:text-[13px]",
              on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12),0_0_0_0.5px_rgba(17,24,39,0.06)]" : "text-[#4b5563] hover:text-[#1a1a2e]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
