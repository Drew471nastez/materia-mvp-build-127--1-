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
 *          baseline (a chart at nothing) or an error
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
  A LINE WITH NOTHING TO DRAW (round 51, the owner: "Total sales over time is a flat line at €0.00"). A chart whose
  every point is nothing drew its full colour line along the floor, its dot at the end, and an axis of 1, 2, 3 for
  numbers nobody had. Now the line lies on the floor in the placeholder grey (morph-lines' loading line, so the first
  real answer rises from it) and over it the soft shape a line would take, in the page's lightest grey. It fades out,
  200ms, the moment there is something to draw. One path for every chart, so they all look alike.
*/
const GHOST_PATH = "M0,31 C8,30 13,24 22,25 S36,33 46,26 S60,13 70,17 S86,25 100,12"

/** The faint shape of a line, filling its box; `shown` false fades it out. Hidden from a screen reader. */
export function GhostLine({ shown, className, style }: { shown: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <div aria-hidden data-ghost-chart={shown ? "" : undefined} className={`pointer-events-none transition-opacity duration-200 ease-out${className ? ` ${className}` : ""}`} style={{ opacity: shown ? 1 : 0, ...style }}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-full w-full">
        <path d={`${GHOST_PATH} L100,40 L0,40 Z`} fill="#f6f7f8" />
        <path d={GHOST_PATH} fill="none" stroke="#e6e8ec" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

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
