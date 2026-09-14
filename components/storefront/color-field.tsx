"use client"

/**
 * ===========================================================================
 *  THE WEBSITE BUILDER'S COLOUR PICKER, IN THE FLOW OF A DIALOG
 * ===========================================================================
 * The picker is the builder's own — ColorPickerPanel is the saturation box,
 * hue slider and hex field its design panels use — so the two cannot drift.
 * What is different is WHERE it opens.
 *
 * The builder's chip floats its panel in a portal over the page. Inside a
 * modal dialog that is exactly wrong: Radix sets `pointer-events: none` on
 * everything outside the dialog, so the floating panel could not be clicked,
 * and it treats a pointer-down out there as "dismiss", so the first attempt
 * at picking a colour closed the whole form. That was "the colour picker is
 * not working".
 *
 * So it opens IN THE FLOW, under its own row, and the rows below it move
 * down — the same shape the builder's link and icon pickers use, for the
 * same reasons: nothing to measure, nothing to clip, nothing under the fold.
 *
 * One row per colour, full width. The two-column grid these sat in was
 * truncating "Background" to "Back..." at the width of a phone sheet.
 */

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { ColorPickerPanel } from "@/components/website-builder/editor/color-chip"
import { cn } from "@/lib/utils"

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
  const [open, setOpen] = useState(false)
  const shown = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback

  return (
    <div className={cn("rounded-lg border transition-colors", open ? "border-neutral-400" : "border-border")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-11 w-full items-center gap-3 px-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{label}</span>
        <span className="font-mono text-[11px] uppercase tabular-nums text-muted-foreground">{shown}</span>
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-full border border-border"
          style={{ background: shown }}
        />
        <ChevronDown
          aria-hidden
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-3">
          <ColorPickerPanel value={shown} onChange={onChange} existing={palette} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
