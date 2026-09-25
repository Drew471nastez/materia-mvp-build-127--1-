"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A PART OF A PAGE THAT IS STILL ON ITS WAY
 * ===========================================================================
 * "The loading should not be the spinner in the charts loading and the
 * tables loading; it should be something more clean and smooth, loading
 * structures or skeleton, light gray shimmering."
 *
 * So a chart, a table, a list or a figure that is fetched after the page
 * lands keeps its room with the shapes of what is coming, in light gray, and
 * a soft band of light passes over them. Three rules keep it calm:
 *
 *   NOTHING FOR THE FIRST 200ms. Most answers are back by then, and a
 *   skeleton that shows for four frames is a flicker. The wait is CSS
 *   (`.shimmer-wait`, app/globals.css), so a server render needs no effect.
 *
 *   THE SAME ROOM AS WHAT REPLACES IT. Every skeleton here is given the
 *   height of the real thing, so the content arriving moves nothing.
 *
 *   A CROSSFADE, NOT A SWAP. ShimmerSwap keeps the skeleton over the content
 *   for one short fade while the content fades in under it. A skeleton that
 *   never became visible (a fast answer) fades from nothing, so a fast
 *   answer shows only its content arriving.
 *
 * The band is a transform on a pseudo element (`.shimmer-block::after`), so
 * it runs on the compositor; under reduced motion it does not run at all and
 * the shapes stay still. Page to page navigation keeps the spinner
 * (components/app/app-stage.tsx); this is only for data inside a page.
 */

/** How long a skeleton waits before it shows at all (app/globals.css `.shimmer-wait`). */
export const SHIMMER_WAIT_MS = 200
/** The crossfade from skeleton to content (app/globals.css `.shimmer-enter`, `.shimmer-leave`). */
export const SHIMMER_SWAP_MS = 180

/** One light gray shape. Give it a size and a radius in `className`. */
export function ShimmerBlock({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" data-shimmer-block="" className={cn("shimmer-block block rounded-md", className)} style={style} />
}

/**
 * The frame every skeleton sits in: invisible for SHIMMER_WAIT_MS, then in on
 * a short fade. Read to a screen reader as one "Loading", not as its shapes.
 */
export function Shimmer({ className, label = "Loading", children }: { className?: string; label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" data-shimmer="" className={cn("shimmer-wait", className)}>
      {children}
    </div>
  )
}

/* Widths that vary from row to row the way real names and figures do,
   the same on every render so nothing reshuffles. */
const SPREAD = [1, 0.72, 0.88, 0.64, 0.8, 0.7, 0.92, 0.6]

/**
 * Rows of a table or a list. `cols` are the widths of the shapes in a row,
 * left to right (any CSS width); the first varies a little from row to row.
 * `header` draws the table's header strip (36px, the tables' own) above them.
 */
export function ShimmerRows({
  rows = 5,
  rowHeight = 48,
  cols = ["38%", "18%", "14%"],
  header = false,
  divided = true,
  lead = false,
  bare = false,
  inset = true,
  className,
  label,
}: {
  rows?: number
  rowHeight?: number
  cols?: string[]
  header?: boolean
  divided?: boolean
  /** A round shape before the first column: an avatar, a flag, an icon. */
  lead?: boolean
  /** Inside a larger skeleton that already has its own frame (and its own wait). */
  bare?: boolean
  /** The 12px either side a table cell has; off for a list that runs to its edges. */
  inset?: boolean
  className?: string
  label?: string
}) {
  const Frame = bare ? BareFrame : Shimmer
  return (
    <Frame className={className} label={label}>
      {header ? <div className="h-9 border-b border-[#eef0f2] bg-[#fafbfb]" /> : null}
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn("flex items-center gap-4", inset && "px-3", divided && i < rows - 1 && "border-b border-[#f3f4f6]")}
          style={{ height: rowHeight }}
        >
          {lead ? <ShimmerBlock className="h-6 w-6 shrink-0 rounded-full" /> : null}
          {cols.map((w, c) => (
            <ShimmerBlock
              key={c}
              className={cn("h-3 rounded-full", c === 0 ? "shrink" : "shrink-0", c === cols.length - 1 && cols.length > 1 && "ml-auto")}
              style={{ width: c === 0 ? `calc(${w} * ${SPREAD[i % SPREAD.length]})` : w }}
            />
          ))}
        </div>
      ))}
    </Frame>
  )
}

function BareFrame({ className, children }: { className?: string; label?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>
}

/**
 * A chart's room: an optional headline figure, the plot as one soft shape,
 * and the axis's dates under it. `height` is the whole thing's, so it matches
 * the chart it stands in for.
 */
export function ShimmerChart({
  height,
  figure = false,
  bare = false,
  className,
  label,
}: {
  height: number
  figure?: boolean
  /** Inside a larger skeleton that already has its own frame (and its own wait). */
  bare?: boolean
  className?: string
  label?: string
}) {
  const Frame = bare ? BareFrame : Shimmer
  return (
    <Frame className={cn("flex flex-col", className)} label={label}>
      <div className="flex flex-col" style={{ height }}>
        {figure ? (
          <div className="mb-2 flex h-9 shrink-0 items-center gap-2.5">
            <ShimmerBlock className="h-6 w-28 rounded-lg" />
            <ShimmerBlock className="h-3 w-10 rounded-full" />
          </div>
        ) : null}
        <ShimmerBlock className="min-h-0 w-full flex-1 rounded-xl" />
        <div className="mt-2.5 flex h-3 shrink-0 items-center justify-between px-1">
          {Array.from({ length: 5 }, (_, i) => (
            <ShimmerBlock key={i} className="h-2.5 w-9 rounded-full" />
          ))}
        </div>
      </div>
    </Frame>
  )
}

/**
 * The skeleton while `loading`, the content after, crossfaded.
 *
 * The skeleton stays mounted in the same place in the tree when the answer
 * comes, so its own fade in (the 200ms wait) carries on from wherever it had
 * got to: a skeleton still invisible leaves invisibly. It is laid over the
 * content, out of the flow, for SHIMMER_SWAP_MS while the content fades in
 * under it, and then goes. A block that was never loading renders its
 * content with no fade.
 *
 * The tree keeps one shape throughout (the frame, the skeleton by key, the
 * content by key), so the skeleton going does not remount the content: a
 * chart that has just drawn its line is not drawn again. `contentClassName`
 * is for the content's own box, when the frame is a flex column or a fixed
 * height the content has to fill.
 */
export function ShimmerSwap({
  loading,
  skeleton,
  children,
  className,
  contentClassName,
}: {
  loading: boolean
  skeleton: React.ReactNode
  children?: React.ReactNode
  className?: string
  contentClassName?: string
}) {
  /* Whether a skeleton is in the tree: from the first loading render until
     its fade out is over. Set during render, so the loading frame is never
     painted without it. */
  const [held, setHeld] = useState(loading)
  if (loading && !held) setHeld(true)
  const leaving = !loading && held
  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => setHeld(false), SHIMMER_SWAP_MS + 20)
    return () => window.clearTimeout(t)
  }, [leaving])

  return (
    <div data-shimmer-swap={loading ? "loading" : leaving ? "leaving" : "done"} className={cn("relative", className)}>
      {held ? (
        <div key="skeleton" className={leaving ? "shimmer-leave pointer-events-none absolute inset-0 overflow-hidden" : "h-full"}>
          {skeleton}
        </div>
      ) : null}
      {loading ? null : (
        <div key="content" className={cn(leaving && "shimmer-enter", contentClassName)}>
          {children}
        </div>
      )}
    </div>
  )
}
