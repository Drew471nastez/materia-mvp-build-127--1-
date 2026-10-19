/**
 * ===========================================================================
 *  A LAYER THAT CLOSED BADLY LEAVES THE WHOLE PAGE DEAD
 * ===========================================================================
 * "Come back from the code editor and the preview will not scroll." "Click
 * Inspect, or click a section, and the whole builder blocks: controls stop
 * working and the scroll dies completely." Same fault, reported from three
 * directions, and it is not in this codebase at all:
 *
 *     @radix-ui/react-dismissable-layer@1.1.3
 *
 *       var originalBodyPointerEvents;                      // module scope
 *       ...
 *       if (size === 0) { save the original; body.pointerEvents = "none" }
 *       add(node)
 *       return () => { if (size === 1) body.pointerEvents = original }
 *
 * Two things are wrong with that, and the builder hits both.
 *
 * ONE: the restore only runs when the set has exactly one member, and the
 * member is removed by a DIFFERENT effect that runs afterwards. Open a menu,
 * open a dialog from it, and let both go in one commit: each cleanup sees a
 * size of two, neither restores, and `pointer-events: none` is on the body
 * until the page is reloaded. That is every "open the code editor from the
 * menu" path in the builder.
 *
 * TWO: `originalBodyPointerEvents` is module scope, so it is one variable
 * shared by every layer on the page. The second layer to open overwrites
 * what the first saved.
 *
 * `react-remove-scroll`, which Radix uses for the same components, strands
 * the same way — but what it leaves behind is `overflow: hidden` and a
 * `data-scroll-locked` attribute. Buttons keep working and the page cannot
 * scroll, which is why the report reads as two different bugs.
 *
 * WHY A SUPERVISOR AND NOT A PATCH AT EACH CALL SITE. There is no call site.
 * It happens whenever a Radix layer unmounts alongside another one, anywhere,
 * and the builder mounts and unmounts panels constantly. So the rule is
 * enforced from outside instead: a lock on the document has to belong to a
 * layer that is currently open, and one that does not is cleared. That is
 * true of every page in the app, which is why this runs on all of them.
 *
 * Pure DOM and no React, so a test can drive the whole thing with a fake
 * document and a fake clock.
 */

/**
 * What could legitimately be holding the document still right now.
 *
 * Deliberately NOT `[data-state="open"]` on its own: that is on accordions,
 * collapsibles and the builder's own panels, none of which touch the body.
 * Matching those is how an earlier version of this talked itself out of ever
 * running — `[data-mobile-bottom-sheet]` is mounted for the whole life of the
 * editor, so on a phone the cleanup never ran once.
 *
 * A TOOLTIP IS NOT A MODAL, and it shares the popper wrapper with the ones
 * that are. It locks nothing, it follows the pointer, and treating one as a
 * reason to leave a lock in place would mean the page stays dead for as long
 * as a tooltip happens to be showing. So the wrapper counts only when what is
 * inside it is not a tooltip.
 */
/*
  AT REST IS NOT OPEN. A kept bottom sheet (components/ui/bottom-sheet.tsx)
  and the closed section library stay mounted with role="dialog" and
  aria-modal="true" so nothing under the page's :has() rules changes when
  they open. Counted as open, they meant a modal was "always open" in the
  editor, so a lock a menu left on the body was never cleared and the
  sidebar stayed dead until a reload (the owner: "randomly it bugs, I can't
  click things in theme settings, I have to refresh"). A layer at rest, inert,
  hidden or closed is not holding anything.
*/
const NOT_AT_REST = ':not([data-app-sheet-rest]):not([data-app-sheet-rest] *):not([inert]):not([inert] *):not([aria-hidden="true"]):not([aria-hidden="true"] *):not([data-state="closed"] *)'
const MODAL_SELECTOR = [
  `[aria-modal="true"]${NOT_AT_REST}`,
  `[role="dialog"][data-state="open"]${NOT_AT_REST}`,
  `[role="alertdialog"][data-state="open"]${NOT_AT_REST}`,
  `[role="menu"][data-state="open"]${NOT_AT_REST}`,
  `[role="listbox"][data-state="open"]${NOT_AT_REST}`,
  '[data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))',
].join(",")

export interface ElLike {
  style: { getPropertyValue(name: string): string; removeProperty(name: string): void }
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
}
export interface DocLike {
  querySelector(selector: string): unknown
  documentElement: ElLike
  body: ElLike
}

/** Is something open that has a right to be holding the document still? */
export function modalIsOpen(doc: DocLike): boolean {
  return doc.querySelector(MODAL_SELECTOR) !== null
}

/**
 * The properties a modal library sets on html or body and is supposed to put
 * back. Nothing in this app sets any of them deliberately: the builder locks
 * the document with a CLASS (`wb-fullscreen`) and a stylesheet, precisely so
 * that an inline one is always somebody's leftover.
 */
const LOCKS = ["pointer-events", "overflow", "position", "touch-action", "overscroll-behavior"] as const

/** Whether the document is being held still by anything at all. */
export function documentIsLocked(doc: DocLike): boolean {
  for (const el of [doc.documentElement, doc.body]) {
    for (const prop of LOCKS) if (el.style.getPropertyValue(prop)) return true
    if (el.hasAttribute("data-scroll-locked")) return true
  }
  return false
}

/**
 * Clear what a layer left behind, and only when no layer is entitled to it.
 * Returns what was cleared, so a caller can log it and a test can assert it.
 */
export function clearStaleDocumentLocks(doc: DocLike): string[] {
  if (modalIsOpen(doc)) return []
  const cleared: string[] = []
  for (const [name, el] of [["html", doc.documentElement], ["body", doc.body]] as const) {
    for (const prop of LOCKS) {
      if (el.style.getPropertyValue(prop)) {
        el.style.removeProperty(prop)
        cleared.push(`${name}.${prop}`)
      }
    }
    if (el.hasAttribute("data-scroll-locked")) {
      el.removeAttribute("data-scroll-locked")
      cleared.push(`${name}[data-scroll-locked]`)
    }
  }
  return cleared
}

/**
 * How long a lock is allowed to sit there with nothing open to justify it.
 *
 * It cannot be zero. A layer sets the lock in an effect and its content is in
 * the document by then, but a popper measures and positions across a frame or
 * two, and a menu closing plays an exit animation while still mounted. Long
 * enough to let all of that finish, short enough that nobody reaches for the
 * reload button first.
 */
export const SETTLE_MS = 400

export interface Timers {
  setTimeout(cb: () => void, ms: number): number
  clearTimeout(id: number): void
}

export interface WatchTarget extends DocLike {
  addEventListener(type: string, cb: () => void, opts?: { passive?: boolean; capture?: boolean }): void
  removeEventListener(type: string, cb: () => void, opts?: { capture?: boolean }): void
}

/**
 * ===========================================================================
 *  THE SUPERVISOR
 * ===========================================================================
 * Nothing here knows or cares what left the lock behind. It watches for one
 * thing — the document being held still with nothing open that is entitled to
 * hold it — and takes it back.
 *
 * Three ways in, because they answer at different speeds:
 *
 *  1. A MUTATION on html or body. This is the one that makes the fault
 *     invisible: the lock is taken back about a third of a second after the
 *     layer that stranded it disappeared, before anybody has finished
 *     noticing. It is also the only one that catches a scroll lock, which
 *     leaves every button working and gives you nothing to press.
 *
 *  2. A PRESS that lands on a dead document. With `pointer-events: none` on
 *     the body a press hit-tests through to the root element, so it still
 *     reaches a listener on the DOCUMENT even though it reaches nothing
 *     inside the page. Instant, and it is the backstop for a browser that
 *     coalesced the mutation away.
 *
 *  3. COMING BACK to the app. A layer torn down by a page going to the
 *     background never runs a cleanup at all.
 *
 * `observe` is passed in rather than reached for, so a test can drive this
 * with a fake document that has no MutationObserver.
 */
export function superviseDocumentLocks(
  doc: WatchTarget,
  opts: {
    timers: Timers
    onCleared?: (what: string[]) => void
    /** Watch html and body for attribute changes. Returns a disconnect. */
    observe?: (onChange: () => void) => () => void
    settleMs?: number
  },
): () => void {
  const { timers, onCleared, observe, settleMs = SETTLE_MS } = opts
  let pending = 0
  let stopped = false

  const take = () => {
    const cleared = clearStaleDocumentLocks(doc)
    if (cleared.length && onCleared) onCleared(cleared)
  }

  /** After the wait: still locked, still nothing open? Then it is abandoned. */
  const settle = () => {
    pending = 0
    if (stopped || !documentIsLocked(doc)) return
    take()
  }

  const schedule = () => {
    if (stopped || !documentIsLocked(doc)) return
    if (pending) timers.clearTimeout(pending)
    pending = timers.setTimeout(settle, settleMs)
  }

  /**
   * A press does not wait. Somebody is already pressing a page that is not
   * answering, so the grace period has served its purpose and then some.
   */
  const now = () => {
    if (stopped || !documentIsLocked(doc)) return
    take()
  }

  const stopObserving = observe ? observe(schedule) : undefined
  doc.addEventListener("pointerdown", now, { passive: true, capture: true })
  doc.addEventListener("touchstart", now, { passive: true, capture: true })
  doc.addEventListener("visibilitychange", schedule)
  // One pass on the way in: a page can be restored from bfcache already stuck.
  schedule()

  return () => {
    stopped = true
    if (pending) timers.clearTimeout(pending)
    stopObserving?.()
    doc.removeEventListener("pointerdown", now, { capture: true })
    doc.removeEventListener("touchstart", now, { capture: true })
    doc.removeEventListener("visibilitychange", schedule)
  }
}

/**
 * The press-only watch, kept because the builder wires it to its own canvas
 * revive. The supervisor above covers every page; this one is the builder
 * saying "and while you are there, redraw".
 */
export function watchForStuckLayer(doc: WatchTarget, onCleared: (what: string[]) => void): () => void {
  const check = () => {
    if (!documentIsLocked(doc)) return
    const cleared = clearStaleDocumentLocks(doc)
    if (cleared.length) onCleared(cleared)
  }
  doc.addEventListener("pointerdown", check, { passive: true, capture: true })
  doc.addEventListener("touchstart", check, { passive: true, capture: true })
  return () => {
    doc.removeEventListener("pointerdown", check, { capture: true })
    doc.removeEventListener("touchstart", check, { capture: true })
  }
}

/**
 * ===========================================================================
 *  THE OTHER WAY A PAGE GOES DEAD: SOMETHING INVISIBLE IS IN FRONT OF IT
 * ===========================================================================
 * A document lock is not the only way to block every control on a screen. A
 * full-screen layer that stays up after the reason for it has gone does the
 * same thing and looks like nothing at all. The editor has several that block
 * ON PURPOSE for a moment — the leaving scrim, the canvas loader mid-fade —
 * and each one is correct right up until the thing that was supposed to take
 * it away does not run.
 *
 * The rule enforced here is one nobody would argue with: SOMETHING YOU CANNOT
 * SEE SHOULD NOT BE TAKING YOUR PRESS. If the press landed on a layer that is
 * transparent, or hidden from the accessibility tree, and it is big enough to
 * be covering the screen rather than being part of it, it is in the way.
 *
 * The size test is what keeps this narrow. Invisible elements that are meant
 * to catch a press exist — a bigger hit area around a small control, a file
 * input over a button — and they are small. A layer covering most of the
 * viewport is a scrim, and a scrim that cannot be seen has nothing to say.
 *
 * A LIVE MODAL IS NEVER TOUCHED. The mobile sheet's backdrop is exactly this
 * shape — full screen, `aria-hidden`, and taking presses on purpose so that
 * pressing outside closes the sheet. It is spared because the sheet says
 * `aria-modal` while it is open, which is the same question asked everywhere
 * else in this file.
 */
export interface BoxLike {
  getBoundingClientRect(): { width: number; height: number }
  getAttribute(name: string): string | null
  style: { setProperty(name: string, value: string): void }
  tagName?: string
  className?: unknown
}

export interface PointDoc extends DocLike {
  elementFromPoint(x: number, y: number): BoxLike | null
  defaultView: { innerWidth: number; innerHeight: number; getComputedStyle(el: BoxLike): { opacity: string; visibility: string; pointerEvents: string } } | null
}

/** Covering this much of the viewport in both directions is a scrim. */
const SCRIM_FRACTION = 0.6

/**
 * What the press landed on, if that thing has no business being there.
 * Returns a short description of what was taken out of the way, or null.
 */
export function unblockInertOverlay(doc: PointDoc, x: number, y: number): string | null {
  if (modalIsOpen(doc)) return null
  const view = doc.defaultView
  if (!view) return null
  const el = doc.elementFromPoint(x, y)
  if (!el) return null

  const cs = view.getComputedStyle(el)
  // Already out of the way, so it is not what blocked anything.
  if (cs.pointerEvents === "none") return null

  const invisible = cs.opacity === "0" || cs.visibility === "hidden"
  const hidden = el.getAttribute("aria-hidden") === "true"
  const leaving = el.getAttribute("data-leaving") === "true"
  if (!invisible && !hidden && !leaving) return null

  const r = el.getBoundingClientRect()
  const coversScreen =
    r.width >= view.innerWidth * SCRIM_FRACTION && r.height >= view.innerHeight * SCRIM_FRACTION
  if (!coversScreen) return null

  el.style.setProperty("pointer-events", "none")
  const name = typeof el.className === "string" && el.className ? `.${el.className.split(/\s+/)[0]}` : (el.tagName ?? "element").toLowerCase()
  return `${name} (${invisible ? "transparent" : hidden ? "aria-hidden" : "leaving"}, ${Math.round(r.width)}×${Math.round(r.height)})`
}
