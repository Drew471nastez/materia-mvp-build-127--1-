"use client"

/**
 * The control for `font_picker`: the families Theme settings › Typography
 * offers, each option drawn in its own face, and "The theme's font" at the
 * top for a section that should follow the theme. The list is the theme's
 * own (OFFERED_FAMILIES in lib/website-builder/font-link.ts), which is also
 * the list the page loads from, so a family picked here is a family the
 * page actually has. A schema that gives `options` keeps them.
 */
import { ChevronDown } from "lucide-react"

import type { SelectOption } from "@/lib/website-builder/types"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { SELECT } from "./styles"

export const THEME_FONT_OPTIONS: SelectOption[] = [...OFFERED_FAMILIES].sort((a, b) => a.localeCompare(b)).map((f) => ({ label: f, value: f }))

export function FontPickerControl({
  value,
  onChange,
  options,
  label,
}: {
  value: string
  onChange: (v: string) => void
  options?: SelectOption[]
  label?: string
}) {
  const list = options && options.length ? options : [{ label: "The theme's font", value: "" }, ...THEME_FONT_OPTIONS]
  const known = list.some((o) => o.value === value)
  return (
    <div className="relative">
      <select
        aria-label={label}
        className={SELECT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={value ? { fontFamily: `"${value.replace(/"/g, "")}", ui-sans-serif, system-ui, sans-serif` } : undefined}
      >
        {list.map((o) => (
          <option key={o.value} value={o.value} style={o.value ? { fontFamily: `"${o.value.replace(/"/g, "")}"` } : undefined}>
            {o.label}
          </option>
        ))}
        {value && !known ? <option value={value}>{value}</option> : null}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
