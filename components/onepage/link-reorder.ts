"use client"

/**
 * ===========================================================================
 *  DRAGGING A LINK CARD, UNDER THE FINGER, FRAME FOR FRAME
 * ===========================================================================
 * "There's no real time tracking with my touch." The list used two systems:
 * HTML5 drag and drop for a mouse, which draws a ghost picture the page has
 * no say over and never fires for a finger, and a touch path that wrote the
 * finger's offset into React state on every touchmove, so the whole Links tab
 * (and its preview) rendered once per event and the card arrived a frame or
 * three after the finger. The other cards did not move out of the way; a
 * violet line said where the card would go.
 *
 * Now one set of pointer listeners serves a mouse, a finger and a pen, and
 * React hears nothing until the card has landed:
 *
 *   THE CARD FOLLOWS 1:1. The pointer's position is kept in a ref, and one
 *   requestAnimationFrame loop writes the lifted card's `transform` from it,
 *   scrolling included, so the card stays under the finger while the pane
 *   scrolls itself near an edge.
 *
 *   THE OTHERS SLIDE. A card the lifted one passes gets a translate of one
 *   slot the other way, with a CSS transition on `transform`, so it glides
 *   on the compositor. Nothing is re-laid out until the drop.
 *
 *   THE DROP SETTLES ON A SPRING. From the release speed to the new slot, a
 *   short, slightly under-damped spring; then the order is written once
 *   through the page's own reorderBlocks and the transforms are taken off in
 *   a layout effect, before that render is painted, so the page never shows
 *   the old order for a frame.
 *
 *   LIFTED IS A LITTLE DEEPER, NOTHING ELSE. Scale 1.015 and a soft shadow
 *   that fades in (opacity only; the shadow is its own layer). No ring, no
 *   tint.
 *
 * HOW A DRAG STARTS. A mouse: press anywhere on a card's row and move 3px.
 * A finger on the grip: at once (the grip is `touch-action: none`). A finger
 * anywhere else on the row: hold still for HOLD_MS, so a swipe over the
 * cards still scrolls the page. Once lifted, a non-passive touchmove
 * listener keeps the browser from turning the gesture into a scroll.
 *
 * The keyboard is the grip's own (see links-tab): arrow keys move the card
 * one place and a live region says where it is.
 */
import * as React from "react"
import { hapticTap } from "@/lib/native-bridge"
import { edgeSpeed, edgeStep } from "@/lib/onepage/edge-scroll"

/** A finger held this long on a card, without wandering, lifts it. */
export const HOLD_MS = 280
/** How far a finger may wander during the hold and still be a hold. */
const HOLD_TOLERANCE_PX = 8
/** A mouse that moves this far with the button down is dragging. */
const MOUSE_SLOP_PX = 3
/** How much bigger a lifted card is. */
const LIFT_SCALE = 1.015
const LIFT_MS = 160
/** The glide of a card getting out of the way. */
const SHIFT_TRANSITION = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)"
/** The settle: stiff enough to be quick, a touch under-damped so it lands. */
const SPRING_K = 540
const SPRING_C = 38
/* Near an edge of the pane, it scrolls: how fast is lib/onepage/edge-scroll. */

const INTERACTIVE = "button, a, input, textarea, select, label, [contenteditable], [role=switch], [role=slider], [data-no-reorder]"

type Phase = "idle" | "pending" | "dragging" | "settling"

interface Session {
  phase: Phase
  pointerId: number
  touch: boolean
  id: string
  from: number
  items: HTMLElement[]
  ids: string[]
  tops: number[]
  bottoms: number[]
  /** The lifted card's height plus the gap, which is how far a passed card slides. */
  slot: number
  shifts: number[]
  to: number
  into: string | null
  startX: number
  startY: number
  lastY: number
  samples: { t: number; y: number }[]
  scroller: HTMLElement | null
  startScroll: number
  liftAt: number
  dy: number
  raf: number
  hold: number
  /** When the pointer went into an edge's zone (0: not in one), and the last frame's time. */
  edgeAt: number
  frameAt: number
  /** The part of a pixel a slow scroll has not yet moved. */
  carry: number
}

export interface LinkReorderOptions {
  /** The list: its direct children marked `data-reorder-item` are the cards. */
  listRef: React.RefObject<HTMLElement | null>
  /** Where a card may land; return another index to keep it out of a place. */
  clampTarget?: (id: string, to: number) => number
  /** Whether the card `dragId` may be dropped into the card `targetId` (a group). */
  acceptsInto?: (dragId: string, targetId: string) => boolean
  /** The card landed at `to`. Write the order. */
  onReorder: (id: string, to: number) => void
  /** The card was dropped into `targetId`. */
  onDropInto?: (id: string, targetId: string) => void
}

/*
  THE BOX THAT REALLY SCROLLS (round AL). The Links tab marked its own
  column `data-scroll-container` too, inside the editor's panel that has the
  same mark, and the nearest one won: a column that does not scroll, so the
  edge scroll added to a scrollTop that stayed 0 and a card could never be
  carried past what was on screen. A marked box counts only if it scrolls.
*/
const scrolls = (node: HTMLElement) => {
  const oy = getComputedStyle(node).overflowY
  return oy === "auto" || oy === "scroll"
}
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  let marked = el.closest<HTMLElement>("[data-scroll-container]")
  while (marked && !scrolls(marked)) marked = marked.parentElement?.closest<HTMLElement>("[data-scroll-container]") ?? null
  if (marked) return marked
  let node = el.parentElement
  while (node && node !== document.body) {
    if (scrolls(node) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

const scrollTopOf = (s: HTMLElement | null) => (s ? s.scrollTop : window.scrollY)
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
const lift = (el: HTMLElement) => el.querySelector<HTMLElement>(":scope > [data-lift-shadow]")

export function useLinkReorder({ listRef, clampTarget, acceptsInto, onReorder, onDropInto }: LinkReorderOptions) {
  const s = React.useRef<Session | null>(null)
  /* The caller's functions change every render; the gesture reads the latest. */
  const opts = React.useRef({ clampTarget, acceptsInto, onReorder, onDropInto })
  opts.current = { clampTarget, acceptsInto, onReorder, onDropInto }
  /** Set at the drop, taken off in the layout effect once React has drawn the new order. */
  const flip = React.useRef<{ order: string[]; tops: Map<string, number>; timer: number } | null>(null)
  const [, bump] = React.useReducer((n: number) => n + 1, 0)

  const items = React.useCallback(() => {
    const list = listRef.current
    return list ? [...list.querySelectorAll<HTMLElement>(":scope > [data-reorder-item]")] : []
  }, [listRef])

  /** Every card back to its own place with no transition, and the list quiet again. */
  const clearStyles = React.useCallback((els: HTMLElement[]) => {
    for (const el of els) {
      el.style.transition = ""
      el.style.transform = ""
      el.style.willChange = ""
      el.style.zIndex = ""
      el.style.opacity = ""
      el.removeAttribute("data-drop-into")
      const sh = lift(el)
      if (sh) sh.style.opacity = ""
    }
    listRef.current?.removeAttribute("data-reordering")
  }, [listRef])

  const onTouchMove = React.useCallback((e: TouchEvent) => {
    if (s.current?.phase === "dragging" && e.cancelable) e.preventDefault()
  }, [])
  const onContextMenu = React.useCallback((e: Event) => {
    const p = s.current?.phase
    if (p === "pending" || p === "dragging") e.preventDefault()
  }, [])
  const swallowClick = React.useCallback((e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }, [])

  /** Where the lifted card is going, from where it is now. Writes the others' slides when that changes. */
  const place = React.useCallback((d: Session) => {
    const top = d.tops[d.from] + d.dy
    const bottom = d.bottoms[d.from] + d.dy
    const centre = (top + bottom) / 2

    /* Over the middle half of a group that takes it: into the group, and nothing moves. */
    let into: string | null = null
    const accepts = opts.current.acceptsInto
    if (accepts) {
      for (let i = 0; i < d.ids.length; i++) {
        if (i === d.from || !accepts(d.id, d.ids[i])) continue
        const t = d.tops[i] + d.shifts[i]
        const h = d.bottoms[i] - d.tops[i]
        if (centre > t + h * 0.25 && centre < t + h * 0.75) {
          into = d.ids[i]
          break
        }
      }
    }
    if (into !== d.into) {
      if (d.into) d.items[d.ids.indexOf(d.into)]?.removeAttribute("data-drop-into")
      if (into) {
        d.items[d.ids.indexOf(into)]?.setAttribute("data-drop-into", "")
        if (d.touch) hapticTap("soft")
      }
      d.into = into
    }
    if (into) return

    /*
      PAST A GROUP ONLY BY ITS MIDDLE (round 11). A card passes another when
      its leading edge crosses that card's middle, half a card before its
      centre gets there; a group that would take it moved out of the way
      first, so a card brought up to a group from below (or down from above)
      chased it down the list and was never dropped in. Past a group that
      takes it, the card's centre is what counts, so it meets the group's
      middle half (in) before the group moves.
    */
    const takes = (i: number) => !!accepts && accepts(d.id, d.ids[i])
    let to = d.from
    for (let i = d.from - 1; i >= 0; i--) {
      if ((takes(i) ? centre : top) < (d.tops[i] + d.bottoms[i]) / 2) to = i
      else break
    }
    for (let i = d.from + 1; i < d.ids.length; i++) {
      if ((takes(i) ? centre : bottom) > (d.tops[i] + d.bottoms[i]) / 2) to = i
      else break
    }
    const clamp = opts.current.clampTarget
    if (clamp) to = Math.max(0, Math.min(d.ids.length - 1, clamp(d.id, to)))
    if (to === d.to) return
    d.to = to
    if (d.touch) hapticTap("soft")
    for (let i = 0; i < d.items.length; i++) {
      if (i === d.from) continue
      const shift = d.from < i && i <= to ? -d.slot : to <= i && i < d.from ? d.slot : 0
      if (shift === d.shifts[i]) continue
      d.shifts[i] = shift
      d.items[i].style.transform = shift ? `translate3d(0, ${shift}px, 0)` : "translate3d(0, 0, 0)"
    }
  }, [])

  const frame = React.useCallback((now: number) => {
    const d = s.current
    if (!d || d.phase !== "dragging") return
    /*
      Near the top or bottom of the pane, the pane scrolls and the card rides
      along: slow at the zone's rim, faster deeper in, eased in as the pointer
      arrives, in px a second (lib/onepage/edge-scroll). Without a scrolling
      box (a page that scrolls itself) the window is the pane.
    */
    {
      const box = d.scroller ? d.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
      const bar = document.querySelector<HTMLElement>("[data-onepage-tabbar]")
      const barTop = bar && bar.getClientRects().length ? bar.getBoundingClientRect().top : Infinity
      const top = Math.max(0, box.top)
      const bottom = Math.min(box.bottom, window.innerHeight, barTop)
      const dt = d.frameAt ? now - d.frameAt : 16
      d.frameAt = now
      const max = d.scroller ? d.scroller.scrollHeight - d.scroller.clientHeight : document.documentElement.scrollHeight - window.innerHeight
      const at = scrollTopOf(d.scroller)
      let speed = edgeSpeed(d.lastY, top, bottom, d.edgeAt ? now - d.edgeAt : 0)
      /* At the end it can go no further: nothing is eased in against a wall. */
      if ((speed < 0 && at <= 0) || (speed > 0 && at >= max - 0.5)) speed = 0
      if (speed) {
        if (!d.edgeAt) d.edgeAt = now
        d.carry += edgeStep(speed, dt)
        const whole = Math.trunc(d.carry)
        if (whole) {
          d.carry -= whole
          if (d.scroller) d.scroller.scrollTop = Math.max(0, Math.min(max, at + whole))
          else window.scrollTo(0, Math.max(0, Math.min(max, at + whole)))
        }
      } else {
        d.edgeAt = 0
        d.carry = 0
      }
    }
    d.dy = d.lastY - d.startY + (scrollTopOf(d.scroller) - d.startScroll)
    const k = Math.min(1, (now - d.liftAt) / LIFT_MS)
    const scale = 1 + (LIFT_SCALE - 1) * (1 - (1 - k) * (1 - k))
    d.items[d.from].style.transform = `translate3d(0, ${d.dy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
    place(d)
    d.raf = requestAnimationFrame(frame)
  }, [place])

  const detach = React.useCallback(() => {
    window.removeEventListener("pointermove", onMoveRef.current)
    window.removeEventListener("pointerup", onUpRef.current)
    window.removeEventListener("pointercancel", onCancelRef.current)
    window.removeEventListener("keydown", onKeyRef.current, true)
    document.removeEventListener("touchmove", onTouchMove)
    document.removeEventListener("contextmenu", onContextMenu, true)
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("-webkit-user-select")
    document.body.style.removeProperty("cursor")
  }, [onTouchMove, onContextMenu])

  /** Once the card has landed: write the order and let the layout effect take the transforms off. */
  const land = React.useCallback((d: Session, dropped: boolean) => {
    const els = d.items
    if (!dropped || (d.to === d.from && !d.into)) {
      /* Nothing to write. The lifted card is home; a card still gliding
         back finishes its glide before its transform comes off. */
      s.current = null
      const me = els[d.from]
      if (me) clearStyles([me])
      window.setTimeout(() => {
        if (!s.current) clearStyles(els)
      }, 240)
      return
    }
    const tops = new Map<string, number>()
    els.forEach((el, i) => tops.set(d.ids[i], el.getBoundingClientRect().top))
    const order = d.into ? d.ids.filter((x) => x !== d.id) : (() => {
      const o = d.ids.filter((x) => x !== d.id)
      o.splice(d.to, 0, d.id)
      return o
    })()
    flip.current = {
      order,
      tops,
      /* Should the page not redraw (a write refused), the cards still come back. */
      timer: window.setTimeout(() => {
        if (!flip.current) return
        flip.current = null
        clearStyles(items())
      }, 600),
    }
    s.current = null
    if (d.into) opts.current.onDropInto?.(d.id, d.into)
    else opts.current.onReorder(d.id, d.to)
    bump()
  }, [clearStyles, items])

  /** The release: the card springs from where the finger left it to its slot. */
  const settle = React.useCallback((d: Session, dropped: boolean) => {
    cancelAnimationFrame(d.raf)
    d.phase = "settling"
    detach()
    const el = d.items[d.from]
    const shadow = lift(el)
    if (shadow) shadow.style.opacity = "0"
    if (!dropped) {
      if (d.into) d.items[d.ids.indexOf(d.into)]?.removeAttribute("data-drop-into")
      d.into = null
      d.to = d.from
      d.items.forEach((it, i) => {
        if (i !== d.from && d.shifts[i]) {
          d.shifts[i] = 0
          it.style.transform = "translate3d(0, 0, 0)"
        }
      })
    }
    if (d.into) {
      /* Into a group: every card back in place, and this one goes in. */
      d.items.forEach((it, i) => {
        if (i !== d.from && d.shifts[i]) it.style.transform = "translate3d(0, 0, 0)"
      })
      el.style.transition = "transform 180ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms linear"
      el.style.transform = `translate3d(0, ${d.dy.toFixed(2)}px, 0) scale(0.96)`
      el.style.opacity = "0"
      window.setTimeout(() => land(d, true), reduced() ? 0 : 190)
      if (d.touch) hapticTap("light")
      return
    }
    const target = d.to > d.from ? d.bottoms[d.to] - d.bottoms[d.from] : d.to < d.from ? d.tops[d.to] - d.tops[d.from] : 0
    if (dropped && d.to !== d.from && d.touch) hapticTap("light")
    if (reduced()) {
      el.style.transform = `translate3d(0, ${target}px, 0)`
      land(d, dropped)
      return
    }
    /* The release speed, over the last 80ms of samples rather than the last two events. */
    const now = performance.now()
    const recent = d.samples.filter((p) => now - p.t < 80)
    let v = 0
    if (recent.length > 1) {
      const a = recent[0]
      const b = recent[recent.length - 1]
      v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0
    }
    v = Math.max(-3000, Math.min(3000, v))
    let x = d.dy - target
    const startScale = parseFloat(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? String(LIFT_SCALE)) || 1
    const x0 = Math.abs(x) || 1
    let last = now
    const began = now
    const step = (t: number) => {
      const dt = Math.min(0.032, Math.max(0, (t - last) / 1000))
      last = t
      /* A few small steps a frame keep the spring stable at 60 or 120Hz. */
      for (let i = 0; i < 4; i++) {
        const h = dt / 4
        const a = -SPRING_K * x - SPRING_C * v
        v += a * h
        x += v * h
      }
      const done = (Math.abs(x) < 0.4 && Math.abs(v) < 12) || t - began > 700
      if (done) x = 0
      const p = Math.min(1, Math.abs(x) / x0)
      const scale = 1 + (startScale - 1) * (done ? 0 : Math.min(1, p * 1.4))
      el.style.transform = `translate3d(0, ${(target + x).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
      if (done) land(d, dropped)
      else d.raf = requestAnimationFrame(step)
    }
    d.raf = requestAnimationFrame(step)
  }, [detach, land])

  const begin = React.useCallback((d: Session) => {
    const els = items()
    const from = els.findIndex((el) => el.getAttribute("data-block-id") === d.id)
    if (from < 0 || els.length < 2) {
      s.current = null
      detach()
      return
    }
    const rects = els.map((el) => el.getBoundingClientRect())
    d.items = els
    d.ids = els.map((el) => el.getAttribute("data-block-id") || "")
    d.tops = rects.map((r) => r.top)
    d.bottoms = rects.map((r) => r.bottom)
    d.from = from
    d.to = from
    d.shifts = els.map(() => 0)
    const gap = rects.length > 1 ? Math.max(0, (from < rects.length - 1 ? rects[from + 1].top - rects[from].bottom : rects[from].top - rects[from - 1].bottom)) : 0
    d.slot = rects[from].height + gap
    d.startScroll = scrollTopOf(d.scroller)
    d.startY = d.lastY
    d.dy = 0
    d.phase = "dragging"
    d.liftAt = performance.now()
    listRef.current?.setAttribute("data-reordering", "")
    els.forEach((el, i) => {
      el.style.willChange = "transform"
      el.style.transition = i === from ? "none" : SHIFT_TRANSITION
    })
    const me = els[from]
    me.style.zIndex = "30"
    const shadow = lift(me)
    if (shadow) shadow.style.opacity = "1"
    document.body.style.setProperty("user-select", "none")
    document.body.style.setProperty("-webkit-user-select", "none")
    if (!d.touch) document.body.style.setProperty("cursor", "grabbing")
    /* The click a mouse or a finger makes on the way up is not a tap on the card. */
    window.addEventListener("click", swallowClick, true)
    if (d.touch) hapticTap("medium")
    else {
      /* A mouse that leaves the window keeps the drag. */
      try {
        me.setPointerCapture(d.pointerId)
      } catch {
        /* a pointer that cannot be captured still reaches the window listeners */
      }
    }
    d.raf = requestAnimationFrame(frame)
  }, [items, detach, frame, listRef, swallowClick])

  const onMove = React.useCallback((e: PointerEvent) => {
    const d = s.current
    if (!d || e.pointerId !== d.pointerId) return
    d.lastY = e.clientY
    const now = performance.now()
    d.samples.push({ t: now, y: e.clientY })
    if (d.samples.length > 12) d.samples.shift()
    if (d.phase === "pending") {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      if (d.touch) {
        /* Moved before the hold ran out: that was a scroll, not a lift. */
        if (dist > HOLD_TOLERANCE_PX) {
          window.clearTimeout(d.hold)
          s.current = null
          detach()
        }
      } else if (dist > MOUSE_SLOP_PX) {
        begin(d)
      }
    }
  }, [begin, detach])
  const onUp = React.useCallback((e: PointerEvent) => {
    const d = s.current
    if (!d || e.pointerId !== d.pointerId) return
    window.clearTimeout(d.hold)
    if (d.phase === "dragging") {
      settle(d, true)
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 0)
    } else if (d.phase === "pending") {
      s.current = null
      detach()
    }
  }, [settle, detach, swallowClick])
  const onCancel = React.useCallback((e: PointerEvent) => {
    const d = s.current
    if (!d || e.pointerId !== d.pointerId) return
    window.clearTimeout(d.hold)
    window.removeEventListener("click", swallowClick, true)
    if (d.phase === "dragging") settle(d, false)
    else {
      s.current = null
      detach()
    }
  }, [settle, detach, swallowClick])
  const onKey = React.useCallback((e: KeyboardEvent) => {
    const d = s.current
    if (!d || e.key !== "Escape") return
    e.preventDefault()
    e.stopPropagation()
    window.clearTimeout(d.hold)
    window.removeEventListener("click", swallowClick, true)
    if (d.phase === "dragging") settle(d, false)
    else {
      s.current = null
      detach()
    }
  }, [settle, detach, swallowClick])
  /* The listeners are added and removed by reference, so each lives in a ref the detach can reach. */
  const onMoveRef = React.useRef(onMove)
  const onUpRef = React.useRef(onUp)
  const onCancelRef = React.useRef(onCancel)
  const onKeyRef = React.useRef(onKey)

  const onPointerDown = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (s.current || (e.pointerType === "mouse" && e.button !== 0) || !e.isPrimary) return
    const target = e.target as HTMLElement
    const card = target.closest<HTMLElement>("[data-reorder-item]")
    if (!card || card.parentElement !== listRef.current || card.hasAttribute("data-reorder-fixed")) return
    if (!target.closest("[data-reorder-zone]")) return
    const grip = target.closest("[data-reorder-grip]")
    if (!grip && target.closest(INTERACTIVE)) return
    const touch = e.pointerType !== "mouse"
    const d: Session = {
      phase: "pending",
      pointerId: e.pointerId,
      touch,
      id: card.getAttribute("data-block-id") || "",
      from: -1,
      items: [],
      ids: [],
      tops: [],
      bottoms: [],
      slot: 0,
      shifts: [],
      to: -1,
      into: null,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      samples: [{ t: performance.now(), y: e.clientY }],
      scroller: scrollerOf(card),
      startScroll: 0,
      liftAt: 0,
      dy: 0,
      raf: 0,
      hold: 0,
      edgeAt: 0,
      frameAt: 0,
      carry: 0,
    }
    s.current = d
    onMoveRef.current = onMove
    onUpRef.current = onUp
    onCancelRef.current = onCancel
    onKeyRef.current = onKey
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("keydown", onKey, true)
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("contextmenu", onContextMenu, true)
    if (touch && grip) {
      /* The grip owns its finger: no hold, and no text selection on the way. */
      e.preventDefault()
      begin(d)
    } else if (touch) {
      d.hold = window.setTimeout(() => {
        if (s.current === d && d.phase === "pending") begin(d)
      }, HOLD_MS)
    } else {
      /* A mouse: no text selected while it drags. */
      e.preventDefault()
    }
  }, [listRef, onMove, onUp, onCancel, onKey, onTouchMove, onContextMenu, begin])

  /*
    AFTER THE ORDER IS WRITTEN. React has put the cards in their new order
    and the browser has not painted it yet. Every card is where its
    transform drew it; take the transforms off and, should any card not
    already sit exactly where it was drawn (a slide still running at the
    drop), glide it the rest of the way from there.
  */
  React.useLayoutEffect(() => {
    const f = flip.current
    if (!f) return
    const els = items()
    const now = els.map((el) => el.getAttribute("data-block-id") || "")
    if (now.length !== f.order.length || now.some((id, i) => id !== f.order[i])) return
    flip.current = null
    window.clearTimeout(f.timer)
    clearStyles(els)
    const moved: HTMLElement[] = []
    for (const el of els) {
      const was = f.tops.get(el.getAttribute("data-block-id") || "")
      if (was === undefined) continue
      const delta = was - el.getBoundingClientRect().top
      if (Math.abs(delta) < 0.5) continue
      el.style.transition = "none"
      el.style.transform = `translate3d(0, ${delta.toFixed(2)}px, 0)`
      moved.push(el)
    }
    if (!moved.length) return
    void moved[0].offsetHeight
    for (const el of moved) {
      el.style.transition = SHIFT_TRANSITION
      el.style.transform = "translate3d(0, 0, 0)"
    }
    window.setTimeout(() => {
      for (const el of moved) {
        el.style.transition = ""
        el.style.transform = ""
      }
    }, 260)
  })

  React.useEffect(() => () => {
    const d = s.current
    if (d) {
      cancelAnimationFrame(d.raf)
      window.clearTimeout(d.hold)
      /* Taken away mid drag (a tab switched, say): the cards go back and nothing is written. */
      if (d.items.length) clearStyles(d.items)
      s.current = null
    }
    window.removeEventListener("click", swallowClick, true)
    detach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { onPointerDown }
}
