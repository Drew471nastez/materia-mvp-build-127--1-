"use client"

/**
 * ===========================================================================
 *  A MENU'S LINKS, DRAGGED ANYWHERE IN THE TREE
 * ===========================================================================
 * The owner: "I can simply drag a normal link and drag it under another main
 * so I can drop it as a sublink, or drag it as a normal link there". Before
 * this, a row dragged up and down its own level only, and the one way under
 * another link was the row directly below it nudged sideways.
 *
 * It works the way Shopify's navigation editor does:
 *
 *   WHERE IT LANDS IS A LINE. While a row is held, a violet line sits in the
 *   gap it would drop into, indented to the level it would take. Up and
 *   down picks the gap; how far right or left the pointer has travelled
 *   picks the level, one LINK_STEP per level, within what that gap allows.
 *   Between a link and its first sub-link, only "under it" is allowed, so a
 *   drop never takes a link's sub-links away from it.
 *
 *   THE ROW TRAVELS WITH THE POINTER. A copy of the row follows the pointer
 *   and the row itself stays where it was, dimmed, so the list underneath
 *   never shifts while it is read. On release the copy glides to the line
 *   and the list is saved in its new order, through the menu's own save
 *   path, as one step of Undo.
 *
 *   LIMITS. Two levels, the header's (NAV_MAX_DEPTH in nav-links.ts). A link
 *   with sub-links stays at the top. A level that is full takes no more.
 *
 *   A MOUSE, A FINGER, A KEYBOARD. The grip drags at once under a mouse or a
 *   finger (it is `touch-action: none`, so the sheet and the page leave the
 *   finger alone). Anywhere else on a row, a finger held still for a moment
 *   picks the row up, so an ordinary swipe still scrolls. Near the top or
 *   bottom of the scroller it scrolls. Escape puts the row back. On a
 *   focused grip, Up and Down move a link within its level, Right puts it
 *   under the link above and Left brings it back out.
 */
import * as React from "react"
import { flushSync } from "react-dom"

import { hapticTap } from "@/lib/native-bridge"
import { whenFingerGone } from "@/lib/website-builder/touch-target"

export interface TreeLink {
  id: string
  children?: TreeLink[]
}

export interface TreeDragOptions {
  items: TreeLink[]
  /** Whether a link can go under another at all. */
  nested: boolean
  /** One level's indent, px. */
  step: number
  maxLinks?: number
  maxSubLinks?: number
  /** Puts a link at `index` of `parentId`'s links (`null`, the top), counted without the link itself. */
  onPlace: (id: string, parentId: string | null, index: number) => void
  /** Within one level, for the keyboard. */
  onMove: (parentId: string | null, from: number, to: number) => void
  /** In under the link above (1), or out (-1), for the keyboard. */
  onNest?: (id: string, dir: 1 | -1) => void
  canNest: (index: number) => boolean
  canOut: () => boolean
  onStart?: () => void
}

interface Row {
  id: string
  depth: number
  parentId: string | null
  bar: HTMLElement
}

interface Target {
  /** The gap: before the k-th row left in the list. */
  k: number
  depth: number
  parentId: string | null
  index: number
}

interface Live {
  id: string
  pointerId: number
  startX: number
  x: number
  y: number
  depth: number
  parentId: string | null
  index: number
  hasKids: boolean
  rows: Row[]
  target: Target | null
  ghost: HTMLElement
  grabX: number
  grabY: number
  row: HTMLElement
  scroller: HTMLElement | null
  raf: number
  capture: HTMLElement
  /** The listeners this drag added, so the same ones come off whatever has rendered since. */
  on: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; key: (e: KeyboardEvent) => void }
  /** Stops listening for the touch ending (whenFingerGone). */
  gone?: () => void
}

const EDGE = 56
const MAX_SPEED = 14
/** A finger held this long, without moving, picks a row up. */
export const LONG_PRESS_MS = 380
const SLOP = 8
const LINE = "#8b5cf6"

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

/** The colour the list is drawn on, so the lifted copy is the same surface (white, or the dark settings card). */
function surfaceOf(el: HTMLElement): string {
  let node: HTMLElement | null = el
  while (node) {
    const bg = getComputedStyle(node).backgroundColor
    if (bg && bg !== "transparent" && !/rgba\(\d+, \d+, \d+, 0\)/.test(bg)) return bg
    node = node.parentElement
  }
  return "#fff"
}

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/** Each visible row in reading order, with its level and its parent. */
function readRows(list: HTMLElement): Row[] {
  return [...list.querySelectorAll<HTMLElement>("[data-link-row]")].map((row) => {
    const depth = Number(row.dataset.linkDepth ?? 0)
    const parentRow = depth > 0 ? row.parentElement?.closest<HTMLElement>("[data-link-row]") : null
    return {
      id: row.dataset.linkRow ?? "",
      depth,
      parentId: parentRow?.dataset.linkRow ?? null,
      bar: row.querySelector<HTMLElement>("[data-link-bar]") ?? row,
    }
  })
}

export function useLinkTreeDrag(opts: TreeDragOptions) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const lineRef = React.useRef<HTMLDivElement>(null)
  const optsRef = React.useRef(opts)
  optsRef.current = opts
  const live = React.useRef<Live | null>(null)
  const [dragging, setDragging] = React.useState<string | null>(null)
  /** A long press waiting to fire. */
  const press = React.useRef<{ timer: number; x: number; y: number; pointerId: number; id: string; el: HTMLElement } | null>(null)
  /** The click that ends a drag is not also a press on the row. */
  const swallowClick = React.useRef(false)

  const childrenOf = (parentId: string | null): TreeLink[] => {
    const items = optsRef.current.items
    if (parentId === null) return items
    return items.find((l) => l.id === parentId)?.children ?? []
  }

  /** The gap and level under the pointer, or null where nothing may land. */
  const project = (d: Live): Target | null => {
    const o = optsRef.current
    const rows = d.rows
    let k = 0
    for (const r of rows) {
      const b = r.bar.getBoundingClientRect()
      if (d.y > b.top + b.height / 2) k++
      else break
    }
    const prev = rows[k - 1]
    const next = rows[k]
    const maxDepth = o.nested && prev && !d.hasKids ? Math.min(prev.depth + 1, 1) : 0
    const minDepth = next ? next.depth : 0
    if (minDepth > maxDepth) return null
    const wanted = d.depth + Math.round((d.x - d.startX) / o.step)
    let depth = Math.max(minDepth, Math.min(maxDepth, wanted))
    const parentFor = (dp: number) => (dp === 0 ? null : prev!.depth === 0 ? prev!.id : prev!.parentId)
    const room = (dp: number) => {
      const p = parentFor(dp)
      if (p === d.parentId) return true
      const count = childrenOf(p).filter((l) => l.id !== d.id).length
      return count < (dp === 0 ? o.maxLinks ?? Infinity : o.maxSubLinks ?? Infinity)
    }
    if (!room(depth)) {
      const other = depth === 1 ? 0 : 1
      if (other < minDepth || other > maxDepth || !room(other)) return null
      depth = other
    }
    const parentId = parentFor(depth)
    const index = rows.slice(0, k).filter((r) => r.depth === depth && r.parentId === parentId).length
    return { k, depth, parentId, index }
  }

  const drawLine = (d: Live) => {
    const line = lineRef.current
    const list = listRef.current
    if (!line || !list) return
    const t = d.target
    if (!t) {
      line.style.opacity = "0"
      return
    }
    const box = list.getBoundingClientRect()
    const prev = d.rows[t.k - 1]
    const next = d.rows[t.k]
    let y: number
    if (next) y = next.bar.getBoundingClientRect().top
    else if (prev) {
      /* After the last row: under it and any sub-links it has. */
      const rowEl = prev.bar.closest<HTMLElement>("[data-link-row]")
      y = (rowEl ?? prev.bar).getBoundingClientRect().bottom
    } else y = box.top
    const left = t.depth * optsRef.current.step + 6
    /* Where it first shows, it appears; from gap to gap, it glides. */
    const first = line.style.opacity !== "1"
    line.style.transition = first ? "none" : ""
    line.style.opacity = "1"
    line.style.transform = `translate3d(${left}px, ${Math.round(y - box.top - 1)}px, 0)`
    line.style.width = `${Math.max(40, box.width - left - 4)}px`
    line.dataset.depth = String(t.depth)
  }

  const frame = () => {
    const d = live.current
    if (!d) return
    /* Near an edge, the scroller scrolls under the held row. */
    const box = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    let speed = 0
    if (d.y < box.top + EDGE) speed = -MAX_SPEED * Math.min(1, (box.top + EDGE - d.y) / EDGE)
    else if (d.y > box.bottom - EDGE) speed = MAX_SPEED * Math.min(1, (d.y - (box.bottom - EDGE)) / EDGE)
    if (speed) {
      if (d.scroller) d.scroller.scrollTop += speed
      else window.scrollBy(0, speed)
    }
    d.ghost.style.transform = `translate3d(${d.x - d.grabX}px, ${d.y - d.grabY}px, 0)`
    const t = project(d)
    const same = t && d.target && t.k === d.target.k && t.depth === d.target.depth
    if (!same) {
      if (t || d.target) hapticTap("light")
      d.target = t
    }
    drawLine(d)
    d.raf = requestAnimationFrame(frame)
  }

  const onMoveEvt = (ev: PointerEvent) => {
    const d = live.current
    if (!d || ev.pointerId !== d.pointerId) return
    d.x = ev.clientX
    d.y = ev.clientY
    /* Ours alone: the sheet underneath must not read this finger as a pull. */
    ev.stopPropagation()
  }

  const cleanup = (d: Live) => {
    cancelAnimationFrame(d.raf)
    d.gone?.()
    window.removeEventListener("pointermove", d.on.move, true)
    window.removeEventListener("pointerup", d.on.up, true)
    window.removeEventListener("pointercancel", d.on.up, true)
    window.removeEventListener("keydown", d.on.key, true)
    try {
      d.capture.releasePointerCapture(d.pointerId)
    } catch {
      /* already released */
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("-webkit-user-select")
    d.row.style.removeProperty("opacity")
    if (lineRef.current) lineRef.current.style.opacity = "0"
  }

  const finish = (commit: boolean) => {
    const d = live.current
    if (!d) return
    live.current = null
    cleanup(d)
    const t = commit ? d.target : null
    const moves = !!t && !(t.parentId === d.parentId && t.index === d.index)
    const ghost = d.ghost
    const still = reducedMotion()
    /* The copy goes to where the row will be (the line), or back where it came from. */
    const list = listRef.current
    let toY = d.row.getBoundingClientRect().top
    let toX = d.row.getBoundingClientRect().left
    if (moves && lineRef.current && list) {
      const lb = lineRef.current.getBoundingClientRect()
      toY = lb.top
      toX = list.getBoundingClientRect().left + t!.depth * optsRef.current.step
    }
    if (still) ghost.remove()
    else {
      ghost.style.transition = "transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease-out"
      ghost.style.transform = `translate3d(${toX}px, ${toY}px, 0)`
      ghost.style.opacity = "0"
      window.setTimeout(() => ghost.remove(), 180)
    }
    swallowClick.current = true
    window.setTimeout(() => {
      swallowClick.current = false
    }, 350)
    flushSync(() => setDragging(null))
    if (moves) {
      hapticTap("medium")
      optsRef.current.onPlace(d.id, t!.parentId, t!.index)
    }
  }

  function onUpEvt(ev: PointerEvent) {
    const d = live.current
    if (!d || ev.pointerId !== d.pointerId) return
    d.x = ev.clientX
    d.y = ev.clientY
    if (ev.type === "pointerup") d.target = project(d)
    finish(ev.type === "pointerup")
  }

  function onKeyEvt(ev: KeyboardEvent) {
    if (ev.key !== "Escape" || !live.current) return
    ev.preventDefault()
    ev.stopPropagation()
    finish(false)
  }

  const begin = (id: string, pointerId: number, x: number, y: number, capture: HTMLElement) => {
    const list = listRef.current
    if (!list || live.current) return
    const all = readRows(list)
    const me = all.find((r) => r.id === id)
    if (!me) return
    const rowEl = me.bar.closest<HTMLElement>("[data-link-row]") ?? me.bar
    const kids = all.filter((r) => r.parentId === id).map((r) => r.id)
    const siblings = all.filter((r) => r.depth === me.depth && r.parentId === me.parentId)
    optsRef.current.onStart?.()
    /* The row as it looks, lifted: a copy that follows the pointer. */
    const b = me.bar.getBoundingClientRect()
    const ghost = me.bar.cloneNode(true) as HTMLElement
    ghost.removeAttribute("data-link-bar")
    ghost.setAttribute("aria-hidden", "true")
    ghost.setAttribute("data-link-ghost", "")
    Object.assign(ghost.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${b.width}px`,
      height: `${b.height}px`,
      margin: "0",
      zIndex: "1000",
      pointerEvents: "none",
      borderRadius: "8px",
      background: surfaceOf(list),
      boxShadow: "0 0 0 1px rgba(0,0,0,0.06), 0 10px 28px -6px rgba(0,0,0,0.22)",
      transform: `translate3d(${b.left}px, ${b.top}px, 0)`,
      willChange: "transform",
      opacity: "0.97",
    })
    if (kids.length > 0) {
      const badge = document.createElement("span")
      badge.textContent = `+${kids.length}`
      Object.assign(badge.style, { marginRight: "8px", fontSize: "11px", fontWeight: "500", color: "#6b7280" })
      ghost.append(badge)
    }
    document.body.append(ghost)
    rowEl.style.opacity = "0.35"
    try {
      capture.setPointerCapture(pointerId)
    } catch {
      /* a synthetic pointer cannot be captured; the window listeners still hear it */
    }
    document.body.style.setProperty("user-select", "none")
    document.body.style.setProperty("-webkit-user-select", "none")
    live.current = {
      id,
      pointerId,
      startX: x,
      x,
      y,
      depth: me.depth,
      parentId: me.parentId,
      index: siblings.findIndex((r) => r.id === id),
      hasKids: kids.length > 0,
      rows: all.filter((r) => r.id !== id && !kids.includes(r.id)),
      target: null,
      ghost,
      grabX: x - b.left,
      grabY: y - b.top,
      row: rowEl,
      scroller: scrollerOf(list),
      raf: 0,
      capture,
      on: { move: onMoveEvt, up: onUpEvt, key: onKeyEvt },
    }
    window.addEventListener("pointermove", onMoveEvt, true)
    window.addEventListener("pointerup", onUpEvt, true)
    window.addEventListener("pointercancel", onUpEvt, true)
    window.addEventListener("keydown", onKeyEvt, true)
    /*
      AND THE TOUCH ITSELF ENDING. While a row is held the list cancels every
      touchmove (below), so a hold whose pointerup never came cancelled every
      swipe on the list after it. See lib/website-builder/touch-target.ts.
    */
    live.current.gone = whenFingerGone(window, document, () => {
      if (live.current?.pointerId === pointerId) finish(false)
    })
    hapticTap("medium")
    setDragging(id)
    live.current.raf = requestAnimationFrame(frame)
  }

  /*
    A FINGER THAT HAS PICKED A ROW UP OWNS THE GESTURE. Registered on the
    list before any touch starts, and not passive, so the browser asks it
    before it scrolls: while a row is held, the page and the sheet stay put.
    Until then it does nothing, and a swipe over the rows scrolls.
  */
  React.useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onTouchMove = (e: TouchEvent) => {
      if (live.current) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (!swallowClick.current) return
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
    list.addEventListener("touchmove", onTouchMove, { passive: false })
    list.addEventListener("click", onClick, true)
    return () => {
      list.removeEventListener("touchmove", onTouchMove)
      list.removeEventListener("click", onClick, true)
    }
  }, [])

  React.useEffect(
    () => () => {
      if (press.current) window.clearTimeout(press.current.timer)
      const d = live.current
      if (d) {
        live.current = null
        cleanup(d)
        d.ghost.remove()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** The grip: picks the row up at once, under any pointer. */
  const gripProps = (id: string, parentId: string | null, index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || live.current) return
      e.preventDefault()
      e.stopPropagation()
      begin(id, e.pointerId, e.clientX, e.clientY, e.currentTarget)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const o = optsRef.current
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && o.nested && o.onNest) {
        e.preventDefault()
        const dir = e.key === "ArrowRight" ? 1 : -1
        if (dir === 1 ? parentId === null && o.canNest(index) : parentId !== null && o.canOut()) o.onNest(id, dir)
        return
      }
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
      e.preventDefault()
      const to = e.key === "ArrowUp" ? index - 1 : index + 1
      if (to < 0 || to >= childrenOf(parentId).length) return
      o.onMove(parentId, index, to)
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    "data-sheet-no-drag": "",
    style: { touchAction: "none" } as React.CSSProperties,
  })

  /** The rest of a row: a finger held still picks it up; a mouse uses the grip. */
  const rowPressProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" || live.current) return
      if ((e.target as HTMLElement).closest("[data-link-actions], [data-link-grip], input, select, textarea, a")) return
      const el = e.currentTarget
      const p = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, id, el, timer: 0 }
      p.timer = window.setTimeout(() => {
        if (press.current !== p) return
        press.current = null
        begin(id, p.pointerId, p.x, p.y, el)
      }, LONG_PRESS_MS)
      press.current = p
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = press.current
      if (p && p.pointerId === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) {
        window.clearTimeout(p.timer)
        press.current = null
      }
    },
    onPointerUp: () => {
      if (press.current) window.clearTimeout(press.current.timer)
      press.current = null
    },
    onPointerCancel: () => {
      if (press.current) window.clearTimeout(press.current.timer)
      press.current = null
    },
    /* A phone's own long press is a context menu and a text selection; the hold here is a pick up. */
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties,
  })

  /** The line that says where a held row would land. */
  const line = React.createElement("div", {
    ref: lineRef,
    "aria-hidden": true,
    "data-link-drop-line": "",
    className: "pointer-events-none absolute left-0 top-0 z-20 h-0.5 rounded-full opacity-0 transition-[transform,width] duration-100 ease-out motion-reduce:transition-none",
    style: { background: LINE },
  }, React.createElement("span", {
    className: "absolute -left-1 -top-[3px] h-2 w-2 rounded-full border-2 bg-background",
    style: { borderColor: LINE },
  }))

  return { listRef, gripProps, rowPressProps, dragging, line }
}
