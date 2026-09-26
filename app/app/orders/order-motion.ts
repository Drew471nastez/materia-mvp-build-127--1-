/**
 * ===========================================================================
 *  AN ORDER COMING IN OVER THE LIST, AND GOING BACK
 * ===========================================================================
 * "Clicking an order should feel smoother and cleaner, and going back should
 * feel cleaner and smoother, not so direct or clunky."
 *
 * On a phone it is the system's own push and pop: the order slides in from
 * the right edge, bar and all, as one layer, while the list moves a third of
 * the way left underneath it; back runs the same motion the other way. The
 * list is never unmounted, so underneath it is exactly where it was left.
 * Wider, where nothing on a desktop slides in from an edge, the order's bar
 * is there on the first frame and only its cards fade in under it; back
 * takes the order away at once. The list used to settle in over 180ms after
 * it, from half faded and 2px low, which on every Back read as "an animation
 * bump throughout the whole page, coming up and down"; Emails and Orders
 * both ask for none now (`settle: false`, below), so the list is simply
 * there, whole, where it was left. The whole order used to fade in over the list, bar and all, so
 * for 150ms the list's bar and the order's number and badges were drawn
 * through each other: "the top bar blends in with a delay, it looks cheap".
 *
 * What the last slide got wrong, and this does not:
 *
 *   IT STARTED LATE. The old slide was a CSS class the page put on after it
 *   had drawn, so the bar arrived a frame or two behind the tap and drifted
 *   into place. This starts from the layout effect of the commit that draws
 *   the order, before that commit is painted, so the first frame anyone sees
 *   already has the order at the edge and on its way.
 *
 *   IT WAS THE MAIN THREAD'S. These are Web Animations on `transform` and
 *   `opacity` alone, so the compositor runs them even while React is busy
 *   drawing the order's timeline.
 *
 *   IT COULD JUMP. A back tapped half way in, or an order tapped while the
 *   last one is still leaving, starts from where the layer is on screen at
 *   that moment, read off the running animation, never from an end.
 *
 * The page asks for a move; nothing here holds React state. The list's own
 * visibility is the stage's (hidden under a settled order, see
 * `.orders-stage[data-order-open]` in app/globals.css); while anything moves
 * the list carries `data-moving` and is drawn.
 */

/** The width below which an order is pushed rather than faded: the shared sheets' phone width. */
export const ORDER_PHONE_QUERY = "(max-width: 639px)"
export const ORDER_PUSH_MS = 300
export const ORDER_POP_MS = 280
export const ORDER_FADE_IN_MS = 150
export const ORDER_FADE_OUT_MS = 130
/** Back on a computer: how long the list takes to settle in. */
export const ORDER_LIST_BACK_MS = 180
/** iOS's navigation curve: off quickly, settles slowly, never past the edge. */
export const ORDER_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How far the list moves left under an order coming in, as a share of its width. */
export const ORDER_PARALLAX = 0.3
/** The edge of the order while it moves, so it reads as a layer over the list. */
const EDGE_SHADOW = "-6px 0 24px -8px rgba(17, 24, 39, 0.16)"

type Kind = "push" | "pop"

const running = new WeakMap<HTMLElement, Animation[]>()

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

export function orderMotionOnPhone(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(ORDER_PHONE_QUERY).matches
}

function xOf(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === "none") return 0
  return new DOMMatrixReadOnly(t).m41
}

function stop(el: HTMLElement) {
  const list = running.get(el)
  if (!list) return
  running.delete(el)
  for (const a of list) a.cancel()
}

function settle(detail: HTMLElement, list: HTMLElement) {
  detail.style.willChange = ""
  detail.style.boxShadow = ""
  list.style.willChange = ""
  delete list.dataset.moving
}

/**
 * Moves the order in (`push`) or out (`pop`). `done` runs once the layer is
 * where it was sent, and not at all if another move takes over first.
 * A pop's last frame is held (`fill: forwards`) until the page takes the
 * order away, so there is no frame in which it snaps back over the list.
 *
 * `settle: false` is for a page whose list comes back exactly as it was
 * and should be seen that way: back on a computer then takes the page away
 * and shows the list at once, whole, where it was, with nothing in it
 * fading or rising. Emails asks for it (app/app/emails/emails-client.tsx):
 * "an animation bump throughout the whole page, coming up and down" was the
 * list's settle in, every row, card and tab starting half faded and 2px
 * low on every Back. Orders asks the same (app/app/orders/orders-client.tsx);
 * the settle is kept for a list that wants to arrive rather than be there.
 */
export function moveOrder(kind: Kind, detail: HTMLElement, list: HTMLElement, done?: () => void, { settle: settleIn = true }: { settle?: boolean } = {}) {
  const phone = orderMotionOnPhone()
  const width = detail.clientWidth || window.innerWidth || 1
  /* Where each layer is right now, running animation included, read before
     that animation is cancelled. */
  const moving = running.has(detail) || running.has(list)
  const detailX = moving ? xOf(detail) : kind === "push" ? width : 0
  const listX = moving ? xOf(list) : kind === "push" ? 0 : -width * ORDER_PARALLAX
  stop(detail)
  stop(list)

  if (reducedMotion() || typeof detail.animate !== "function") {
    settle(detail, list)
    done?.()
    return
  }

  list.dataset.moving = ""
  const anims: Animation[] = []
  if (phone) {
    const detailTo = kind === "push" ? 0 : width
    const listTo = kind === "push" ? -width * ORDER_PARALLAX : 0
    /* The whole way takes the whole time; what is left takes its share. */
    const whole = kind === "push" ? ORDER_PUSH_MS : ORDER_POP_MS
    const ms = Math.max(120, Math.round(whole * Math.min(1, Math.abs(detailTo - detailX) / width)))
    const timing: KeyframeAnimationOptions = { duration: ms, easing: ORDER_EASE, fill: kind === "pop" ? "forwards" : "none" }
    detail.style.willChange = "transform"
    detail.style.boxShadow = EDGE_SHADOW
    list.style.willChange = "transform"
    anims.push(detail.animate([{ transform: `translate3d(${detailX}px, 0, 0)` }, { transform: `translate3d(${detailTo}px, 0, 0)` }], timing))
    anims.push(list.animate([{ transform: `translate3d(${listX}px, 0, 0)` }, { transform: `translate3d(${listTo}px, 0, 0)` }], { ...timing, fill: "none" }))
  } else {
    /* The list is not drawn under a settled order, so nothing shows through. */
    delete list.dataset.moving
    if (kind === "pop") {
      settle(detail, list)
      done?.()
      if (!settleIn) return
      /* Back on a computer: the order goes at once and the list settles in
         from half opacity and 2px down, so it arrives rather than snaps.
         It never starts from nothing, so there is no empty frame.
         What moves is what is IN the list, never the list itself: the list
         is the scroller, and a scroller faded or moved takes its scrollbar
         with it (scripts/check-scrollbar-stable.mjs, "the bar holds still"). */
      for (const layer of list.children) {
        (layer as HTMLElement).animate(
          [{ opacity: 0.5, transform: "translate3d(0, 2px, 0)" }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
          { duration: ORDER_LIST_BACK_MS, easing: ORDER_EASE },
        )
      }
      return
    }
    const body = detail.querySelector<HTMLElement>(".orders-body")
    if (!body) {
      settle(detail, list)
      done?.()
      return
    }
    anims.push(body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ORDER_FADE_IN_MS, easing: "ease-out" }))
  }
  running.set(detail, anims)
  running.set(list, anims)
  const lead = anims[0]
  lead.onfinish = () => {
    if (running.get(detail) !== anims) return
    running.delete(detail)
    running.delete(list)
    settle(detail, list)
    done?.()
  }
}

/** Ends any move at once, leaving both layers at rest (an order opened by its link, a step). */
export function stillOrder(detail: HTMLElement | null, list: HTMLElement | null) {
  if (detail) stop(detail)
  if (list) stop(list)
  if (detail && list) settle(detail, list)
}

/**
 * The row the order was opened from, tinted while the order covers it and
 * fading once the list is back, so the eye lands where it left. Written on
 * the row directly: the list is memoised, and drawing fifty rows again for a
 * tint is exactly the work the first frame of a move cannot afford.
 */
export function markRow(list: HTMLElement, id: string | null, state: "held" | "fading") {
  for (const row of list.querySelectorAll<HTMLElement>("tr[data-picked]")) {
    if (row.dataset.orderId !== id || state === "held") delete row.dataset.picked
  }
  if (!id) return
  const row = [...list.querySelectorAll<HTMLElement>("tr[data-order-id]")].find((r) => r.dataset.orderId === id)
  if (!row) return
  if (state === "fading" && row.dataset.picked === "fading") {
    /* Coming back to the same row twice in a second: its fade starts again. */
    delete row.dataset.picked
    void row.offsetWidth
  }
  row.dataset.picked = state
  if (state === "fading") {
    /* Gone when its own fade ends (the length is the CSS's alone). */
    const clear = (e: AnimationEvent) => {
      if (e.animationName !== "orders-row-fade") return
      row.removeEventListener("animationend", clear)
      if (row.dataset.picked === "fading") delete row.dataset.picked
    }
    row.addEventListener("animationend", clear)
  }
}
