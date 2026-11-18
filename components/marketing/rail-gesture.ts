/*
  A FINGER OR A MOUSE ON A RAIL, LANDING ROUND 9. The owner, of the showcase
  and of the creators rail: "I have to pull, press and swipe much longer to
  initialize the swipe" and "it must not mistake scrolling down for swiping".

  Round 8 read every pointer through pointer events alone and waited 8px
  before it decided. A finger reaches a page by two roads, and each browser
  is slow on one of them: Safari can hold back or cancel a touch's pointer
  events while it decides whether the page scrolls, and Chrome sends no
  touchmove inside its own 15px slop (measured, scripts/check-landing-r9-
  rails.mjs: 17px before the first one) while its pointermoves come from the
  first pixel. So now:

  - A finger is read from both, touch events and pointer events, as one
    gesture: whichever brings a move first moves the rail. A mouse or a pen
    is read from pointer events only.
  - touch-action: pan-y on the rail (its stylesheet) tells the browser that a
    sideways move is never its own, so it hands them over at once.
  - The way is decided after RAIL_AXIS.slop px: across if |dx| > |dy| *
    RAIL_AXIS.ratio (under about 40 degrees from level), down otherwise. One
    decision a gesture, never changed.
  - Across: the rail follows from that very point (start(), then move(0)
    onwards), so there is no jump, and every touchmove from then on is
    cancelled, so the page cannot also scroll.
  - Down: nothing is cancelled, ever. The page scrolls and the rail lets go.

  Nothing here reads layout, and the only work a move does is arithmetic.
*/
export const RAIL_AXIS = {
  /** px a pointer travels before its way is read. */
  slop: 4,
  /** Across needs |dx| > |dy| * ratio. */
  ratio: 1.2,
  /** The pointer's speed is read over its last this many ms. */
  velocityWindowMs: 90,
  /** A pointer that rested this long before lifting throws nothing. */
  restMs: 70,
} as const

/** Which way a gesture that has moved (dx, dy) goes: the rail's ("x"), the page's ("y"), or not yet known (null). */
export function railAxis(dx: number, dy: number): "x" | "y" | null {
  if (Math.hypot(dx, dy) < RAIL_AXIS.slop) return null
  return Math.abs(dx) > Math.abs(dy) * RAIL_AXIS.ratio ? "x" : "y"
}

export type RailRelease = {
  /** The gesture was a drag across (false: a tap, a hold, or one handed to the page's scroll). */
  dragged: boolean
  /** The way it went, if it got far enough to tell. */
  axis: "x" | "y" | null
  /** px a second at release, positive when the pointer was going left (the rail towards its later cards). 0 unless dragged. */
  speed: number
  /** A finger (or a pen) rather than a mouse. */
  touch: boolean
  /** The browser took the gesture away (a scroll, a second finger) rather than the pointer lifting. */
  cancelled: boolean
}

export type RailGestureHandlers = {
  /** A pointer is down on the rail: hold it where it is. Return false to leave this press alone. */
  press: (touch: boolean) => boolean | void
  /** The gesture is across: the rail is the pointer's from this point. */
  start: () => void
  /** The pointer is dx px from where the drag started (negative: it has gone left). */
  move: (dx: number) => void
  /** The pointer lifted, or the gesture went to the page. */
  release: (r: RailRelease) => void
}

/*
  finger: a touch, read from touch events (touchId) and pointer events (pointerId) alike. road: which of the two its
  moves are read from (landing round 12). Its pointer moves come first (Chrome sends no touchmove in its own slop); once
  its first touchmove comes, only touch moves are read. Two roads read at once could disagree by the rounding of one
  (WebKit's touches are whole pixels, its pointers are not) or arrive in either order, and the rail would step back
  and forth between them.
*/
type Held = { finger: boolean; touchId: number | null; pointerId: number | null; startX: number; startY: number; axis: "x" | "y" | null; road: "touch" | "pointer" | null; samples: Array<{ t: number; cx: number }> }

/** Reads presses, drags and throws on `el`. Returns `held` (a pointer is down on the rail) and `destroy`. */
export function bindRailGesture(el: HTMLElement, h: RailGestureHandlers): { held: () => boolean; destroy: () => void } {
  let held: Held | null = null
  let suppressClick = false
  /* Where there are touch events, a finger's end is theirs: a pointercancel alone (Chrome sends one when it scrolls) does not end it. */
  const touchEvents = "ontouchstart" in window

  const begin = (finger: boolean, x: number, y: number, t: number) => {
    if (h.press(finger) === false) return null
    held = { finger, touchId: null, pointerId: null, startX: x, startY: y, axis: null, road: null, samples: [{ t, cx: x }] }
    suppressClick = false
    return held
  }
  /* Returns true once the gesture is the rail's. */
  const travel = (x: number, y: number, t: number, road: "touch" | "pointer") => {
    const d = held
    if (!d) return false
    /* A finger's pointer moves, once its touch moves have begun: the same moves again, by the other road. */
    if (d.finger && d.road === "touch" && road === "pointer") return d.axis === "x"
    if (d.finger && d.road === "pointer" && road === "touch") {
      /* The switch: the touch move of the same moment as the last pointer move is the same place, whatever its rounding. */
      const last = d.samples[d.samples.length - 1]
      if (d.axis === "x" && last && Math.abs(t - last.t) < 8) {
        d.startX += x - last.cx
        last.cx = x
      }
    }
    if (d.finger) d.road = road
    if (!d.axis) {
      d.axis = railAxis(x - d.startX, y - d.startY)
      if (!d.axis) return false
      if (d.axis === "y") {
        end(t, false)
        return false
      }
      /* Taken from here, so the slop is not a jump: the rail moves from where the pointer is now. */
      d.startX = x
      d.samples = [{ t, cx: x }]
      h.start()
    }
    /* The same move by its second road (a pointermove after its touchmove): already drawn. */
    const last = d.samples[d.samples.length - 1]
    if (last && last.cx === x && t - last.t < 8) return true
    d.samples.push({ t, cx: x })
    while (d.samples.length > 2 && t - d.samples[0].t > RAIL_AXIS.velocityWindowMs) d.samples.shift()
    h.move(x - d.startX)
    return true
  }
  const end = (t: number, cancelled: boolean) => {
    const d = held
    if (!d) return
    held = null
    const dragged = d.axis === "x"
    let speed = 0
    const a = d.samples[0]
    const b = d.samples[d.samples.length - 1]
    if (dragged && a && b && b.t - a.t >= 8 && t - b.t <= RAIL_AXIS.restMs) speed = -((b.cx - a.cx) / (b.t - a.t)) * 1000
    if (dragged) suppressClick = true
    h.release({ dragged, axis: d.axis, speed, touch: d.finger, cancelled })
  }

  /* ---------- a finger, by touch events ---------- */
  const find = (list: TouchList, id: number | null) => {
    for (let i = 0; i < list.length; i++) if (id === null || list[i].identifier === id) return list[i]
    return null
  }
  const onTouchStart = (e: TouchEvent) => {
    /* A second finger is a pinch: the rail lets go and leaves it to the browser. */
    if (e.touches.length > 1) return held ? end(e.timeStamp, true) : undefined
    const t = e.changedTouches[0]
    /* Its pointerdown may have come first: the same finger. */
    const d = held && held.finger && held.touchId === null ? held : held ? null : begin(true, t.clientX, t.clientY, e.timeStamp)
    if (d) d.touchId = t.identifier
  }
  const onTouchMove = (e: TouchEvent) => {
    if (!held || !held.finger) return
    const t = find(e.touches, held.touchId)
    if (!t) return
    /* Across: the rail's, so the page must not scroll too. Down: never cancelled. */
    if (travel(t.clientX, t.clientY, e.timeStamp, "touch") && e.cancelable) e.preventDefault()
  }
  const onTouchEnd = (e: TouchEvent) => {
    if (!held || !held.finger || !find(e.changedTouches, held.touchId)) return
    end(e.timeStamp, e.type === "touchcancel")
  }

  /* ---------- a mouse, a pen, and a finger again by its pointer events ---------- */
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const finger = e.pointerType === "touch"
    if (held) {
      /* Its touchstart came first: the same finger. */
      if (finger && held.finger && held.pointerId === null) held.pointerId = e.pointerId
      return
    }
    const d = begin(finger, e.clientX, e.clientY, e.timeStamp)
    if (!d) return
    d.pointerId = e.pointerId
    /* A mouse must not start a text selection or drag a picture off the rail. */
    if (e.pointerType === "mouse") e.preventDefault()
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.pointerId) return
    const was = held.axis
    /* A mouse or a pen keeps the drag outside the rail once it is the rail's. A finger needs no capture: its touch events stay with the rail. */
    if (travel(e.clientX, e.clientY, e.timeStamp, "pointer") && !was && !held?.finger) {
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
    }
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!held || e.pointerId !== held.pointerId) return
    if (held.finger && touchEvents && e.type === "pointercancel") return
    end(e.timeStamp, e.type === "pointercancel")
  }
  const onClick = (e: MouseEvent) => {
    if (!suppressClick) return
    e.preventDefault()
    e.stopPropagation()
    suppressClick = false
  }

  el.addEventListener("touchstart", onTouchStart, { passive: true })
  el.addEventListener("touchmove", onTouchMove, { passive: false })
  el.addEventListener("touchend", onTouchEnd)
  el.addEventListener("touchcancel", onTouchEnd)
  el.addEventListener("pointerdown", onPointerDown)
  el.addEventListener("pointermove", onPointerMove)
  el.addEventListener("pointerup", onPointerUp)
  el.addEventListener("pointercancel", onPointerUp)
  el.addEventListener("click", onClick, true)

  return {
    held: () => !!held,
    destroy: () => {
      held = null
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
      el.removeEventListener("touchcancel", onTouchEnd)
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
      el.removeEventListener("click", onClick, true)
    },
  }
}
