/**
 * ===========================================================================
 *  WHEN THE CANVAS DIES ON A PHONE, THE PHONE SAYS WHAT IT SAW
 * ===========================================================================
 * "Select a section and the preview will not scroll." Every cause this
 * codebase can name is already handled: stale document locks, invisible
 * backdrops, a keyboard that scrolled the window, a scroll layer that WebKit
 * dropped. Each of those was found by reproducing the freeze in a headless
 * browser. The one still being reported does not reproduce there, which
 * means the next cause is something only the device knows: a `touch-action`
 * the browser honours before any script runs, a listener cancelling the
 * gesture, a layer sitting where the finger lands, an ancestor scrolled by
 * something with no undo.
 *
 * So the device is asked. The watchdog already notices a real drag that
 * moves nothing; at that moment this takes a picture of the geometry and
 * the state that decide whether a touch can scroll, and sends it to the
 * server's log, where it can be read. Nothing here is content: tags, ids,
 * class names, numbers and computed styles. No text a person typed, no
 * product, no name.
 *
 * Pure: everything it reads is passed in, so a test can hand it a fake
 * document and see exactly what would be sent.
 */

export interface StyleLike {
  overflowX: string
  overflowY: string
  pointerEvents: string
  touchAction: string
  opacity: string
  visibility: string
  position: string
  transform: string
  zIndex: string
  transition?: string
}

export interface NodeLike {
  tagName?: string
  id?: string
  className?: unknown
  parentElement: NodeLike | null
  scrollTop?: number
  scrollLeft?: number
  scrollHeight?: number
  clientHeight?: number
  scrollWidth?: number
  clientWidth?: number
  // Method signatures, not function-typed properties: a real Element's
  // `contains(other: Node)` must satisfy this, and only methods are checked
  // loosely enough in both directions for that to hold.
  getBoundingClientRect?(): { top: number; left: number; width: number; height: number }
  getAttribute?(name: string): string | null
  style?: { cssText?: string }
  contains?(other: NodeLike | null): boolean
}

export interface ReportDoc {
  documentElement: NodeLike
  body: NodeLike
  activeElement: NodeLike | null
  elementFromPoint(x: number, y: number): NodeLike | null
  querySelectorAll(selector: string): ArrayLike<NodeLike>
}

export interface ReportWindow {
  innerWidth: number
  innerHeight: number
  scrollX: number
  scrollY: number
  visualViewport?: { height: number; width: number; offsetTop: number; offsetLeft: number; pageTop: number; scale: number } | null
  getComputedStyle(el: NodeLike): StyleLike
  navigator?: { userAgent?: string }
}

/**
 * What the gesture itself did, counted by the same passive listeners that
 * know where the finger is. A drag that sends moves the browser has already
 * made non-cancelable is one the browser is scrolling with; a drag whose
 * moves are all cancelable is one it has decided not to.
 */
export interface GestureStats {
  moves: number
  cancelable: number
  prevented: number
  /** How far the scroller moved at most during the gesture, in px. */
  maxScrollDelta: number
  /** Whether the touchstart itself was cancelled: on iOS that alone stops a scroll. */
  startPrevented?: boolean | null
  /** Pointer events seen for the gesture: a cancel means the browser handed the gesture to a native scroller, somewhere. */
  pointerMoves?: number
  pointerCancels?: number
}

export interface FreezeReport {
  reason: string
  ua: string
  window: { w: number; h: number; scrollX: number; scrollY: number }
  viewport: { w: number; h: number; offsetTop: number; offsetLeft: number; pageTop: number; scale: number } | null
  touch: { x: number; y: number; prevented: boolean | null } | null
  gesture: GestureStats | null
  /** Whether a script could move the scroller at that moment, when checked. */
  probe: { scriptCanScroll: boolean } | null
  /** Which rung of the ladder this drag reached. */
  step: number | null
  /** A live text selection takes drags for itself on iOS. */
  selection: string | null
  /** The fixed sheets and their overlays, where the compositor thinks they are. */
  sheets: Array<{ el: string; rect: Rect; tf: string; vis: string; op: string; pe: string; transition: string }>
  focus: string | null
  body: { pointerEvents: string; overflow: string; scrollLocked: string | null; inlineStyle: string }
  html: { classes: string; scrollTop: number }
  layers: string[]
  covers: string[]
  scroller: {
    rect: Rect
    scrollTop: number
    scrollLeft: number
    scrollHeight: number
    clientHeight: number
    scrollWidth: number
    clientWidth: number
    style: Styles
    inline: string
  } | null
  ancestors: Array<{ el: string; scrollTop: number; scrollLeft: number } & Styles>
  underTouch: Array<{ el: string; inCanvas: boolean } & Styles>
}

type Rect = { top: number; left: number; w: number; h: number }
type Styles = { overflow: string; pe: string; ta: string; op: string; pos: string; tf: string; z: string }

/** Enough to recognise a node, and nothing of what it contains. */
export function describeNode(el: NodeLike | null): string {
  if (!el) return "none"
  const tag = (el.tagName ?? "node").toLowerCase()
  const id = el.id ? `#${el.id}` : ""
  const cls = typeof el.className === "string" && el.className.trim()
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
    : ""
  return `${tag}${id}${cls}`.slice(0, 80)
}

function styles(win: ReportWindow, el: NodeLike): Styles {
  const s = win.getComputedStyle(el)
  return {
    overflow: `${s.overflowX}/${s.overflowY}`,
    pe: s.pointerEvents,
    ta: s.touchAction,
    op: s.opacity,
    pos: s.position,
    tf: s.transform === "none" ? "none" : "set",
    z: s.zIndex,
  }
}

function rect(el: NodeLike): Rect {
  const r = el.getBoundingClientRect?.() ?? { top: 0, left: 0, width: 0, height: 0 }
  return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }
}

const MAX_CHAIN = 12
const COVER_FRACTION = 0.6

export function describeFreeze(
  doc: ReportDoc,
  win: ReportWindow,
  scroller: NodeLike | null,
  reason: string,
  touch: { x: number; y: number; prevented: boolean | null } | null,
  extra: { gesture?: GestureStats | null; probe?: { scriptCanScroll: boolean } | null; step?: number | null; selection?: string | null } = {},
): FreezeReport {
  const vv = win.visualViewport ?? null

  const ancestors: FreezeReport["ancestors"] = []
  let node = scroller?.parentElement ?? null
  while (node && ancestors.length < MAX_CHAIN) {
    ancestors.push({ el: describeNode(node), scrollTop: node.scrollTop ?? 0, scrollLeft: node.scrollLeft ?? 0, ...styles(win, node) })
    node = node.parentElement
  }

  const underTouch: FreezeReport["underTouch"] = []
  if (touch) {
    let hit = doc.elementFromPoint(touch.x, touch.y)
    while (hit && underTouch.length < MAX_CHAIN) {
      underTouch.push({ el: describeNode(hit), inCanvas: !!scroller?.contains?.(hit), ...styles(win, hit) })
      hit = hit.parentElement
    }
  }

  // Layers that could legitimately, or illegitimately, be holding the page.
  const layers: string[] = []
  const layerSelectors = [
    "[data-radix-popper-content-wrapper]",
    "[role=dialog][data-state=open]",
    "[data-mobile-bottom-sheet][aria-modal=true]",
    "[data-state=open][data-radix-menu-content], [data-state=open][role=menu]",
  ]
  for (const sel of layerSelectors) {
    const found = doc.querySelectorAll(sel)
    if (found.length) layers.push(`${sel} x${found.length}`)
  }

  // Anything fixed that covers most of the screen and takes pointer events.
  const covers: string[] = []
  const fixed = doc.querySelectorAll("div, section, span")
  for (let i = 0; i < fixed.length && covers.length < 8; i++) {
    const el = fixed[i]
    const s = win.getComputedStyle(el)
    if (s.position !== "fixed" && s.position !== "absolute") continue
    if (s.pointerEvents === "none") continue
    const r = rect(el)
    if (r.w >= win.innerWidth * COVER_FRACTION && r.h >= win.innerHeight * COVER_FRACTION) {
      // Neither the canvas itself, nor anything inside it, nor anything it
      // is inside of: an ancestor holds the scroller, it cannot cover it.
      if (scroller && (el === scroller || scroller.contains?.(el) || el.contains?.(scroller))) continue
      covers.push(`${describeNode(el)} ${r.w}x${r.h}@${r.top} op=${s.opacity} z=${s.zIndex}`)
    }
  }

  const sheets: FreezeReport["sheets"] = []
  const sheetNodes = doc.querySelectorAll("[data-mobile-bottom-sheet], [data-wb-sheet-overlay]")
  for (let i = 0; i < sheetNodes.length && i < 6; i++) {
    const el = sheetNodes[i]
    const s = win.getComputedStyle(el)
    sheets.push({ el: describeNode(el), rect: rect(el), tf: s.transform.slice(0, 80), vis: s.visibility, op: s.opacity, pe: s.pointerEvents, transition: (s.transition ?? "").slice(0, 60) })
  }

  const bodyStyle = win.getComputedStyle(doc.body)
  return {
    reason,
    ua: (win.navigator?.userAgent ?? "").slice(0, 120),
    window: { w: win.innerWidth, h: win.innerHeight, scrollX: Math.round(win.scrollX), scrollY: Math.round(win.scrollY) },
    viewport: vv
      ? { w: Math.round(vv.width), h: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop), offsetLeft: Math.round(vv.offsetLeft), pageTop: Math.round(vv.pageTop), scale: Number(vv.scale.toFixed(2)) }
      : null,
    touch,
    gesture: extra.gesture ?? null,
    probe: extra.probe ?? null,
    step: extra.step ?? null,
    selection: extra.selection ?? null,
    sheets,
    focus: doc.activeElement ? describeNode(doc.activeElement) : null,
    body: {
      pointerEvents: bodyStyle.pointerEvents,
      overflow: `${bodyStyle.overflowX}/${bodyStyle.overflowY}`,
      scrollLocked: doc.body.getAttribute?.("data-scroll-locked") ?? null,
      inlineStyle: (doc.body.style?.cssText ?? "").slice(0, 160),
    },
    html: {
      classes: typeof doc.documentElement.className === "string" ? doc.documentElement.className.slice(0, 120) : "",
      scrollTop: doc.documentElement.scrollTop ?? 0,
    },
    layers,
    covers,
    scroller: scroller
      ? {
          rect: rect(scroller),
          scrollTop: scroller.scrollTop ?? 0,
          scrollLeft: scroller.scrollLeft ?? 0,
          scrollHeight: scroller.scrollHeight ?? 0,
          clientHeight: scroller.clientHeight ?? 0,
          scrollWidth: scroller.scrollWidth ?? 0,
          clientWidth: scroller.clientWidth ?? 0,
          style: styles(win, scroller),
          inline: (scroller.style?.cssText ?? "").slice(0, 240),
        }
      : null,
    ancestors,
    underTouch,
  }
}

/**
 * The log truncates a long line, and the two chains are the long part. So a
 * report is logged as two lines under one tag: everything small first, and
 * the chains after, so the picture that matters is never the part cut off.
 */
export function splitForLog(report: FreezeReport): [string, string] {
  const { ancestors, underTouch, ...core } = report
  return [JSON.stringify(core), JSON.stringify({ reason: report.reason, ancestors, underTouch })]
}

/** Where a report goes. Same origin, no credentials beyond the session cookie. */
export const FREEZE_REPORT_PATH = "/api/website-builder/freeze-report"
/** One picture per freeze, not one per drag of a frozen canvas. */
export const FREEZE_REPORT_GAP_MS = 8000
/** Larger than any real report; a cap, not a target. */
export const FREEZE_REPORT_MAX_BYTES = 16 * 1024

export function sendFreezeReport(
  post: (path: string, body: string) => void,
  report: FreezeReport,
  now: number,
  lastSentAt: number,
): number {
  if (now - lastSentAt < FREEZE_REPORT_GAP_MS) return lastSentAt
  post(FREEZE_REPORT_PATH, JSON.stringify(report))
  return now
}
