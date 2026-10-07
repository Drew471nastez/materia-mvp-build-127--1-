"use client"

/**
 * The control for `font_picker`: the families Theme settings › Typography
 * offers, each option drawn in its own face, and "The theme's font" at the
 * top for a section that should follow the theme. The list is the theme's
 * own (OFFERED_FAMILIES in lib/website-builder/font-link.ts), which is also
 * the list the page loads from, so a family picked here is a family the
 * page actually has. A schema that gives `options` keeps them.
 */
import type { SelectOption } from "@/lib/website-builder/types"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { FontPreviewPicker } from "../font-preview-picker"

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
  /* Each family drawn in its own face (../font-preview-picker), the name the theme's list does not know kept at the end. */
  return <FontPreviewPicker bare label={label ?? "Font"} value={value} onChange={onChange} options={value && !known ? [...list, { label: value, value }] : list} />
}
