"use client"

/**
 * ===========================================================================
 *  DRAG A ROW BY ITS GRIP, WITH A MOUSE OR A FINGER
 * ===========================================================================
 * Pointer events, not HTML5 drag and drop: `dragstart` never fires for touch,
 * so the native API is a list that reorders on a desktop and does nothing on
 * a phone. The grip has `touch-action: none` (the phone sheet reads that as
 * "this control owns its finger" and does not move itself, see
 * mobile-editor-sheet.tsx) and captures the pointer, so the drag keeps going
 * when the finger leaves the grip.
 *
 * The list is left alone until the pointer lifts. What moves during the drag
 * is paint: the lifted row follows the pointer, the rows it passes slide one
 * slot the other way. The order is committed once, on release, through
 * `onMove`, which is the same save path as any other edit.
 *
 * Near the top or bottom edge of the scroller the scroller scrolls, and the
 * lifted row stays under the pointer while it does.
 *
 * Rows are the list element's direct children marked `data-reorder-row`, so a
 * list can sit inside a row of another list without the two mixing.
 */
import * as React from "react"

import { hapticTap } from "@/lib/native-bridge"

interface Drag {
  from: number
  to: number
  /** How far the lifted row has moved from its place, scrolling included. */
  dy: number
  /** How far the pointer has gone sideways, for a list whose rows nest. */
  dx: number
  /** How far a passed row slides: the lifted row's height plus the gap. */
  shift: number
}

interface Live {
  from: number
  to: number
  pointerId: number
  grip: HTMLElement
  startY: number
  lastY: number
  startX: number
  lastX: number
  scroller: HTMLElement | null
  startScroll: number
  rects: { top: number; bottom: number }[]
  raf: number
}

/**
 * SIDEWAYS IS A LEVEL. A list whose rows can go under the row above (a link
 * under a link) passes `nest`: a row dragged right by most of one `step`
 * and let go where it started goes in a level, dragged left it comes out,
 * if `can` says that row may. While held, the row follows the pointer
 * sideways by up to one step when it may, and barely at all when it may
 * not, so the answer is visible before the pointer lifts. A row that also
 * moved up or down is a reorder, and only that.
 */
export interface NestOptions {
  step: number
  can: (index: number, dir: 1 | -1) => boolean
  onNest: (index: number, dir: 1 | -1) => void
}

/** How far sideways counts as meaning it: most of a step, and never less than 24px. */
const nestThreshold = (step: number) => Math.max(24, step * 0.7)

const EDGE = 56
const MAX_SPEED = 14

function scrollerOf(el: HTMLElement): HTMLElement | null {
  const marked = el.closest<HTMLElement>("[data-sheet-scroll], [data-wb-sidebar-scroll]")
  if (marked) return marked
  let node = el.parentElement
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

const scrollTopOf = (s: HTMLElement | null) => (s ? s.scrollTop : window.scrollY)

export function useReorder<T extends HTMLElement = HTMLDivElement>({
  count,
  onMove,
  onStart,
  nest,
}: {
  count: number
  onMove: (from: number, to: number) => void
  onStart?: () => void
  nest?: NestOptions
}) {
  const listRef = React.useRef<T>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const live = React.useRef<Live | null>(null)
  const onMoveRef = React.useRef(onMove)
  onMoveRef.current = onMove
  const nestRef = React.useRef(nest)
  nestRef.current = nest

  const rows = () => {
    const list = listRef.current
    return list ? [...list.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]")] : []
  }

  /** Where the lifted row is now, and the slot it would land in. */
  const measure = React.useCallback(() => {
    const d = live.current
    if (!d) return
    const dy = d.lastY - d.startY + (scrollTopOf(d.scroller) - d.startScroll)
    const me = d.rects[d.from]
    const top = me.top + dy
    const bottom = me.bottom + dy
    let to = d.from
    for (let i = d.from - 1; i >= 0; i--) {
      const mid = (d.rects[i].top + d.rects[i].bottom) / 2
      if (top < mid) to = i
      else break
    }
    for (let i = d.from + 1; i < d.rects.length; i++) {
      const mid = (d.rects[i].top + d.rects[i].bottom) / 2
      if (bottom > mid) to = i
      else break
    }
    if (to !== d.to) {
      d.to = to
      hapticTap("light")
    }
    const gap = d.rects.length > 1 ? Math.max(0, d.rects[1].top - d.rects[0].bottom) : 8
    setDrag({ from: d.from, to, dy, dx: d.lastX - d.startX, shift: me.bottom - me.top + gap })
  }, [])

  const tick = React.useCallback(() => {
    const d = live.current
    if (!d) return
    const box = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    let speed = 0
    if (d.lastY < box.top + EDGE) speed = -MAX_SPEED * Math.min(1, (box.top + EDGE - d.lastY) / EDGE)
    else if (d.lastY > box.bottom - EDGE) speed = MAX_SPEED * Math.min(1, (d.lastY - (box.bottom - EDGE)) / EDGE)
    if (speed) {
      const before = scrollTopOf(d.scroller)
      if (d.scroller) d.scroller.scrollTop += speed
      else window.scrollBy(0, speed)
      if (scrollTopOf(d.scroller) !== before) measure()
    }
    d.raf = requestAnimationFrame(tick)
  }, [measure])

  const finish = React.useCallback((commit: boolean) => {
    const d = live.current
    if (!d) return
    live.current = null
    cancelAnimationFrame(d.raf)
    try {
      d.grip.releasePointerCapture(d.pointerId)
    } catch {
      /* already gone */
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("-webkit-user-select")
    setDrag(null)
    if (commit && d.to !== d.from) {
      hapticTap("medium")
      onMoveRef.current(d.from, d.to)
      return
    }
    const n = nestRef.current
    const dx = d.lastX - d.startX
    if (commit && n && Math.abs(dx) >= nestThreshold(n.step)) {
      const dir = dx > 0 ? 1 : -1
      if (n.can(d.from, dir)) {
        hapticTap("medium")
        n.onNest(d.from, dir)
      }
    }
  }, [])

  React.useEffect(() => () => finish(false), [finish])

  const onPointerDown = (index: number) => (e: React.PointerEvent<HTMLElement>) => {
    /* A row alone in its list has nowhere to go, unless it can go in or out a level. */
    if (e.button !== 0 || live.current || (count < 2 && !nestRef.current)) return
    const list = rows()
    if (!list[index]) return
    e.preventDefault()
    e.stopPropagation()
    const grip = e.currentTarget
    try {
      grip.setPointerCapture(e.pointerId)
    } catch {
      /* a synthetic pointer cannot be captured; the listeners below still work */
    }
    onStart?.()
    /* Measured after onStart, which may close an open row and change heights. */
    requestAnimationFrame(() => {
      if (live.current?.pointerId !== e.pointerId) return
      live.current.rects = rows().map((r) => {
        const b = r.getBoundingClientRect()
        return { top: b.top, bottom: b.bottom }
      })
      live.current.startScroll = scrollTopOf(live.current.scroller)
      measure()
    })
    const scroller = scrollerOf(grip)
    live.current = {
      from: index,
      to: index,
      pointerId: e.pointerId,
      grip,
      startY: e.clientY,
      lastY: e.clientY,
      startX: e.clientX,
      lastX: e.clientX,
      scroller,
      startScroll: scrollTopOf(scroller),
      rects: list.map((r) => {
        const b = r.getBoundingClientRect()
        return { top: b.top, bottom: b.bottom }
      }),
      raf: 0,
    }
    document.body.style.setProperty("user-select", "none")
    document.body.style.setProperty("-webkit-user-select", "none")
    hapticTap("medium")
    live.current.raf = requestAnimationFrame(tick)

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== live.current?.pointerId) return
      live.current.lastY = ev.clientY
      live.current.lastX = ev.clientX
      measure()
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      grip.removeEventListener("pointermove", move)
      grip.removeEventListener("pointerup", up)
      grip.removeEventListener("pointercancel", up)
      finish(ev.type === "pointerup")
    }
    grip.addEventListener("pointermove", move)
    grip.addEventListener("pointerup", up)
    grip.addEventListener("pointercancel", up)
  }

  /**
   * Arrow keys on a focused grip move the row one place. Where rows nest,
   * Right puts it under the row above and Left takes it back out.
   */
  const onKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLElement>) => {
    const n = nestRef.current
    if (n && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault()
      const dir = e.key === "ArrowRight" ? 1 : -1
      if (n.can(index, dir)) n.onNest(index, dir)
      return
    }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    const to = e.key === "ArrowUp" ? index - 1 : index + 1
    if (to < 0 || to >= count) return
    onMoveRef.current(index, to)
  }

  const gripProps = (index: number) => ({
    onPointerDown: onPointerDown(index),
    onKeyDown: onKeyDown(index),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    "data-sheet-no-drag": "",
    style: { touchAction: "none" } as React.CSSProperties,
  })

  /**
   * How far the lifted row sits sideways: with the pointer, up to one step,
   * where it may go a level in or out and has not moved up or down; a few
   * pixels of give where it may not; none in a list that does not nest.
   */
  const liftedX = (d: Drag): number => {
    const n = nest
    if (!n || d.to !== d.from || d.dx === 0) return 0
    const dir = d.dx > 0 ? 1 : -1
    if (n.can(d.from, dir)) return Math.max(-n.step, Math.min(n.step, d.dx))
    return Math.max(-6, Math.min(6, d.dx * 0.12))
  }

  /** Whether a held row, let go now, would go a level in (1) or out (-1). */
  const nesting: 1 | -1 | 0 = (() => {
    if (!drag || !nest || drag.to !== drag.from || Math.abs(drag.dx) < nestThreshold(nest.step)) return 0
    const dir = drag.dx > 0 ? 1 : -1
    return nest.can(drag.from, dir) ? dir : 0
  })()

  /** The transform for row `index`: the lifted row follows, the rest step aside. */
  const rowStyle = (index: number): React.CSSProperties | undefined => {
    if (!drag) return undefined
    if (index === drag.from) {
      return { transform: `translate3d(${liftedX(drag)}px, ${drag.dy}px, 0)`, zIndex: 20, position: "relative", transition: "box-shadow 150ms" }
    }
    let y = 0
    if (drag.to > drag.from && index > drag.from && index <= drag.to) y = -drag.shift
    else if (drag.to < drag.from && index < drag.from && index >= drag.to) y = drag.shift
    return { transform: `translate3d(0, ${y}px, 0)`, transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)" }
  }

  return { listRef, drag, gripProps, rowStyle, nesting }
}
