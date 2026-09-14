"use client"

/**
 * ===========================================================================
 *  A COLOUR SCHEME, DRAWN AS COLOUR
 * ===========================================================================
 * This has been a dropdown of names, then a row of three stripes, then a tiny
 * drawing of a page. All three had the same problem: they described the
 * scheme instead of showing it, and a creator picking one was reading rather
 * than looking.
 *
 * Three overlapping discs — the page, the card that sits on it, the colour
 * that acts — is how a palette is shown everywhere it is shown well, and
 * overlapping them is what makes it read as ONE thing rather than as three
 * unrelated dots. The page colour is at the back because it is behind
 * everything on the real page; the accent is at the front because it is what
 * a visitor's eye lands on.
 *
 * FIVE, AND THEY HAVE TO BE FIVE DIFFERENT ANSWERS. The engine ships eight
 * and three were the same decision twice: `air` is white with dark accents
 * and so is `blacks`, `bubble` is purple where `pink` is pink, `fusion` is a
 * second near-black beside `astrid`. What is offered is blue, monochrome,
 * warm, pink, dark. The other three still exist and a page already on one
 * keeps it: this is what is OFFERED, not what is supported.
 */

import { Check } from "lucide-react"

import { themePresets } from "@/lib/store-builder/defaults"
import type { ThemePreset } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

export const OFFERED_SCHEMES: ThemePreset[] = ["default", "blacks", "cream", "pink", "astrid"]

function Discs({ preset }: { preset: ThemePreset }) {
  const t = themePresets[preset]
  /* Back to front: the page, the card on it, the colour that acts. */
  const discs = [t.sections.pageBackgroundColor, t.productCard.backgroundColor, t.colors.primary]
  return (
    <span aria-hidden className="relative flex h-7 items-center" style={{ width: 46 }}>
      {discs.map((colour, i) => (
        <span
          key={i}
          className="absolute top-0 h-7 w-7 rounded-full border border-black/10"
          style={{
            /* 11px apart on a 28px disc: a third covered, which is enough to
               read as a stack and not so much that the one behind is a sliver. */
            left: i * 11,
            background: colour,
            zIndex: i + 1,
            boxShadow: "0 1px 2px rgba(15,23,42,0.10)",
          }}
        />
      ))}
    </span>
  )
}

export function SchemePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (preset: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {OFFERED_SCHEMES.map((preset) => {
        const active = preset === value
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={active}
            title={themePresets[preset].name}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
              active ? "border-foreground bg-muted" : "border-border hover:bg-muted/60",
            )}
          >
            <Discs preset={preset} />
            <span className="text-[13px] text-foreground">{themePresets[preset].name}</span>
            {active && <Check className="h-3.5 w-3.5 text-foreground" />}
          </button>
        )
      })}
    </div>
  )
}
