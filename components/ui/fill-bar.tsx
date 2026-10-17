"use client"

/**
 * ===========================================================================
 *  ONE BAR, FOR EVERY BAR THAT FILLS
 * ===========================================================================
 * Course progress, a lesson finished, the setup list, an upload, onboarding,
 * the share a row holds in a list of figures: every one of those was its own
 * handful of classes. Counted across the app there were more than thirty,
 * with six heights (0.5, 1, 1.5, 2, 3px, 5px), four track colours, three
 * fills and transitions from 100ms to 1200ms, so two bars on neighbouring
 * screens never looked like the same thing. This is that thing, decided
 * once:
 *
 *   HEIGHT     thin 4px over a picture or inside a dense row, regular 6px
 *              for a bar of its own, thick 8px when it is the subject of
 *              the screen
 *   SHAPE      fully round, track and fill alike, and the fill clipped by
 *              the track so a small value keeps the round end
 *   TRACK      #eef0f2 on a surface; over a picture, the picture's own
 *              dark or light wash, because a grey track disappears there
 *   FILL       the near black #1a1a2e by default, the violet accent where
 *              the screen's actions are violet, green for something that
 *              has gone right and amber for something that has not
 *   MOTION     a TRANSITION on the width, never an animation and never a
 *              key that changes: a component that draws again with the
 *              same value moves nothing at all, which is what the owner
 *              asked for. 300ms by default; a job that reports in large
 *              steps can ask for longer. Reduced motion sets the width
 *              with no transition.
 *   MEANING    role="progressbar" with its minimum, maximum, value and a
 *              name, so a screen reader says how far it is. A bar drawn
 *              beside a number already on screen says `quiet` and is
 *              hidden from the reader instead of saying it twice.
 *
 * The number is given as it is counted (7 of 12 lessons, 64 of 100 percent):
 * `value` and `max`, as the accessibility attributes want them, with the
 * width worked out here. `floor` keeps a job that has begun visible: an
 * upload that has sent nothing yet is a sliver rather than an empty track,
 * which is the only reason a bar is ever given one.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export type FillBarSize = "thin" | "regular" | "thick"
export type FillBarTone = "ink" | "violet" | "positive" | "warning" | "light"
export type FillBarOn = "surface" | "dark-media" | "light-media"

/** The one height each size is, in px, so a probe can measure what this module says. */
export const FILL_BAR_HEIGHT: Record<FillBarSize, number> = { thin: 4, regular: 6, thick: 8 }

/** How long a fill takes to reach a new width, in ms. */
export const FILL_BAR_MS = 300

const SIZE: Record<FillBarSize, string> = { thin: "h-1", regular: "h-1.5", thick: "h-2" }
const TONE: Record<FillBarTone, string> = {
  ink: "bg-[#1a1a2e]",
  violet: "bg-[#8b5cf6]",
  positive: "bg-[#16a34a]",
  warning: "bg-[#d97706]",
  light: "bg-white",
}
const TRACK: Record<FillBarOn, string> = {
  surface: "bg-[#eef0f2]",
  "dark-media": "bg-black/10",
  "light-media": "bg-white/25",
}

export interface FillBarProps {
  /** How far it is, counted the way the screen counts it. */
  value: number
  /** What counts as full. 100 for a percentage, 12 for 7 of 12 lessons. */
  max?: number
  /** What a screen reader says this bar is. Required unless `quiet`. */
  label?: string
  size?: FillBarSize
  tone?: FillBarTone
  /** What it is drawn on: a surface, or over a picture, where the track takes the picture's own wash. */
  on?: FillBarOn
  /** The smallest width a value above nought is drawn at, in percent, so a job that has begun is visible. */
  floor?: number
  /** How long the fill takes to reach a new width. Longer for a job that reports in big steps. */
  ms?: number
  /** Beside a number already on screen: hidden from a screen reader, which would otherwise say it twice. */
  quiet?: boolean
  className?: string
  /** For a track that is neither of the three (a themed website section brings its own colours). */
  trackStyle?: React.CSSProperties
  /** For a fill that is neither of the five, for the same reason. */
  fillStyle?: React.CSSProperties
}

/**
 * The share of the track the fill takes, 0 to 100, never less than `floor`.
 * A bar is only given a floor while something is under way, and there the
 * whole point of it is that nought is not drawn as nothing.
 */
export function fillPercent(value: number, max = 100, floor = 0): number {
  const least = Math.max(0, Math.min(100, floor))
  if (!(max > 0) || !Number.isFinite(value)) return least
  return Math.max(least, Math.max(0, Math.min(100, (value / max) * 100)))
}

export function FillBar({ value, max = 100, label, size = "regular", tone = "ink", on = "surface", floor = 0, ms = FILL_BAR_MS, quiet = false, className, trackStyle, fillStyle }: FillBarProps) {
  const width = fillPercent(value, max, floor)
  const aria = quiet
    ? ({ "aria-hidden": true } as const)
    : ({ role: "progressbar", "aria-valuemin": 0, "aria-valuemax": max, "aria-valuenow": Math.max(0, Math.min(max, value)), "aria-label": label } as const)
  return (
    <div {...aria} data-fill-bar={size} className={cn("w-full overflow-hidden rounded-full", SIZE[size], TRACK[on], className)} style={trackStyle}>
      <div
        /* The width is a transition on this one element: drawing again with the same value moves nothing. */
        className={cn("h-full rounded-full transition-[width] ease-out motion-reduce:transition-none", TONE[tone])}
        style={{ width: `${width}%`, transitionDuration: `${ms}ms`, ...fillStyle }}
      />
    </div>
  )
}

/**
 * THE OTHER KIND OF FILL: a row in a list of figures whose own words sit on
 * top of it (Analytics' sources, countries, top posts). It is not a track
 * with a bar in it but the row's own ground, so it keeps its height, its
 * rounded corners and the hairline that lifts it off the card. Both lists
 * drew it with the same long string of classes; this is that string, in one
 * place, so a change to it is a change everywhere.
 *
 * The caller still gives it its width, because the width is the figure.
 */
export const ROW_FILL =
  "absolute left-0 rounded-md bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)] transition-[width,filter] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:brightness-[0.975] motion-reduce:transition-none"
