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
 * PAINT, NOT RENDERS. The transforms are written straight onto the rows, once
 * a frame, and React hears about the drag only when the slot it would land in
 * changes. A drag used to re-render the whole list on every pointer event,
 * which is what a phone felt as lag. Positions are read from layout
 * (`offsetTop`, which a transform does not move) in the scroller's own
 * coordinates, so they stay right when an open row closes as the drag
 * starts, and while the scroller scrolls under the finger.
 *
 * THE DROP LANDS WHERE IT WAS LET GO. On release the new order renders in the
 * same frame (`flushSync`) and the row glides the last few pixels from where
 * the finger left it into its slot, instead of jumping there.
 *
 * Near the top or bottom edge of the scroller the scroller scrolls, and the
 * lifted row stays under the pointer while it does.
 *
 * Rows are the list element's direct children marked `data-reorder-row`, so a
 * list can sit inside a row of another list without the two mixing.
 */
import * as React from "react"
import { flushSync } from "react-dom"

import { hapticTap } from "@/lib/native-bridge"

/** What React needs to know about a drag: which row is up, where it would land, and whether it would nest. */
interface Drag {
  from: number
  to: number
  nesting: 1 | -1 | 0
}

interface Live {
  from: number
  to: number
  nesting: 1 | -1 | 0
  pointerId: number
  grip: HTMLElement
  /** The lifted row itself, kept so the drop can find it wherever React put it. */
  el: HTMLElement
  /** Pointer in content coordinates (client + scroll) when it went down. */
  startY: number
  lastY: number
  startX: number
  lastX: number
  scroller: HTMLElement | null
  /** The lifted row's layout top when the pointer went down, in content coordinates. */
  baseTop: number
  /** Content coordinates = offsetTop + this. Fixed for the drag: offsetTop and scrollTop are both layout. */
  offsetToContent: number
  raf: number
  dirty: boolean
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
const SLIDE = "transform 200ms cubic-bezier(0.2, 0, 0, 1)"
const DROP_MS = 180

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

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

function clear(el: HTMLElement) {
  el.style.removeProperty("transform")
  el.style.removeProperty("transition")
  el.style.removeProperty("will-change")
}

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
  /* Read when a grip is pressed, not when its handlers were made: a row that did not draw again (a memoised row) still knows how long the list is. */
  const countRef = React.useRef(count)
  countRef.current = count

  const rows = React.useCallback(() => {
    const list = listRef.current
    return list ? [...list.querySelectorAll<HTMLElement>(":scope > [data-reorder-row]")] : []
  }, [])

  /** How far the lifted row sits sideways, and whether letting go now would nest it. */
  const sideways = (d: Live): { x: number; nesting: 1 | -1 | 0 } => {
    const n = nestRef.current
    const dx = d.lastX - d.startX
    if (!n || d.to !== d.from || dx === 0) return { x: 0, nesting: 0 }
    const dir = dx > 0 ? 1 : -1
    if (!n.can(d.from, dir)) return { x: Math.max(-6, Math.min(6, dx * 0.12)), nesting: 0 }
    return { x: Math.max(-n.step, Math.min(n.step, dx)), nesting: Math.abs(dx) >= nestThreshold(n.step) ? dir : 0 }
  }

  /** One frame of the drag: read layout, pick the slot, write the transforms. */
  const paint = React.useCallback(() => {
    const d = live.current
    if (!d) return
    const list = rows()
    const me = list[d.from]
    if (!me) return
    const k = d.offsetToContent
    const lay = list.map((r) => ({ top: r.offsetTop + k, h: r.offsetHeight }))
    const mine = lay[d.from]
    /* Where the finger has carried the row: from where it was when the pointer went down, not where layout put it since. */
    const top = d.baseTop + (d.lastY - d.startY)
    const bottom = top + mine.h

    let to = d.from
    for (let i = d.from - 1; i >= 0; i--) {
      if (top < lay[i].top + lay[i].h / 2) to = i
      else break
    }
    for (let i = d.from + 1; i < lay.length; i++) {
      if (bottom > lay[i].top + lay[i].h / 2) to = i
      else break
    }

    const gap = lay.length > 1 ? Math.max(0, lay[1].top - (lay[0].top + lay[0].h)) : 0
    const shift = mine.h + gap
    if (to !== d.to) {
      d.to = to
      hapticTap("light")
    }
    const side = sideways(d)

    me.style.transform = `translate3d(${side.x}px, ${top - mine.top}px, 0)`
    list.forEach((r, i) => {
      if (i === d.from) return
      let y = 0
      if (to > d.from && i > d.from && i <= to) y = -shift
      else if (to < d.from && i < d.from && i >= to) y = shift
      const t = `translate3d(0, ${y}px, 0)`
      if (r.style.transform !== t) r.style.transform = t
    })

    if (side.nesting !== d.nesting) d.nesting = side.nesting
    setDrag((prev) =>
      prev && prev.from === d.from && prev.to === d.to && prev.nesting === d.nesting
        ? prev
        : { from: d.from, to: d.to, nesting: d.nesting },
    )
  }, [rows])

  const tick = React.useCallback(() => {
    const d = live.current
    if (!d) return
    const box = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    const clientY = d.lastY - scrollTopOf(d.scroller)
    let speed = 0
    if (clientY < box.top + EDGE) speed = -MAX_SPEED * Math.min(1, (box.top + EDGE - clientY) / EDGE)
    else if (clientY > box.bottom - EDGE) speed = MAX_SPEED * Math.min(1, (clientY - (box.bottom - EDGE)) / EDGE)
    if (speed) {
      const before = scrollTopOf(d.scroller)
      if (d.scroller) d.scroller.scrollTop += speed
      else window.scrollBy(0, speed)
      const moved = scrollTopOf(d.scroller) - before
      /* The finger has not moved on the glass, so in content coordinates it moved with the scroll. */
      if (moved) {
        d.lastY += moved
        d.dirty = true
      }
    }
    if (d.dirty) {
      d.dirty = false
      paint()
    }
    d.raf = requestAnimationFrame(tick)
  }, [paint])

  const finish = React.useCallback(
    (commit: boolean) => {
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
      const list = rows()
      const n = nestRef.current
      const dx = d.lastX - d.startX
      const reorder = commit && d.to !== d.from
      const nestDir: 1 | -1 | 0 =
        commit && !reorder && n && Math.abs(dx) >= nestThreshold(n.step) && n.can(d.from, dx > 0 ? 1 : -1) ? (dx > 0 ? 1 : -1) : 0

      if (!reorder && !nestDir) {
        /* Nothing changes: everything eases back to where it was. */
        const still = reducedMotion()
        list.forEach((r) => {
          r.style.transition = still ? "none" : SLIDE
          r.style.transform = "translate3d(0, 0, 0)"
        })
        setDrag(null)
        window.setTimeout(() => list.forEach((r) => !live.current && clear(r)), still ? 0 : 220)
        return
      }

      /* Where the row is on screen now, so it can glide from there into its slot. */
      const before = d.el.getBoundingClientRect()
      list.forEach(clear)
      hapticTap("medium")
      flushSync(() => {
        setDrag(null)
        if (reorder) onMoveRef.current(d.from, d.to)
        else if (n && nestDir) n.onNest(d.from, nestDir)
      })
      if (!d.el.isConnected || reducedMotion()) return
      const after = d.el.getBoundingClientRect()
      const ox = before.left - after.left
      const oy = before.top - after.top
      if (Math.abs(ox) < 1 && Math.abs(oy) < 1) return
      d.el.animate(
        [{ transform: `translate3d(${ox}px, ${oy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: DROP_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      )
    },
    [rows],
  )

  React.useEffect(() => () => finish(false), [finish])

  const onPointerDown = (index: number) => (e: React.PointerEvent<HTMLElement>) => {
    /* A row alone in its list has nowhere to go, unless it can go in or out a level. */
    if (e.button !== 0 || live.current || (countRef.current < 2 && !nestRef.current)) return
    const list = rows()
    const el = list[index]
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const grip = e.currentTarget
    try {
      grip.setPointerCapture(e.pointerId)
    } catch {
      /* a synthetic pointer cannot be captured; the listeners below still work */
    }
    const scroller = scrollerOf(grip)
    const scroll = scrollTopOf(scroller)
    /* Measured before onStart, which may close an open row: the row stays under the finger whatever moves above it. */
    const rect = el.getBoundingClientRect()
    const baseTop = rect.top + scroll
    live.current = {
      from: index,
      to: index,
      nesting: 0,
      pointerId: e.pointerId,
      grip,
      el,
      startY: e.clientY + scroll,
      lastY: e.clientY + scroll,
      startX: e.clientX,
      lastX: e.clientX,
      scroller,
      baseTop,
      offsetToContent: baseTop - el.offsetTop,
      raf: 0,
      dirty: true,
    }
    list.forEach((r, i) => {
      r.style.willChange = "transform"
      r.style.transition = i === index ? "none" : SLIDE
    })
    document.body.style.setProperty("user-select", "none")
    document.body.style.setProperty("-webkit-user-select", "none")
    hapticTap("medium")
    onStart?.()
    setDrag({ from: index, to: index, nesting: 0 })
    live.current.raf = requestAnimationFrame(tick)

    const move = (ev: PointerEvent) => {
      const d = live.current
      if (ev.pointerId !== d?.pointerId) return
      d.lastY = ev.clientY + scrollTopOf(d.scroller)
      d.lastX = ev.clientX
      d.dirty = true
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      grip.removeEventListener("pointermove", move)
      grip.removeEventListener("pointerup", up)
      grip.removeEventListener("pointercancel", up)
      const d = live.current
      if (d && ev.type === "pointerup") {
        /* The last position counts, even if it arrived after the last frame. */
        d.lastY = ev.clientY + scrollTopOf(d.scroller)
        d.lastX = ev.clientX
        paint()
      }
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
    if (to < 0 || to >= countRef.current) return
    onMoveRef.current(index, to)
  }

  const gripProps = (index: number) => ({
    onPointerDown: onPointerDown(index),
    onKeyDown: onKeyDown(index),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    "data-sheet-no-drag": "",
    style: { touchAction: "none" } as React.CSSProperties,
  })

  /** Whether a held row, let go now, would go a level in (1) or out (-1). */
  const nesting: 1 | -1 | 0 = drag?.nesting ?? 0

  /**
   * The lifted row sits above the rest. Only that: the transforms are written
   * by the drag itself, so a render in the middle of one never fights them.
   */
  const rowStyle = (index: number): React.CSSProperties | undefined =>
    drag && index === drag.from ? { zIndex: 20, position: "relative" } : undefined

  return { listRef, drag, gripProps, rowStyle, nesting }
}
