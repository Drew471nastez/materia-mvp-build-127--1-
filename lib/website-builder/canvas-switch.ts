/**
 * ===========================================================================
 *  DESKTOP, PHONE AND FULL SCREEN: THE CARD CHANGES SHAPE AS ONE THING
 * ===========================================================================
 * The owner, after the round that laid strips over the card's edges: "still
 * very glitchy and bad and flashy and not accurate ... the wall frame and
 * canvas should be very smooth ... like how it was before a long time ago".
 *
 * How it was a long time ago (the editor before round AJ): the card had
 * `transition-all` and the sidebar's fold a `max-width` transition, so the
 * card itself grew and shrank, every frame, and the page inside it flowed to
 * each width on the way. Nothing was laid over it and nothing jumped: one
 * object changing shape. It was taken out for its cost: "10fps on a full
 * page".
 *
 * Measured again (scripts/check-view-switch.mjs, the real editor in headless
 * Chromium), the cost was not the page. The page at a new width was a few
 * milliseconds a frame. What cost 120 to 180ms a change was the hidden code
 * editor: a whole page in an iframe the size of the canvas, styled and laid
 * out again, twice, for every change of the canvas's size, while nobody
 * could see it. It now keeps its size while hidden (preview-mode-switch.tsx,
 * CodePane), and the card can change shape a frame at a time again.
 *
 * So, as before, the card's real box moves, and the page reflows with it:
 *
 *   phone and desktop  the card's width, height, corners and lift go from the
 *                      old box to the new one (playCardMorph). Both boxes are
 *                      centred on the same point, so width and height alone
 *                      carry it; the page inside is laid out at each width
 *                      on the way, exactly as a window being resized.
 *   full screen        the sidebar's fold closes by its own width while the
 *                      panel slides out with it and fades (playSidebarFold);
 *                      the card grows into the room by flex, a frame at a
 *                      time. The panel itself is never laid out again: it is
 *                      its own width, clipped, not squeezed.
 *
 * Web Animations, not transitions: each starts from where the thing is ON
 * SCREEN at the press (read from the live box, so a second press in the
 * middle of a switch turns it round from where it is, never from where it
 * was going), and each leaves nothing behind when it ends: the box is then
 * whatever the stylesheet says, which is where it was going.
 *
 * Reduced motion: nothing moves, the change is one frame.
 */

/** How long a switch takes. The sheet and panel curve the editor uses elsewhere. */
export const CANVAS_SWITCH_MS = 320
export const CANVAS_SWITCH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export type Box = { left: number; top: number; right: number; bottom: number }

/** What the card looks like at a moment: where it is, and the corners and lift it has. */
export interface CardLook {
  width: number
  height: number
  radius: string
  shadow: string
}

function reduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** The card as it is drawn right now, mid switch included (mid glide, the box that is seen, not the one laid out). */
export function readCardLook(el: HTMLElement): CardLook {
  const g = glides.get(el)
  if (g) return g.seen()
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return { width: r.width, height: r.height, radius: cs.borderRadius, shadow: cs.boxShadow }
}

/**
 * The frames of a morph, pure, so the test can check them: the box's own
 * size from `from` to `to`, pinned where nothing else may move it. Centred
 * on both axes (the canvas centres a device card, and the full width card
 * has the same centre), never shrunk by its flex row, and never capped by
 * its own max-width while it is bigger than the room it is going to.
 */
export function morphFrames(from: CardLook, to: CardLook): Keyframe[] {
  const pin = { maxWidth: "none", maxHeight: "none", flexShrink: "0", alignSelf: "center" }
  return [
    { ...pin, width: `${Math.round(from.width * 10) / 10}px`, height: `${Math.round(from.height * 10) / 10}px`, borderRadius: from.radius, boxShadow: from.shadow },
    { ...pin, width: `${Math.round(to.width * 10) / 10}px`, height: `${Math.round(to.height * 10) / 10}px`, borderRadius: to.radius, boxShadow: to.shadow },
  ]
}

const running = new WeakMap<Element, Animation[]>()
function stop(el: Element) {
  glides.get(el)?.end()
  for (const a of running.get(el) ?? []) a.cancel()
  running.delete(el)
}
function keep(el: Element, a: Animation) {
  const list = running.get(el) ?? []
  list.push(a)
  running.set(el, list)
  const drop = () => {
    const now = running.get(el)
    if (!now) return
    const rest = now.filter((x) => x !== a)
    if (rest.length) running.set(el, rest)
    else running.delete(el)
  }
  a.finished.then(drop, drop)
}

/** Stop whatever is moving the card or the sidebar, after its look has been read. */
export function stopCanvasSwitch(...els: (Element | null | undefined)[]): void {
  for (const el of els) if (el) stop(el)
}

/**
 * The card from the look it had at the press to the look the stylesheet now
 * gives it. Nothing when they are the same box.
 */
export function playCardMorph(card: HTMLElement, from: CardLook, to: CardLook): Animation | null {
  stop(card)
  if (reduced() || typeof card.animate !== "function") return null
  if (Math.abs(from.width - to.width) < 0.5 && Math.abs(from.height - to.height) < 0.5) return null
  if (canGlide()) {
    const g = playCardGlide(card, from, to)
    if (g) return g
  }
  const a = card.animate(morphFrames(from, to), { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE })
  keep(card, a)
  startOnceDrawn([a])
  return a
}

/**
 * ===========================================================================
 *  ONE LAYOUT, THEN THE EDGE GLIDES ON ITS OWN (round 36)
 * ===========================================================================
 * The morph above moves the card's laid out box, so every step of its edge
 * is a layout of the whole page at that width. On a heavy page or an
 * imported theme at 4x CPU that is 150 to 280ms a step, and the card moved
 * in two to four steps of up to 310px (scripts/check-view-switch-frames.mjs,
 * `steps` and `maxStep`, read off the pictures of the screen).
 *
 * So the page is laid out once, at the size it is going to, and the card's
 * edge glides by its clip (clip-path: inset, centred by `50%`), which
 * Chromium runs on the compositor: it moves every frame the screen draws,
 * whatever the page is doing. For the length of the glide the card is the
 * larger of its two boxes, white, with the page at its new size in the
 * middle of it; growing, the clip opens onto the page already laid out wide;
 * shrinking, it closes onto the page already laid out narrow. The phone's
 * shadow is a plate behind the card, scaled with the edge. At the end the
 * card is its new box, the page inside is the size it already was, and
 * nothing is laid out again.
 */
type Glide = { seen: () => CardLook; end: () => void }
const glides = new WeakMap<Element, Glide>()

function canGlide(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("clip-path", "inset(calc(50% - 1px) calc(50% - 1px) round 1px)")
  } catch {
    return false
  }
}

/** The editor's curve as a function of time (0 to 1), to say where the edge is. */
export function easeAt(p: number, x1 = 0.32, y1 = 0.72, x2 = 0, y2 = 1): number {
  if (p <= 0) return 0
  if (p >= 1) return 1
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (bx(mid) < p) lo = mid
    else hi = mid
  }
  return by((lo + hi) / 2)
}

const px = (n: number) => `${Math.round(n * 10) / 10}px`
/** The clip that shows a box of this size, centred in the card's box. */
export function glideClip(width: number, height: number, radius: string): string {
  return `inset(calc(50% - ${px(height / 2)}) calc(50% - ${px(width / 2)}) round ${radius})`
}

function playCardGlide(card: HTMLElement, from: CardLook, to: CardLook): Animation | null {
  const page = card.querySelector<HTMLElement>(":scope > #wb-preview-root")
  if (!page) return null
  const W = Math.max(from.width, to.width)
  const H = Math.max(from.height, to.height)
  /*
    For the glide only, by a mark and its numbers (app/globals.css,
    [data-wb-glide]), never by the card's own style, which React writes: a
    press in the middle of the glide changes it, and the glide's end must
    not put back what React has since replaced. Not an animation on the
    card either: one beside the clip keeps the clip off the compositor.
  */
  const marks: Array<[HTMLElement, string]> = [
    [card, "--wb-glide-w"], [card, "--wb-glide-h"], [card, "--wb-glide-bg"],
    [page, "--wb-glide-w"], [page, "--wb-glide-h"], [page, "--wb-glide-x"], [page, "--wb-glide-y"],
  ]
  card.style.setProperty("--wb-glide-w", px(W))
  card.style.setProperty("--wb-glide-h", px(H))
  card.style.setProperty("--wb-glide-bg", getComputedStyle(page).backgroundColor)
  page.style.setProperty("--wb-glide-w", px(to.width))
  page.style.setProperty("--wb-glide-h", px(to.height))
  page.style.setProperty("--wb-glide-x", px((W - to.width) / 2))
  page.style.setProperty("--wb-glide-y", px((H - to.height) / 2))
  card.setAttribute("data-wb-glide", "")
  const edge = card.animate(
    [{ clipPath: glideClip(from.width, from.height, from.radius) }, { clipPath: glideClip(to.width, to.height, to.radius) }],
    { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE },
  )
  /* The lift, on a plate behind the card: the look that has one, scaled from the old box to the new. */
  const lifted = to.shadow && to.shadow !== "none" ? to : from.shadow && from.shadow !== "none" ? from : null
  let plate: HTMLDivElement | null = null
  let plateAnim: Animation | null = null
  const parent = card.parentElement
  if (lifted && parent) {
    const pr = parent.getBoundingClientRect()
    const cr = card.getBoundingClientRect()
    const cx = (cr.left + cr.right) / 2 - pr.left - parent.clientLeft
    const cy = (cr.top + cr.bottom) / 2 - pr.top - parent.clientTop
    plate = document.createElement("div")
    plate.setAttribute("data-wb-card-lift", "")
    plate.setAttribute("aria-hidden", "true")
    plate.style.cssText = `position:absolute;pointer-events:none;left:${px(cx - lifted.width / 2)};top:${px(cy - lifted.height / 2)};width:${px(lifted.width)};height:${px(lifted.height)};border-radius:${lifted.radius};box-shadow:${lifted.shadow}`
    parent.insertBefore(plate, parent.firstChild)
    const s = (l: CardLook) => `${Math.round((l.width / lifted.width) * 1000) / 1000} ${Math.round((l.height / lifted.height) * 1000) / 1000}`
    const o = (l: CardLook) => (l === lifted ? 1 : 0)
    plateAnim = plate.animate([{ scale: s(from), opacity: o(from) }, { scale: s(to), opacity: o(to) }], { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE, fill: "forwards" })
  }
  let over = false
  const end = () => {
    if (over) return
    over = true
    card.removeAttribute("data-wb-glide")
    for (const [el, name] of marks) el.style.removeProperty(name)
    /* Played to its end it has no effect left, and is left finished: the editor waits on it to call the switch landed. */
    if (edge.playState !== "finished") edge.cancel()
    plateAnim?.cancel()
    plate?.remove()
    if (glides.get(card) === glide) glides.delete(card)
  }
  const glide: Glide = {
    seen: () => {
      const p = easeAt(Number(edge.currentTime ?? 0) / CANVAS_SWITCH_MS)
      const half = p < 0.5
      return { width: from.width + (to.width - from.width) * p, height: from.height + (to.height - from.height) * p, radius: half ? from.radius : to.radius, shadow: half ? from.shadow : to.shadow }
    },
    end,
  }
  glides.set(card, glide)
  edge.finished.then(end, () => {})
  keep(card, edge)
  startOnceDrawn(plateAnim ? [edge, plateAnim] : [edge])
  return edge
}

/**
 * THE CLOCK STARTS WHEN THE FIRST FRAME OF THE SWITCH IS ON SCREEN.
 *
 * The press itself is the switch's heaviest frame: the editor renders the new
 * size and the page is laid out for it. An animation started in that commit
 * had its clock running through it, and with this curve (most of the way in
 * the first quarter) the first frame anybody saw was already 60% of the way:
 * filmed, the card's left edge went 300px, 554px, 652px, landed, and the
 * sidebar was gone in the first frame of full screen (scripts/check-view-switch-
 * frames.mjs). So each one waits at its start, which is where the card already
 * is, until that frame has been drawn, and plays from there: every step of
 * the way is then a frame on screen. Never longer than a few frames: a tab
 * with no frames to draw plays it at once.
 */
export function startOnceDrawn(list: Animation[]): void {
  const waiting = list.filter((a) => a.playState === "running" || a.playState === "paused")
  if (!waiting.length) return
  for (const a of waiting) {
    a.pause()
    a.currentTime = 0
  }
  let started = false
  const go = () => {
    if (started) return
    started = true
    window.clearTimeout(late)
    for (const a of waiting) if (a.playState === "paused") a.play()
  }
  const late = window.setTimeout(go, 250)
  requestAnimationFrame(() => requestAnimationFrame(go))
}

/** Where the sidebar is at a moment: its fold's width and its panel's strength. */
export interface FoldLook {
  width: number
  opacity: number
}

export function readFoldLook(fold: HTMLElement, panel: HTMLElement): FoldLook {
  return { width: fold.getBoundingClientRect().width, opacity: Number(getComputedStyle(panel).opacity) }
}

/**
 * The sidebar folding away or coming back. `fold` is the box whose width
 * closes, from where it was on screen at the press (`from`) to `toWidth`;
 * `panel` is the sidebar inside it, its own width (`panelWidth`) throughout,
 * slid along so its right edge stays on the fold's, and faded to `toOpacity`.
 * The 6px seam beside the fold closes with it, so the card meets the
 * window's edge.
 */
export function playSidebarFold(fold: HTMLElement, panel: HTMLElement, from: FoldLook, toWidth: number, toOpacity: number, panelWidth: number, seam = 6): Animation[] {
  stop(fold)
  stop(panel)
  if (reduced() || typeof fold.animate !== "function") return []
  if (Math.abs(from.width - toWidth) < 0.5 && Math.abs(from.opacity - toOpacity) < 0.01) return []
  const timing = { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE }
  const r = (n: number) => Math.round(n * 10) / 10
  const shift = (w: number) => `translateX(${r(Math.min(0, w - panelWidth))}px)`
  const margin = (w: number) => `${r(-seam * (1 - Math.min(1, w / Math.max(1, panelWidth))))}px`
  const a = fold.animate(
    [
      { maxWidth: `${r(from.width)}px`, marginRight: margin(from.width), overflow: "hidden" },
      { maxWidth: `${r(toWidth)}px`, marginRight: margin(toWidth), overflow: "hidden" },
    ],
    timing,
  )
  const b = panel.animate(
    [
      /* Slid, never faded: it stays solid and is clipped by its fold (the owner: "it fades"). */
      { transform: shift(from.width), opacity: Math.max(from.opacity, toOpacity, 1) },
      { transform: shift(toWidth), opacity: Math.max(from.opacity, toOpacity, 1) },
    ],
    timing,
  )
  keep(fold, a)
  keep(panel, b)
  startOnceDrawn([a, b])
  return [a, b]
}

/**
 * ONLY WHAT IS ON SCREEN FLOWS WITH THE CARD.
 *
 * The site measures the card (its 100vh and width queries), so a card
 * changing size a frame at a time lays the page out at every frame. Most of
 * a page is above or below what can be seen. Those sections are paused for
 * the switch (content-visibility: hidden, held at the height they have), so
 * a frame costs the sections in view, not the whole site. Taken at the press,
 * before anything changes, so reading where they are costs nothing.
 *
 * NEVER A PAUSED SECTION IN VIEW. A paused section draws nothing, so one
 * that came into view showed the page's background: going from the phone to
 * the desktop the page gets shorter and what was below the view rises into
 * it. Only sections more than a screen away are paused, and while the card
 * moves any that comes within half a screen of the view is handed back
 * before that frame is drawn (followHeldSections).
 *
 * When the card lands the rest come back a few a frame, nearest first
 * (releaseHeldSections), and a section above the view that changes height
 * moves the scroll by the same amount, so what is on screen never jumps.
 * Native sections are `[data-section-box]` in the canvas; an imported
 * theme's are `.shopify-section` in its frame (when the frame can be reached).
 */
type Held = { el: HTMLElement; scroller: HTMLElement; frame: HTMLIFrameElement | null }
const held = new Set<Held>()
let releaseRun = 0

function topLevel(list: HTMLElement[], selector: string): HTMLElement[] {
  return list.filter((b) => !b.parentElement?.closest(selector))
}

function holdIn(scroller: HTMLElement, boxes: HTMLElement[], viewTop: number, viewBottom: number, frame: HTMLIFrameElement | null, margin: number) {
  const rects = boxes.map((b) => b.getBoundingClientRect())
  const take: Array<[HTMLElement, number]> = []
  boxes.forEach((b, i) => {
    const r = rects[i]
    if (r.height < 1 || b.hasAttribute("data-wb-held") || b.style.contentVisibility) return
    if (r.bottom >= viewTop - margin && r.top <= viewBottom + margin) return
    take.push([b, r.height])
  })
  for (const [b, h] of take) {
    b.style.containIntrinsicHeight = `${Math.round(h * 10) / 10}px`
    b.style.contentVisibility = "hidden"
    b.setAttribute("data-wb-held", "")
    held.add({ el: b, scroller, frame })
  }
}

/** `margin`: how far from the view a section must be to be paused; a screen when not given. */
export function holdOffscreenSections(card: HTMLElement, rootId = "wb-preview-root", margin?: number): void {
  if (reduced()) return
  const run = ++releaseRun
  const root = card.querySelector<HTMLElement>(`#${rootId}`)
  if (!root) return
  const view = root.getBoundingClientRect()
  if (view.height < 1) return
  holdIn(root, topLevel(Array.from(root.querySelectorAll<HTMLElement>("[data-section-box]")), "[data-section-box]"), view.top, view.bottom, null, margin ?? view.height)
  for (const frame of Array.from(root.querySelectorAll<HTMLIFrameElement>("iframe"))) {
    let doc: Document | null = null
    try { doc = frame.contentDocument } catch { doc = null }
    const scroller = doc?.scrollingElement as HTMLElement | null | undefined
    if (!doc || !scroller || !doc.defaultView) continue
    const sections = topLevel(Array.from(doc.querySelectorAll<HTMLElement>(".shopify-section")), ".shopify-section")
    holdIn(scroller, sections, 0, doc.defaultView.innerHeight, frame, margin ?? doc.defaultView.innerHeight)
  }
  if (held.size) followHeldSections(run)
}

function hand(h: Held) {
  h.el.style.removeProperty("content-visibility")
  h.el.style.removeProperty("contain-intrinsic-height")
  h.el.removeAttribute("data-wb-held")
}

/**
 * The paused sections back, a few a frame, nearest to the view first. A
 * newer switch (holdOffscreenSections) takes over the ones still waiting.
 */
export function releaseHeldSections(perFrame = 3): void {
  const run = ++releaseRun
  const step = () => {
    if (run !== releaseRun) return
    if (held.size === 0) {
      letGoOfView()
      return
    }
    /* Nearest to what is on screen first. */
    const list = Array.from(held).map((h) => ({ h, d: placeOf(h).d }))
    list.sort((x, y) => x.d - y.d)
    bring(list.slice(0, perFrame).map((x) => x.h))
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/** Where a paused section is against its view: how far away, and whether above it. */
function placeOf(h: Held): { d: number; above: boolean; height: number } {
  const r = h.el.getBoundingClientRect()
  const vh = h.frame ? (h.frame.contentWindow?.innerHeight ?? 0) : h.scroller.getBoundingClientRect().height
  const top = h.frame ? 0 : h.scroller.getBoundingClientRect().top
  return r.bottom <= top ? { d: top - r.bottom, above: true, height: r.height } : { d: Math.max(0, r.top - (top + vh)), above: false, height: r.height }
}

/**
 * These sections back, in one layout, and the scroll moved by whatever those
 * above the view grew or shrank by, so the section on screen stays where it
 * is. The browser's own anchoring is off for that moment only: it would count
 * the change twice.
 */
function bring(list: Held[]) {
  const was = list.map((h) => ({ h, ...placeOf(h) }))
  const anchors = new Map<HTMLElement, string>()
  for (const c of was) {
    if (!anchors.has(c.h.scroller)) {
      anchors.set(c.h.scroller, c.h.scroller.style.overflowAnchor)
      c.h.scroller.style.overflowAnchor = "none"
    }
    hand(c.h)
    held.delete(c.h)
  }
  const shift = new Map<HTMLElement, number>()
  for (const c of was) {
    if (!c.above || !c.h.el.isConnected) continue
    const grew = c.h.el.getBoundingClientRect().height - c.height
    if (Math.abs(grew) >= 0.5) shift.set(c.h.scroller, (shift.get(c.h.scroller) ?? 0) + grew)
  }
  for (const [sc, by] of shift) sc.scrollTop += by
  for (const [sc, v] of anchors) sc.style.overflowAnchor = v
}

/**
 * While the card moves: any paused section that has come within half a
 * screen of the view is handed back at the start of the frame, before it is
 * drawn, so it is never seen paused. Ends when the release takes over.
 */
function followHeldSections(run: number) {
  const step = () => {
    if (run !== releaseRun || held.size === 0) return
    const near: Held[] = []
    for (const h of held) {
      const vh = h.frame ? (h.frame.contentWindow?.innerHeight ?? 0) : h.scroller.getBoundingClientRect().height
      if (placeOf(h).d <= vh / 2) near.push(h)
    }
    if (near.length) bring(near)
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/**
 * ===========================================================================
 *  WHAT YOU WERE LOOKING AT STAYS UNDER YOUR EYE
 * ===========================================================================
 * As the card changes width the page reflows: a paragraph wraps onto more
 * lines, a grid goes from four columns to two. The browser's scroll anchoring
 * keeps one element still (the first one at the top of the view) and lets
 * everything after it move, so the line somebody was reading slid down the
 * card as the text above it in the same section rewrapped: filmed, 176px in
 * one frame going to the phone, scrolled to the middle of a long page.
 *
 * So for the length of a switch the element under the eye (a quarter of the
 * way down the view, at most 120px) is held where it was: a ResizeObserver,
 * which runs after the page is laid out and before it is drawn, moves the
 * scroll by however far that element moved, every frame the card or the
 * page changes size. Anchoring is off meanwhile (it would move it as well),
 * the canvas is marked `data-wb-switching` so the canvas's own scrollbar does
 * not take those moves for somebody scrolling, and a wheel, a touch or a key
 * hands the scroll straight back to the person.
 */
type View = { root: HTMLElement; eye: Element; at: number; anchor: string; ro: ResizeObserver; off: () => void }
let view: View | null = null

/**
 * The same, told to an imported theme's page, which the editor cannot reach
 * into: `{ on }` on the window, sent on to the frame as `hold-view`
 * (compat-canvas.tsx, canvas-bridge.ts).
 */
export const HOLD_VIEW_EVENT = "storelib:hold-view"
function tellFrames(on: boolean) {
  try { window.dispatchEvent(new CustomEvent(HOLD_VIEW_EVENT, { detail: { on } })) } catch { /* no window events: nothing to tell */ }
}

export function holdView(card: HTMLElement, rootId = "wb-preview-root"): void {
  letGoOfView()
  if (reduced() || typeof ResizeObserver === "undefined") return
  const root = card.querySelector<HTMLElement>(`#${rootId}`)
  if (!root) return
  const box = root.getBoundingClientRect()
  if (box.height < 1) return
  tellFrames(true)
  root.setAttribute("data-wb-switching", "")
  const eye = root.scrollHeight > root.clientHeight + 1 ? document.elementFromPoint((box.left + box.right) / 2, box.top + Math.min(120, box.height / 4)) : null
  const at = eye ? eye.getBoundingClientRect().top - box.top : 0
  const keep = () => {
    if (!view || !eye || !eye.isConnected || !root.contains(eye)) return
    const moved = eye.getBoundingClientRect().top - root.getBoundingClientRect().top - at
    if (Math.abs(moved) >= 0.5) root.scrollTop += moved
  }
  const ro = new ResizeObserver(keep)
  if (eye && root.contains(eye) && eye !== root) {
    ro.observe(card)
    if (root.firstElementChild) ro.observe(root.firstElementChild)
  }
  const mine = () => letGoOfView()
  root.addEventListener("wheel", mine, { passive: true })
  root.addEventListener("touchstart", mine, { passive: true })
  window.addEventListener("keydown", mine)
  const off = () => {
    root.removeEventListener("wheel", mine)
    root.removeEventListener("touchstart", mine)
    window.removeEventListener("keydown", mine)
  }
  view = { root, eye: eye ?? root, at, anchor: root.style.overflowAnchor, ro, off }
  root.style.overflowAnchor = "none"
}

/** The scroll is the person's again: when the switch has landed and the page is whole, or they scrolled. */
export function letGoOfView(): void {
  const v = view
  if (!v) return
  view = null
  v.ro.disconnect()
  v.off()
  v.root.style.overflowAnchor = v.anchor
  v.root.removeAttribute("data-wb-switching")
  tellFrames(false)
}
