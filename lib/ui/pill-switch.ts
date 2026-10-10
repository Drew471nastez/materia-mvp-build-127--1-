/**
 * ===========================================================================
 *  ONE WAY FOR A ROW OF PILLS TO SWITCH WHAT IS UNDER IT
 * ===========================================================================
 * Round 17. The owner, after round 16 made a community's space pills quiet:
 * "Paid communities, library, settings: switching in between pill shapes is
 * not smooth there, fully fix it all complete." Round 16's space pills
 * (components/community/member/space-chips.tsx, chip-hit.ts) are the model,
 * and every other row of pills now moves the way they do:
 *
 *   THE PILL      its own fill fades in where it is over PILL_FADE_MS, the
 *                 one it leaves fades out the same way, nothing slides across
 *                 the row and nothing scales. The words turn colour in one
 *                 step (WORD_TURN_MS) rather than easing through a grey that
 *                 reads as neither. A finger landing on a pill tints it
 *                 lightly (PRESS_FROM on the first frame, then an ease), and
 *                 the tint lets go slower than it came.
 *   ONE TAP       a pill decides on the lift (lib/navigation/first-tap.ts),
 *                 so a tap that lands while a row glides is still a tap.
 *   THE CONTENT   what the pill shows is in place on the frame it arrives,
 *                 the screen it replaces gone in that same frame: never two
 *                 screens' words on the glass at once. It lands with a short
 *                 soft fade from CONTENT_IN_FROM (never from nothing, which
 *                 is a blank frame), on the compositor.
 *
 * WHAT IT REPLACED. The library laid a still copy of the old screen over the
 * new one and dissolved it over 180ms, so for about 130ms both screens'
 * words were on the screen together (scripts/check-library-switch.mjs
 * filmed it). Settings faded the old section out over 100ms and the new one
 * in from nothing over 150ms, a quarter of a second of a half drawn page,
 * and built Notifications from a skeleton on every visit. The profile's
 * panel faded in from nothing over 180ms.
 *
 * Pure numbers and two DOM helpers, so the suite (tests/pills17.test.ts)
 * reads the same values the screens use.
 */

/** A pill's fill coming in, and the one it leaves going, in place. The space pills' number (chip-hit.ts PILL_FADE_MS). */
export const PILL_FADE_MS = 140
export const PILL_FADE_EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)"
/** When the words turn, in one step: with the fill about 40% there, where either colour stands clear of it (chip-hit.ts WORD_TURN_MS). */
export const WORD_TURN_MS = 34
/** The press tint: part of the way on the first frame, an ease to full, a slower let go (chip-hit.ts). */
export const PRESS_FROM = 0.35
export const PRESS_IN_MS = 100
export const PRESS_OUT_MS = 180
const PRESS_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

/** The content a pill shows, landing: short, and from most of the way there, so no frame is blank. */
export const CONTENT_IN_MS = 120
export const CONTENT_IN_FROM = 0.6
export const CONTENT_IN_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

/*
  THE CLASSES, written out whole so Tailwind finds them. Every one of these pills is white on a hairline with its own grey
  fill on top when chosen (the library's look, which the profile and Settings share).
*/
/** The fill: always there, seen only on the chosen pill. Opacity only. */
export const PILL_FILL =
  "pointer-events-none absolute -inset-px z-[1] rounded-full border border-[#d7dadf] bg-[#e2e4e8] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)] transition-opacity duration-[140ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] motion-reduce:transition-none"
/** The press tint, inside the hairline, under the fill; pressPill() and releasePill() move it. */
export const PILL_PRESS = "pointer-events-none absolute inset-0 z-0 rounded-full bg-[#f1f2f4] opacity-0"
/** The words, over both: their colour turns in one step. */
export const PILL_WORDS = "pointer-events-none relative z-[2] transition-colors duration-[34ms] ease-[steps(1,end)] motion-reduce:transition-none"
/** Chosen and not: ink on the fill, grey on white (darker under a mouse only). */
export const PILL_WORDS_ON = "text-[#1a1a2e]"
export const PILL_WORDS_OFF = "text-[#6b7280] [@media(hover:hover)]:group-hover/pill:text-[#1a1a2e]"

/** How far the fill is `ms` after the press (the curve's progress, for the tests): the cubic bezier solved for x. */
export function pillFadeAt(ms: number): number {
  const x = Math.min(1, Math.max(0, ms / PILL_FADE_MS))
  const [x1, y1, x2, y2] = [0.25, 0.1, 0.25, 1]
  const bez = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (bez(mid, x1, x2) < x) lo = mid
    else hi = mid
  }
  return bez((lo + hi) / 2, y1, y2)
}

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function pressLayer(pill: Element): HTMLElement | null {
  return pill.querySelector<HTMLElement>(":scope > [data-pill-press]")
}

/** A finger on a pill: the tint shows on the first frame, then eases to full. */
export function pressPill(pill: Element) {
  const layer = pressLayer(pill)
  if (!layer || typeof layer.animate !== "function" || reduced()) return
  for (const a of layer.getAnimations()) a.cancel()
  layer.animate([{ opacity: PRESS_FROM }, { opacity: 1 }], { duration: PRESS_IN_MS, easing: PRESS_EASE, fill: "forwards" })
}

/** Let go, slower than it came, from wherever it had got to. */
export function releasePill(pill: Element) {
  const layer = pressLayer(pill)
  if (!layer || typeof layer.animate !== "function") return
  const from = Number(getComputedStyle(layer).opacity) || 0
  for (const a of layer.getAnimations()) a.cancel()
  if (from <= 0) return
  layer.animate([{ opacity: from }, { opacity: 0 }], { duration: PRESS_OUT_MS, easing: PRESS_EASE, fill: "forwards" })
}

/**
 * The content a pill brought, landing where it is: call it in the layout
 * effect of the commit that put it there, before that frame is painted. No
 * fill is kept, so nothing is left at part strength if it is cancelled.
 */
export function landContent(el: HTMLElement | null): Animation | null {
  if (!el || typeof el.animate !== "function" || reduced()) return null
  for (const a of el.getAnimations()) if ((a as Animation & { id?: string }).id === "pill-land") a.cancel()
  const anim = el.animate([{ opacity: CONTENT_IN_FROM }, { opacity: 1 }], { duration: CONTENT_IN_MS, easing: CONTENT_IN_EASE })
  anim.id = "pill-land"
  return anim
}

/*
  THE HEIGHT, HELD WHILE ONE PILL'S CONTENT REPLACES ANOTHER'S. A shorter page than where the window is scrolled is answered by
  the browser scrolling it up, which moves the pills under the finger. So the box keeps the height it had for the landing, and
  then lets go of all of it the scroll does not need.
*/

/** Keep `box` at least as tall as it is now. Read before the content changes (a press, or getSnapshotBeforeUpdate). */
export function holdHeight(box: HTMLElement | null) {
  if (!box) return
  box.style.minHeight = `${Math.ceil(box.getBoundingClientRect().height)}px`
}

/**
 * Let `box` go back to its content's own height (`content`, a child that is never held), keeping only what the scroll needs:
 * the page may not end above the bottom of the window.
 */
export function letGoHeight(box: HTMLElement | null, content: HTMLElement | null) {
  if (!box || typeof window === "undefined") return
  if (!content) {
    box.style.minHeight = ""
    return
  }
  const top = box.getBoundingClientRect().top + window.scrollY
  const below = document.documentElement.scrollHeight - (top + box.offsetHeight)
  const need = Math.ceil(window.scrollY + window.innerHeight - below - top)
  box.style.minHeight = content.offsetHeight >= need ? "" : `${need}px`
}

/** How long the height is held after the content lands: the landing, and a frame or two. */
export const HOLD_MS = CONTENT_IN_MS + 60
