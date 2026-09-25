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
 * NINE, AND THEY HAVE TO BE NINE DIFFERENT ANSWERS. The engine ships more
 * and three were the same decision twice: `air` is white with dark accents
 * and so is `blacks`, `bubble` is purple where `pink` is pink, `fusion` is a
 * second near-black beside `astrid`. What is offered is blue, monochrome,
 * warm gold, green, navy, terracotta, pink, dark, and graphite: a lifted
 * charcoal with a steel accent, the second dark one, possible since "dark"
 * is decided by a scheme's colours (lib/store-builder/scheme-tone). The others still exist
 * and a page already on one keeps it: this is what is OFFERED, not what is
 * supported. The list lives in lib/store-builder/scheme-preview, because
 * the server prepares each one's paint for the instant preview.
 *
 * A GRID, NOT A WRAPPING ROW. Pills of different widths wrapped into
 * ragged lines; equal cells line up, two to a row on a phone and three in
 * the drawer.
 */

import { Check } from "lucide-react"

import { themePresets } from "@/lib/store-builder/defaults"
import { OFFERED_SCHEMES } from "@/lib/store-builder/scheme-preview"
import type { ThemePreset } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

export { OFFERED_SCHEMES }

function Discs({ preset, active }: { preset: ThemePreset; active: boolean }) {
  const t = themePresets[preset]
  /* Back to front: the page, the card on it, the colour that acts. */
  const discs = [t.sections.pageBackgroundColor, t.productCard.backgroundColor, t.colors.primary]
  /*
    11px apart on a 28px disc: a third covered, which is enough to read as a
    stack and not so much that the one behind is a sliver. The selected one
    opens to 13, which is the movement that says "this one" without the row
    reflowing — the container keeps its width either way. The spread is a
    transform, so choosing one moves pixels on the compositor and lays
    nothing out again.
  */
  const step = active ? 13 : 11
  return (
    <span aria-hidden className="relative flex h-7 shrink-0 items-center" style={{ width: 54 }}>
      {discs.map((colour, i) => (
        <span
          key={i}
          className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border border-black/10 transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            transform: `translateX(${i * step}px)`,
            background: colour,
            zIndex: i + 1,
            boxShadow: "0 1px 2px rgba(15,23,42,0.10)",
          }}
        >
          {/*
            THE TICK SITS ON THE ACCENT, not beside the name. Its own column
            cost 24px of every cell, and eight names in three columns came out
            as "Def…" and "Har…". On the front disc it takes no room at all.
          */}
          {i === discs.length - 1 && (
            <Check
              className={cn(
                "h-3.5 w-3.5 text-white transition-opacity duration-200 ease-out motion-reduce:transition-none",
                active ? "opacity-100" : "opacity-0",
              )}
              strokeWidth={3}
              style={{ filter: "drop-shadow(0 0.5px 0.5px rgba(0,0,0,0.35))" }}
            />
          )}
        </span>
      ))}
    </span>
  )
}

export function SchemePicker({
  value,
  onChange,
  onIntent,
}: {
  value: string
  onChange: (preset: string) => void
  /** The pointer is on one, or a finger is down on it: start fetching it. */
  onIntent?: (preset: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {OFFERED_SCHEMES.map((preset) => {
        const active = preset === value
        return (
          <button
            key={preset}
            type="button"
            data-scheme={preset}
            onClick={() => onChange(preset)}
            /* A pointer that rests on one, not one sweeping across the grid: each fetch is a render of the page. */
            onPointerEnter={onIntent ? (e) => { const el = e.currentTarget; const t = window.setTimeout(() => { if (el.matches(":hover")) onIntent(preset) }, 90); el.addEventListener("pointerleave", () => window.clearTimeout(t), { once: true }) } : undefined}
            onPointerDown={onIntent ? () => onIntent(preset) : undefined}
            aria-pressed={active}
            title={themePresets[preset].name}
            /*
              IT SETTLES RATHER THAN SNAPPING.

              A picker where the only thing that changes is which border is
              dark reads as a radio button from 1996: you press, and the page
              is simply different. The selected one lifts a little and its
              discs spread apart, over the same 200ms the rest of the product
              uses, so there is something for the eye to follow between the
              thing you pressed and the thing that became selected.

              `motion-reduce` turns the movement off and leaves the border,
              which is the part that carries the meaning.
            */
            /*
              NOTHING HERE CHANGES SIZE OR POSITION ON SELECT. The first cut
              lifted the selected one by a pixel and grew the tick from zero
              width, and both were a BUMP: the row is flex-wrap, so a button
              that gets 14px wider pushes its neighbours and can push one
              onto the next line. What moves now is colour, the shadow, and
              the discs inside their own fixed-width box. Every button is
              always exactly the size it will be when selected.
            */
            className={cn(
              /* Not a `.group`: globals.css strips transforms inside one on a touch screen, and the discs spread by transform. */
              "flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2",
              "transition-[background-color,border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
              active
                ? "border-foreground bg-muted shadow-[0_2px_10px_-4px_rgba(15,23,42,0.28)]"
                : "border-border hover:bg-muted/60",
            )}
          >
            <Discs preset={preset} active={active} />
            <span className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground">{themePresets[preset].name}</span>
          </button>
        )
      })}
    </div>
  )
}
