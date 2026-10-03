"use client"

/**
 * The control for `number`: a box that keeps to its min, max and step, with
 * the setting's `unit` (px, %, s, $) shown inside the right edge of the
 * field, so "24" is never a number without saying what of. Typing is free;
 * the value is held to min and max when the field is left, so a half typed
 * "1" on the way to "12" is not snapped to the minimum under the cursor.
 */
import * as React from "react"

import { INPUT } from "./styles"

export function NumberControl({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  placeholder,
  label,
}: {
  value: unknown
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  label?: string
}) {
  const current = typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null
  const [draft, setDraft] = React.useState<string>(current === null ? "" : String(current))
  React.useEffect(() => {
    setDraft((d) => (Number(d) === current && d.trim() !== "" ? d : current === null ? "" : String(current)))
  }, [current])

  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const suffix = typeof unit === "string" ? unit.trim().slice(0, 6) : ""

  return (
    <div className="relative" data-number-control="">
      <input
        type="number"
        inputMode="decimal"
        aria-label={label}
        className={INPUT + " tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" + (suffix ? " pr-9" : "")}
        min={min}
        max={max}
        step={step ?? 1}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => {
          const n = Number(draft)
          if (draft.trim() === "" || !Number.isFinite(n)) {
            setDraft(current === null ? "" : String(current))
            return
          }
          const held = clamp(n)
          if (held !== n) onChange(held)
          setDraft(String(held))
        }}
      />
      {suffix ? (
        <span aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground" data-number-unit="">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}
