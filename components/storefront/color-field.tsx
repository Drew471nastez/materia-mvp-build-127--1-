"use client"

/**
 * ===========================================================================
 *  THE WEBSITE BUILDER'S COLOUR PICKER, ON THE CREATOR PAGE
 * ===========================================================================
 * Not a copy of it. `ColorChip` IS the control the website builder's design
 * panels use — saturation box, hue slider, hex field, the existing colours on
 * the page — and importing it is the only way the two stay the same control.
 *
 * What was here before was a native `<input type="color">` behind a rounded
 * square, which opens the operating system's colour dialog: a different shape
 * on every platform, no relationship to the page's own palette, and nothing
 * like the rest of Storelib.
 *
 * The row is the builder's row too: the name of the thing on the left, the
 * chip on the right, the hex underneath it in the popup rather than in a
 * second field competing with it.
 */

import { ColorChip } from "@/components/website-builder/editor/color-chip"

export function ColorField({
  label,
  value,
  fallback,
  onChange,
  /** Other colours already on this page, offered under the picker. */
  palette = [],
}: {
  label: string
  value: string
  fallback: string
  onChange: (value: string) => void
  palette?: string[]
}) {
  const shown = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[11px] uppercase tabular-nums text-muted-foreground">{shown}</span>
        <ColorChip value={shown} onChange={onChange} existing={palette} />
      </span>
    </div>
  )
}
