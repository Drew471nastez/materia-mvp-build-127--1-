/**
 * ===========================================================================
 *  A SECTION DRAGGED IN THE SIDEBAR MOVES ON THE CANVAS AS IT GOES (round BC)
 * ===========================================================================
 * The owner: "When I'm dragging a section in the sidebar, I should see in
 * real time how it moves in the canvas, smooth and clean, and where it gets
 * positioned."
 *
 * The sidebar's drag (components/website-builder/editor/controls/use-
 * reorder.ts) says each time the slot under the finger changes, and the list
 * (sections-list.tsx) hands the order that slot would make to previewOrder.
 * Nothing is drawn again for it: each section's box slides to where that
 * order puts it, by transform, the way the sidebar's own rows slide. The one
 * being moved wears a quiet ring ([data-wb-order-lifted], globals.css), and
 * the canvas scrolls just enough to keep its new place in sight.
 *
 *   let go       the order is saved as before (one undo step, the editor's
 *                reorderSection). The boxes stay where the preview put them
 *                until the canvas has the sections in that order in the
 *                page, and are let go in that same moment, so nothing jumps.
 *   Escape, or   everything slides back to where it was.
 *   no change
 *
 * Storelib's canvas is in this document (#wb-preview-root, each section's box
 * `wb-section-<id>`). An imported theme's is a frame this document cannot
 * reach: the same request goes to it as PREVIEW_ORDER_EVENT, which
 * components/website-builder/compat/compat-canvas.tsx passes to the frame,
 * and the frame does the same thing to its own sections
 * (lib/storelib-theme/compat/canvas-bridge.ts, preview-order).
 */

export const PREVIEW_ORDER_EVENT = "storelib:preview-order"

/**
 * A press, or Escape, inside an imported theme's frame (canvas-bridge.ts
 * tells the builder; compat-canvas.tsx raises this, detail "press" or
 * "escape"). The frame's own events never reach the builder's document, so
 * a panel over the canvas that closes on a press outside it or on Escape
 * (components/website-builder/publish-panel.tsx) listens for this too.
 */
export const CANVAS_PRESS_EVENT = "storelib:canvas-press"

export interface PreviewOrder {
  /** The page's own sections in the order the drag would leave them; null when the drag is over. */
  ids: string[] | null
  /** The one being moved. */
  lifted?: string | null
  /** How the drag ended: saved, or put back. */
  end?: "commit" | "cancel"
}

export interface Laid {
  id: string
  /** Its top in layout (offsetTop: a transform does not move it). */
  top: number
  height: number
}

/**
 * How far each section slides for `order`, from where layout has it. Each
 * section takes the room it has now, its own height and the space after it,
 * so the page keeps its rhythm; a section not in `order` does not move.
 * Pure, so the tests can read it.
 */
export function orderShifts(laid: readonly Laid[], order: readonly string[]): Record<string, number> {
  const known = new Set(order)
  const rows = laid.filter((l) => known.has(l.id)).slice().sort((a, b) => a.top - b.top)
  const out: Record<string, number> = {}
  if (rows.length < 2) return out
  const gapOf: Record<string, number> = {}
  rows.forEach((r, i) => {
    const next = rows[i + 1]
    gapOf[r.id] = next ? Math.max(0, next.top - (r.top + r.height)) : gapOf[rows[i - 1].id] ?? 0
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  let y = rows[0].top
  for (const id of order) {
    const r = byId.get(id)
    if (!r) continue
    out[id] = y - r.top
    y += r.height + gapOf[id]
  }
  return out
}

const SLIDE = "transform 220ms cubic-bezier(0.2, 0, 0, 1)"

interface Held {
  el: HTMLElement
  /** The style attribute as it was, put back exactly. */
  style: string | null
  shift: number
}

let held = new Map<string, Held>()
let settle: { stop: () => void } | null = null

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

function letGo(h: Held) {
  if (h.style === null) h.el.removeAttribute("style")
  else h.el.setAttribute("style", h.style)
  h.el.removeAttribute("data-wb-order-lifted")
}

function releaseAll() {
  settle?.stop()
  settle = null
  held.forEach(letGo)
  held = new Map()
}

/** Whether the elements are in the page in this order. */
function inOrder(ids: readonly string[], els: Map<string, HTMLElement>): boolean {
  let prev: HTMLElement | null = null
  for (const id of ids) {
    const el = els.get(id)
    if (!el || !el.isConnected) continue
    if (prev && !(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) return false
    prev = el
  }
  return true
}

/** Storelib's canvas: slide the boxes, by transform, to the order asked for. */
function previewNative(p: PreviewOrder) {
  if (typeof document === "undefined") return
  const root = document.getElementById("wb-preview-root")
  if (!root) return
  if (p.ids === null) {
    const els = new Map([...held].map(([id, h]) => [id, h.el]))
    const ids = lastIds
    if (p.end === "commit" && ids && held.size) {
      /* Kept where the preview put them until the canvas has them in that order, then let go in the same moment (before a paint). */
      held.forEach((h) => h.el.removeAttribute("data-wb-order-lifted"))
      if (inOrder(ids, els)) { releaseAll(); return }
      const parent = [...els.values()][0]?.parentElement
      if (!parent) { releaseAll(); return }
      const mo = new MutationObserver(() => { if (inOrder(ids, els)) releaseAll() })
      mo.observe(parent, { childList: true })
      const t = window.setTimeout(releaseAll, 4000)
      settle = { stop: () => { mo.disconnect(); window.clearTimeout(t) } }
      return
    }
    /* Put back: everything slides home, then the styles are as they were. */
    const all = [...held.values()]
    held = new Map()
    backing = all
    all.forEach((h) => {
      h.el.removeAttribute("data-wb-order-lifted")
      h.el.style.transition = reduced() ? "none" : SLIDE
      h.el.style.transform = "translate3d(0, 0, 0)"
    })
    window.setTimeout(() => {
      if (backing !== all) return
      all.forEach(letGo)
      backing = []
    }, reduced() ? 0 : 240)
    return
  }
  /* A drag started while the last one slides home: that one is home now, so its styles are read as they really are. */
  backing.forEach(letGo)
  backing = []
  settle?.stop()
  settle = null
  lastIds = p.ids
  const els = p.ids.map((id) => document.getElementById(`wb-section-${id}`)).filter((el): el is HTMLElement => !!el && root.contains(el))
  if (els.length < 2) return
  /* One layout for all of them: offsetTop is only comparable between boxes that share an offsetParent. */
  const parent = els[0].offsetParent
  if (els.some((el) => el.offsetParent !== parent)) return
  const laid = els.map((el) => ({ id: el.id.slice(11), top: el.offsetTop, height: el.offsetHeight }))
  const shifts = orderShifts(laid, p.ids)
  const still = reduced()
  let liftedEl: HTMLElement | null = null
  let liftedMove = 0
  for (const el of els) {
    const id = el.id.slice(11)
    let h = held.get(id)
    if (!h) {
      h = { el, style: el.getAttribute("style"), shift: 0 }
      held.set(id, h)
      el.style.willChange = "transform"
    }
    const dy = shifts[id] ?? 0
    if (id === p.lifted) { liftedEl = el; liftedMove = dy - h.shift }
    h.shift = dy
    el.style.transition = still ? "none" : SLIDE
    el.style.transform = `translate3d(0, ${dy}px, 0)`
    if (id === p.lifted) el.setAttribute("data-wb-order-lifted", "")
    else el.removeAttribute("data-wb-order-lifted")
  }
  /* Its new place in sight: the canvas moves only when that place is off screen, and only as far as it needs. */
  if (liftedEl && liftedMove) {
    const r = liftedEl.getBoundingClientRect()
    const scale = liftedEl.offsetHeight ? r.height / liftedEl.offsetHeight : 1
    const top = r.top + liftedMove * scale
    const box = root.getBoundingClientRect()
    const bottom = top + Math.min(r.height, box.height * 0.6)
    let by = 0
    if (top < box.top) by = top - box.top - 24
    else if (bottom > box.bottom) by = bottom - box.bottom + 24
    if (by) root.scrollBy({ top: by, behavior: still ? "auto" : "smooth" })
  }
}

let lastIds: string[] | null = null
/** The boxes sliding home after a drag that was put back. */
let backing: Held[] = []

/**
 * The drag's order, shown on whichever canvas is on screen: Storelib's here,
 * an imported theme's through its frame.
 */
export function previewOrder(p: PreviewOrder): void {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new CustomEvent<PreviewOrder>(PREVIEW_ORDER_EVENT, { detail: p }))
  } catch {
    /* no CustomEvent: the frame is not told, Storelib's canvas still is */
  }
  previewNative(p)
}
