/**
 * ===========================================================================
 *  NO HOVER UNDER A MOVING WHEEL
 * ===========================================================================
 * A wheel moves the page under a pointer that stands still. Every frame the
 * browser asks again what is under it, and in the editor something always
 * is: a section's hover ring, a card's lift, a row's tint in the sidebar.
 * Each change is a hit test, pointer over and out events, a restyle and a
 * repaint, and one repaint anywhere layerizes the whole editor again.
 * Measured at a sixth of the speed (scripts/check-editor-perf.mjs
 * PART=smooth TRACE=sidebar): a sidebar wheel was 690ms of event dispatch,
 * 590ms of hit tests and 610ms of layerizing; with the rows taking no
 * pointer, 175, 51 and 17ms.
 *
 * So while a scroller is wheeled what it scrolls takes no pointer, the way
 * long feeds have done it for years. Only the wheel: a finger's scroll is
 * the compositor's and never paid this, and a scroll the editor makes itself
 * is not somebody pointing.
 *
 *   The canvas: a clear pane over the page takes the pointer
 *     (`.wb-wheel-shield`, globals.css). Switching pointer-events on the
 *     page itself restyled every element of it, a 100 to 300ms task at a
 *     quarter speed, twice a gesture; the pane is one element.
 *   Every panel list (`.wb-slim-scroll`), the same way: its own ::after
 *     is the pane while it holds, under an attribute of its own.
 *
 * It lets go when the gesture rests, when the mouse really moves, and on a
 * press. A press that came while it held was aimed at whatever is under the
 * pointer, not at the scroller or the pane the browser found, so that
 * press, its mousedown and its click are handed to the element under it.
 */

export const WHEEL_HOLD_ATTRIBUTE = "data-wb-wheeling"
/*
  A list's hold has a name of its own. The browser files a rule by the
  attribute it names, not by the class beside it: a list rule written as
  `.wb-slim-scroll[data-wb-wheeling] > *` made every switch of the canvas's
  attribute restyle the whole page, 150 to 200ms a time at a quarter speed
  (TRACE=scroll TRACE_INV=1: "invalidates subtree").
*/
export const WHEEL_LIST_HOLD_ATTRIBUTE = "data-wb-list-wheeling"
/** The pane laid over the canvas while it holds: the canvas scroller's own child. */
export const WHEEL_SHIELD_ATTRIBUTE = "data-wb-wheel-shield"
/**
 * How long after the last wheel or scroll the hold lets go. Under the 150ms
 * after which the hover box and the block strip ask what is under the
 * pointer again (canvas-hover.tsx, canvas-block-insert.tsx): by then they
 * are given the page, not the pane.
 */
export const WHEEL_HOLD_REST_MS = 100
/** A scroll this soon after a wheel event is the wheel's. */
const WHEEL_SCROLL_MS = 250

type Init = MouseEventInit & PointerEventInit

function copyOf(e: MouseEvent): Init {
  const p = e as PointerEvent
  return {
    bubbles: true, cancelable: true, composed: true, view: e.view,
    clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
    button: e.button, buttons: e.buttons, detail: e.detail,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
    pointerId: p.pointerId, pointerType: p.pointerType, isPrimary: p.isPrimary,
  }
}

const isPane = (t: EventTarget | null) => !!t && typeof (t as Element).hasAttribute === "function" && (t as Element).hasAttribute(WHEEL_SHIELD_ATTRIBUTE)

/**
 * Hold hover while a scroller is wheeled. `scrollers` is the one scroller,
 * or a selector that every scroller to hold matches; `attribute` is what a
 * held one is marked with. Returns the undo. `now` and `within` are for tests.
 */
export function holdHoverWhileWheeling(
  scrollers: HTMLElement | string,
  { attribute = WHEEL_HOLD_ATTRIBUTE, now = () => performance.now(), within }: { attribute?: string; now?: () => number; within?: Document } = {},
): () => void {
  const doc = within ?? (typeof scrollers === "string" ? document : scrollers.ownerDocument)
  const win = doc.defaultView
  if (!win) return () => {}
  const isScroller = typeof scrollers === "string"
    ? (t: EventTarget | null) => !!t && typeof (t as Element).matches === "function" && (t as Element).matches(scrollers)
    : (t: EventTarget | null) => t === scrollers
  let held: HTMLElement | null = null
  let timer = 0
  let lastWheel = -Infinity
  /* What a press during the hold was meant for, and the scroller it landed on instead: its mousedown and click follow it there. */
  let aimed: Element | null = null
  let aimedFrom: HTMLElement | null = null
  const aimedAway = (t: EventTarget | null, from: HTMLElement) => t === from || isPane(t)

  const release = () => {
    if (timer) win.clearTimeout(timer)
    timer = 0
    if (!held) return
    held.removeAttribute(attribute)
    held = null
  }
  const hold = (el: HTMLElement) => {
    if (held !== el) {
      release()
      held = el
      el.setAttribute(attribute, "")
    }
    if (timer) win.clearTimeout(timer)
    timer = win.setTimeout(release, WHEEL_HOLD_REST_MS)
  }

  const onWheel = (e: WheelEvent) => {
    /* A pinch on a trackpad is a wheel with ctrl: that is a zoom, not a scroll. */
    if (e.ctrlKey) return
    lastWheel = now()
    if (held) hold(held)
  }
  /* Only a held scroller's own scroll, and only the wheel's: a section's own scroller, a finger and the editor's scrollIntoView never hold. */
  const onScroll = (e: Event) => {
    if (!isScroller(e.target)) return
    if (now() - lastWheel <= WHEEL_SCROLL_MS) hold(e.target as HTMLElement)
  }
  const onMove = (e: PointerEvent) => {
    if (held && e.pointerType === "mouse" && (e.movementX !== 0 || e.movementY !== 0)) release()
  }
  const onDown = (e: PointerEvent) => {
    /* The press handed on below comes back through here: it is not a new press. */
    if (!e.isTrusted) return
    aimed = null
    aimedFrom = null
    const was = held
    if (!was) return
    release()
    if (!aimedAway(e.target, was)) return
    const under = doc.elementFromPoint(e.clientX, e.clientY)
    if (!under || aimedAway(under, was) || !was.contains(under)) return
    aimed = under
    aimedFrom = was
    e.stopImmediatePropagation()
    under.dispatchEvent(new win.PointerEvent("pointerdown", copyOf(e)))
  }
  /* The browser keeps the press's target for its mousedown, and gives the click to what the press and the release share: the scroller. */
  const onMouse = (e: MouseEvent) => {
    if (!aimed || !aimedFrom || !e.isTrusted || !aimedAway(e.target, aimedFrom)) return
    const to = aimed
    if (e.type === "click") {
      aimed = null
      aimedFrom = null
    }
    e.stopImmediatePropagation()
    e.preventDefault()
    if (to.isConnected) to.dispatchEvent(new win.MouseEvent(e.type, copyOf(e)))
  }

  /* Scroll does not bubble; captured, it is seen from every scroller. */
  doc.addEventListener("wheel", onWheel, { capture: true, passive: true })
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true })
  doc.addEventListener("pointermove", onMove, { capture: true, passive: true })
  win.addEventListener("pointerdown", onDown, true)
  win.addEventListener("mousedown", onMouse, true)
  win.addEventListener("click", onMouse, true)
  return () => {
    release()
    aimed = null
    aimedFrom = null
    doc.removeEventListener("wheel", onWheel, { capture: true })
    doc.removeEventListener("scroll", onScroll, { capture: true })
    doc.removeEventListener("pointermove", onMove, { capture: true })
    win.removeEventListener("pointerdown", onDown, true)
    win.removeEventListener("mousedown", onMouse, true)
    win.removeEventListener("click", onMouse, true)
  }
}
