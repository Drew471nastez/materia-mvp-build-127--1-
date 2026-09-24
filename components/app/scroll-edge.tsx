"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A TABLE THAT SCROLLS SIDEWAYS UNDER A FROZEN FIRST COLUMN
 * ===========================================================================
 * On a phone the Emails, Orders and automation tables are wider than the
 * screen: the rows scroll sideways and the first column holds still. Without
 * anything at the join, the cells going under it were cut flat against it
 * ("bscribed"), with nothing to say the row carries on underneath. Polaris'
 * IndexTable answers that with a shadow on the frozen column's right edge
 * once the table has moved, and this is the same thing:
 *
 *   scrolled at all       a hairline and a short soft shadow down the frozen
 *                         column's edge, header to last row, one line
 *   more to the right     a faint shade along the right edge of the table
 *
 * Both are pseudo elements of the frame (app/globals.css `.scroll-edge`),
 * over the table and never inside it, so the edge is one continuous line
 * rather than a shadow per cell with seams at every row border. They fade on
 * opacity alone. The scroll only flips two data attributes, from a passive
 * listener, at most once a frame, and only when they change: nothing in React
 * re-renders while a finger drags the rows.
 *
 * WHERE THE EDGE IS. The table marks the cells of its last frozen column with
 * `data-scroll-edge`; the frame measures where their right side is, once,
 * and hands that one number to the CSS as `--scroll-edge-x`. Measured on
 * every render and on every resize, never guessed from a class, so a wider
 * email column or a hidden one moves the line with it. The header cell is
 * marked too, so the line starts at the top of the header; a header cell
 * whose edge is somewhere else (the orders bulk bar, which spans the row) is
 * left unmarked and the line starts at the first row.
 *
 * The frozen cells keep their own opaque background, the row's, hover and
 * selected included; that is what stops a badge showing through them.
 */

const EPSILON = 1

function measure(frame: HTMLElement, scroller: HTMLElement) {
  const box = frame.getBoundingClientRect()
  const cells = Array.from(scroller.querySelectorAll<HTMLElement>("[data-scroll-edge]"))
  const lead = scroller.querySelector<HTMLElement>("tbody [data-scroll-edge]") ?? cells[0] ?? null
  if (lead) {
    const x = lead.getBoundingClientRect().right - box.left
    let top = Infinity
    let bottom = -Infinity
    for (const cell of cells) {
      const r = cell.getBoundingClientRect()
      if (Math.abs(r.right - box.left - x) > EPSILON) continue
      top = Math.min(top, r.top - box.top)
      bottom = Math.max(bottom, r.bottom - box.top)
    }
    frame.style.setProperty("--scroll-edge-x", `${Math.round(x * 100) / 100}px`)
    frame.style.setProperty("--scroll-edge-top", `${Math.round(top * 100) / 100}px`)
    frame.style.setProperty("--scroll-edge-h", `${Math.round((bottom - top) * 100) / 100}px`)
  } else {
    /* No frozen column: the shade sits on the table's own left edge. */
    frame.style.setProperty("--scroll-edge-x", "0px")
    frame.style.setProperty("--scroll-edge-top", "0px")
    frame.style.setProperty("--scroll-edge-h", `${scroller.clientHeight}px`)
  }
  frame.style.setProperty("--scroll-edge-view-h", `${scroller.clientHeight}px`)
}

function mark(frame: HTMLElement, scroller: HTMLElement) {
  const start = scroller.scrollLeft > 0.5 ? "true" : "false"
  const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - EPSILON ? "true" : "false"
  if (frame.dataset.start !== start) frame.dataset.start = start
  if (frame.dataset.end !== end) frame.dataset.end = end
}

/**
 * The frame and its scroller. `className` goes on the scroller (the element
 * that scrolls), `frameClassName` on the frame around it.
 */
export function ScrollEdge({
  className,
  frameClassName,
  children,
}: {
  className?: string
  frameClassName?: string
  children: React.ReactNode
}) {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const scrollerRef = React.useRef<HTMLDivElement>(null)

  /* Every render: the rows or the columns may have changed. A few reads of
     boxes the commit has just laid out anyway. */
  React.useLayoutEffect(() => {
    const frame = frameRef.current
    const scroller = scrollerRef.current
    if (!frame || !scroller) return
    measure(frame, scroller)
    mark(frame, scroller)
  })

  React.useEffect(() => {
    const frame = frameRef.current
    const scroller = scrollerRef.current
    if (!frame || !scroller) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        mark(frame, scroller)
      })
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      measure(frame, scroller)
      mark(frame, scroller)
    })
    ro.observe(scroller)
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild)
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={frameRef} data-scroll-edge-frame="" data-start="false" data-end="false" className={cn("scroll-edge", frameClassName)}>
      <div ref={scrollerRef} className={cn("scroll-edge-scroller", className)}>
        {children}
      </div>
    </div>
  )
}
