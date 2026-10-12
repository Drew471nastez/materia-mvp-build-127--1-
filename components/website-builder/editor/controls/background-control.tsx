"use client"

/**
 * The control for `color_background`: Solid or Gradient, and the builder's
 * own editor for whichever it is. Solid is the same colour field every other
 * colour in the sidebar opens; Gradient is the gradient editor the colour
 * schemes already use. Nothing here is new to somebody who has set a colour
 * before, which is the point.
 *
 * Switching keeps what was there where it can: a solid colour becomes a
 * gradient from that colour, and a gradient becomes its first stop, so the
 * section does not jump to a colour nobody chose.
 */
import * as React from "react"

import { ColorField } from "@/components/storefront/color-field"
import { GradientEditor, parseGradient } from "@/components/website-builder/editor/gradient-editor"
import { cleanBackground } from "@/lib/storelib-theme/values"
import { SEGMENTS, segment } from "./styles"
import { tt } from "@/lib/i18n/text"

function isGradient(v: string): boolean {
  return /gradient\(/i.test(v)
}

export function BackgroundControl({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string
  fallback: string
  onChange: (v: string) => void
}) {
  const current = typeof value === "string" && value ? value : fallback
  const [mode, setMode] = React.useState<"solid" | "gradient">(isGradient(current) ? "gradient" : "solid")
  React.useEffect(() => {
    setMode(isGradient(current) ? "gradient" : "solid")
  }, [current])

  const toSolid = () => {
    setMode("solid")
    if (!isGradient(current)) return
    const first = parseGradient(current)?.stops[0]?.color
    onChange(first && /^#[0-9a-f]{6}$/i.test(first) ? first : "#ffffff")
  }
  const toGradient = () => {
    setMode("gradient")
    if (isGradient(current)) return
    const from = /^#[0-9a-f]{6}$/i.test(current) ? current : "#f8f9fa"
    onChange(`linear-gradient(135deg, ${from} 0%, #e5e7eb 100%)`)
  }

  return (
    <div className="space-y-2" data-background-control="">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          aria-hidden
          className="h-5 w-10 rounded-md border border-border"
          style={{ background: cleanBackground(current) || "transparent" }}
        />
      </div>
      <div className={SEGMENTS} role="radiogroup" aria-label={tt("{label} kind", { label })}>
        <button type="button" role="radio" aria-checked={mode === "solid"} className={segment(mode === "solid")} onClick={toSolid}>
          {tt("Solid")}
        </button>
        <button type="button" role="radio" aria-checked={mode === "gradient"} className={segment(mode === "gradient")} onClick={toGradient}>
          {tt("Gradient")}
        </button>
      </div>
      {mode === "solid" ? (
        <ColorField label={tt("Colour")} value={isGradient(current) ? "" : current} fallback={/^#[0-9a-f]{6}$/i.test(fallback) ? fallback : "#ffffff"} onChange={onChange} />
      ) : (
        <GradientEditor value={isGradient(current) ? current : ""} onChange={onChange} />
      )}
    </div>
  )
}
