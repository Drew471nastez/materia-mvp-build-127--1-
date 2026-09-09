"use client"

/**
 * ===========================================================================
 *  WHY THE CROSSHAIR AND THE DOTS GLIDE
 * ===========================================================================
 * Shared by the analytics trend chart and the dashboard's KPI chart.
 *
 * A line chart samples 30 days across ~700px, so the nearest data point is
 * 24px away from the last one. Recharts snaps its cursor and its active dots
 * straight to it: the crosshair teleports 24px at a time while the mouse
 * moves one pixel, which is what "it does not track in real time" describes.
 *
 * The snap is unavoidable — the tooltip must report a real day, not an
 * interpolated one — but the JUMP is not. Both of these draw at the origin
 * and are moved with a CSS `transform`, so a change of index becomes a
 * 120ms compositor animation between two positions rather than a jump.
 *
 * It has to be `transform`, not `x1`/`cx`. SVG geometry attributes cannot be
 * transitioned in CSS; `transform` on an SVG element can, and runs off the
 * main thread, so a scrub costs the same whether it moves one point or ten.
 */
export const GLIDE = "transform 120ms cubic-bezier(0.2, 0, 0, 1)"

export function GlidingCursor(props: {
  points?: { x: number; y: number }[]
  top?: number
  height?: number
  stroke?: string
  /*
    Recharts clones the cursor element with its own props, the class
    `recharts-tooltip-cursor` among them. Dropping it on the floor, as the
    first version of this did, leaves the crosshair unfindable — the class is
    how anything outside this component refers to it.
  */
  className?: string
}) {
  const x = props.points?.[0]?.x
  if (x == null) return null
  const top = props.top ?? 0
  const height = props.height ?? 0
  return (
    <line
      className={props.className}
      x1={0}
      x2={0}
      y1={top}
      y2={top + height}
      stroke={props.stroke ?? "#c4b5fd"}
      strokeWidth={1}
      strokeDasharray="4 2"
      style={{ transform: `translateX(${x}px)`, transition: GLIDE }}
    />
  )
}

export function GlidingActiveDot(props: { cx?: number; cy?: number; fill?: string }) {
  if (props.cx == null || props.cy == null) return null
  return (
    <circle
      r={5}
      cx={0}
      cy={0}
      fill={props.fill}
      stroke="#fff"
      strokeWidth={2}
      style={{ transform: `translate(${props.cx}px, ${props.cy}px)`, transition: GLIDE }}
    />
  )
}
