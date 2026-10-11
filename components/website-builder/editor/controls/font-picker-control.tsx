"use client"

/**
 * The control for `font_picker`: the families Theme settings › Typography
 * offers, each option drawn in its own face, and "The theme's font" at the
 * top for a section that should follow the theme. The list is the theme's
 * own (OFFERED_FAMILIES in lib/website-builder/font-link.ts), which is also
 * the list the page loads from, so a family picked here is a family the
 * page actually has. A schema that gives `options` keeps them.
 *
 * A SHOPIFY FONT IS A HANDLE, "assistant_n4": the family, then n or i for
 * the style and a digit for the weight (lib/storelib-theme/compat/objects.ts,
 * fontObject). An imported theme's font settings hold those, and this showed
 * the raw handle at the foot of the list and replaced it with a bare family
 * name, which dropped the weight the theme had chosen (a bold heading font
 * went to regular). Given a handle, the list is the same families written as
 * handles with the weight and style kept, and the current one is named as a
 * family, not as "assistant_n4". There is no "theme's font" choice there: a
 * Shopify theme has no font to fall back to when its setting is blank.
 */
import type { SelectOption } from "@/lib/website-builder/types"
import { OFFERED_FAMILIES } from "@/lib/website-builder/font-link"
import { FontPreviewPicker } from "../font-preview-picker"

export const THEME_FONT_OPTIONS: SelectOption[] = [...OFFERED_FAMILIES].sort((a, b) => a.localeCompare(b)).map((f) => ({ label: f, value: f }))

const HANDLE = /^([a-z0-9_]+?)_([nio])([1-9])$/

/** "assistant_n4" as its family and its variant, or null for a value that is not a Shopify handle. */
export function shopifyFont(value: string): { family: string; variant: string } | null {
  const m = HANDLE.exec(value.trim())
  if (!m) return null
  return { family: m[1].split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "), variant: `${m[2]}${m[3]}` }
}

/** A family as a Shopify handle with the variant kept: "Work Sans", "n7" is "work_sans_n7". */
export function fontHandle(family: string, variant: string): string {
  return `${family.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${variant}`
}

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
  const handle = shopifyFont(value)
  if (handle && !(options && options.length)) {
    const list = THEME_FONT_OPTIONS.map((o) => ({ label: o.label, value: fontHandle(o.value, handle.variant) }))
    const known = list.some((o) => o.value === value)
    /* The theme's own family first when it is not one of ours, under its name. */
    const shown = known ? list : [{ label: handle.family, value }, ...list]
    return <FontPreviewPicker bare label={label ?? "Font"} value={value} onChange={onChange} options={shown} />
  }
  const list = options && options.length ? options : [{ label: "The theme's font", value: "" }, ...THEME_FONT_OPTIONS]
  const known = list.some((o) => o.value === value)
  /* Each family drawn in its own face (../font-preview-picker), the name the theme's list does not know kept at the end. */
  return <FontPreviewPicker bare label={label ?? "Font"} value={value} onChange={onChange} options={value && !known ? [...list, { label: value, value }] : list} />
}
