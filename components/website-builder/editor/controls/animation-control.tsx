"use client"

/**
 * A component's own entrance animation (a `select` setting whose values are
 * the section animations, lib/ai-builder/manifest.ts). "Same as site" says
 * which animation that is right now (Theme settings › Animations), so the
 * choice is made against what it would replace. The note under it, that a
 * visitor who turned motion off sees none, is the setting's own `info`,
 * printed by the panel. Duration and delay are their own sliders beside it,
 * shown while an animation plays.
 */
import { ChevronDown } from "lucide-react"

import { SECTION_ANIMATION_VALUES } from "@/lib/ai-builder/types"
import { sectionAnimationValue } from "@/lib/ai-builder/manifest"
import { themeAnimation } from "@/lib/website-builder/section-anchors"
import { useEditorFieldEnv } from "./context"
import { SELECT } from "./styles"
import { tt } from "@/lib/i18n/text"

/** The site's animation in words, for "Same as site (fade up)". */
function motionWords(v: string): string {
  switch (v) {
    case "none": return tt("none")
    case "fade": return tt("fade")
    case "fade_up": return tt("fade up")
    case "rise": return tt("rise")
    case "slide_left": return tt("from the right")
    case "slide_right": return tt("from the left")
    case "zoom": return tt("zoom")
    case "blur": return tt("blur in")
    default: return v
  }
}

/** A select drawn as an animation choice: id `animation`, or exactly the section animation values. */
export function isAnimationField(field: { id: string; type: string; options?: { value: string }[]; prop?: unknown }): boolean {
  if (field.type !== "select" && field.type !== "radio") return false
  if (field.prop === "animation") return true
  const values = (field.options ?? []).map((o) => o.value)
  return values.length === SECTION_ANIMATION_VALUES.length && values.every((v) => (SECTION_ANIMATION_VALUES as readonly string[]).includes(v))
}

export function AnimationControl({ value, onChange, options, label }: { value: unknown; onChange: (v: string) => void; options: { label: string; value: string }[]; label?: string }) {
  const env = useEditorFieldEnv()
  const site = themeAnimation(env?.themeSettings ?? null)
  const current = sectionAnimationValue(value)
  return (
    <div className="relative" data-animation-control="">
      <select aria-label={label} className={SELECT} value={current} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === "theme" ? tt("Same as site ({motion})", { motion: motionWords(site) }) : tt(o.label)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
