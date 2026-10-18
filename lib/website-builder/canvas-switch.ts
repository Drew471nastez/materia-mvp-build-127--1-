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

/** The card as it is drawn right now, mid switch included. */
export function readCardLook(el: HTMLElement): CardLook {
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
  const a = card.animate(morphFrames(from, to), { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE })
  keep(card, a)
  return a
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
export function playSidebarFold(fold: HTMLElement, panel: HTMLElement, from: FoldLook, toWidth: number, toOpacity: number, panelWidth: number, seam = 6): void {
  stop(fold)
  stop(panel)
  if (reduced() || typeof fold.animate !== "function") return
  if (Math.abs(from.width - toWidth) < 0.5 && Math.abs(from.opacity - toOpacity) < 0.01) return
  const timing = { duration: CANVAS_SWITCH_MS, easing: CANVAS_SWITCH_EASE }
  const r = (n: number) => Math.round(n * 10) / 10
  const shift = (w: number) => `translateX(${r(Math.min(0, w - panelWidth))}px)`
  const margin = (w: number) => `${r(-seam * (1 - Math.min(1, w / Math.max(1, panelWidth))))}px`
  keep(fold, fold.animate(
    [
      { maxWidth: `${r(from.width)}px`, marginRight: margin(from.width), overflow: "hidden" },
      { maxWidth: `${r(toWidth)}px`, marginRight: margin(toWidth), overflow: "hidden" },
    ],
    timing,
  ))
  keep(panel, panel.animate(
    [
      { transform: shift(from.width), opacity: from.opacity },
      { transform: shift(toWidth), opacity: toOpacity },
    ],
    timing,
  ))
}
