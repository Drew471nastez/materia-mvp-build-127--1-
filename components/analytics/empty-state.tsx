/**
 * ===========================================================================
 *  A CARD WITH NOTHING IN IT, SAID CALMLY
 * ===========================================================================
 * Round 49, the owner: cards with nothing in the period showed "–", or a
 * sentence floating in the middle of an empty card. Every empty card on
 * Analytics now reads the same way, on a computer and a phone: one short
 * line where the card's content starts, and under it the faint shape of what
 * would be there, so the card keeps its height and its rhythm:
 *
 *   rows   four ghost rows the height of a list's rows, shorter and fainter
 *          each time,
 *          for a list (referrers, pages, channels, downloads...)
 *   none   the line alone, for a card that already draws its own flat
 *          purple line (a chart at nothing) or an error
 *
 * No numbers, no illustration: the ghosts are blank bars in the page's
 * lightest grey, hidden from a screen reader, which hears the line.
 */
import * as React from "react"

/* Each shorter and fainter than the one above, so the shape trails off rather than ending at a hard edge. */
const GHOST = [
  [0.68, 1],
  [0.5, 0.8],
  [0.36, 0.6],
  [0.24, 0.4],
] as const

export function GhostRows() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5" data-empty-ghost="">
      {GHOST.map(([w, o]) => (
        <span key={w} className="block h-7 rounded-lg bg-[#f6f7f8]" style={{ width: `${w * 100}%`, opacity: o }} />
      ))}
    </div>
  )
}

/*
  A LINE WITH NOTHING TO DRAW. Round 51 laid a grey ghost curve over an empty chart; the owner asked for it back the
  way it was (round AL): "it should be like how it was before with the purple line flat". So a chart at nothing
  draws its own line, in its own colour, flat on the floor, with no grid and no axis numbers behind it
  (components/app/analytics-chart, components/analytics/trend-mini-chart, the home chart). Only the list cards keep
  their faint ghost rows above.
*/

/** Every point of every line is nothing: a chart with nothing to draw. */
export function nothingToDraw(...lines: ReadonlyArray<ReadonlyArray<number | null | undefined> | null | undefined>): boolean {
  return lines.every((l) => !l || l.every((v) => !v))
}

export function EmptyState({ children, ghost = "rows", className }: { children: React.ReactNode; ghost?: "rows" | "none"; className?: string }) {
  return (
    <div data-empty="" className={`flex flex-1 flex-col gap-3 pt-0.5${className ? ` ${className}` : ""}`}>
      <p className="text-[13px] leading-5 text-[#6b7280]">{children}</p>
      {ghost === "rows" ? <GhostRows /> : null}
    </div>
  )
}
