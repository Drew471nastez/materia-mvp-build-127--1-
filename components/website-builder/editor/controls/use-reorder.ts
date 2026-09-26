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
  scroller: HTMLElement | null
  startScroll: number
  rects: { top: number; bottom: number }[]
  raf: number
}

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
}: {
  count: number
  onMove: (from: number, to: number) => void
  onStart?: () => void
}) {
  const listRef = React.useRef<T>(null)
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const live = React.useRef<Live | null>(null)
  const onMoveRef = React.useRef(onMove)
  onMoveRef.current = onMove

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
    setDrag({ from: d.from, to, dy, shift: me.bottom - me.top + gap })
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
    }
  }, [])

  React.useEffect(() => () => finish(false), [finish])

  const onPointerDown = (index: number) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || live.current || count < 2) return
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

  /** Arrow keys on a focused grip move the row one place. */
  const onKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLElement>) => {
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

  /** The transform for row `index`: the lifted row follows, the rest step aside. */
  const rowStyle = (index: number): React.CSSProperties | undefined => {
    if (!drag) return undefined
    if (index === drag.from) {
      return { transform: `translate3d(0, ${drag.dy}px, 0)`, zIndex: 20, position: "relative", transition: "box-shadow 150ms" }
    }
    let y = 0
    if (drag.to > drag.from && index > drag.from && index <= drag.to) y = -drag.shift
    else if (drag.to < drag.from && index < drag.from && index >= drag.to) y = drag.shift
    return { transform: `translate3d(0, ${y}px, 0)`, transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)" }
  }

  return { listRef, drag, gripProps, rowStyle }
}
