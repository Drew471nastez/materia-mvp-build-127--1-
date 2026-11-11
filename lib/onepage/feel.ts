/**
 * ===========================================================================
 *  HOW A OnePage FEELS (round AR): THE RULES, FREE OF REACT
 * ===========================================================================
 * The numbers and decisions behind the sheets, the press, the hero header
 * and a block leaving the page, kept here so tests/onepage-ar1.test.ts and
 * the Chromium checks read the same rules the page runs.
 */

/* ── The keyboard in a sheet ─────────────────────────────────────────────── */

/**
 * A keyboard takes at least this much off the visible height. A browser
 * toolbar collapsing is sixty-odd pixels; the smallest phone keyboard is
 * well over 200.
 */
export const KEYBOARD_MIN_PX = 120

export type KeyboardReading = {
  /** A text field inside the sheet has focus. */
  field: boolean
  /** A finger drives the page (no hover, a coarse pointer). */
  touch: boolean
  /** --kb-inset as ViewportVars published it. */
  inset: number
  /** The height a fixed box is laid out in (the sheet's own fixed root). */
  layoutHeight: number
  /** visualViewport.height now. */
  visibleHeight: number
}

export type KeyboardMemory = { saw: boolean }

/**
 * Whether the keyboard is up over a sheet, and what to remember for next time.
 *
 * Round AP read only the published inset. On iOS the inset is 0 once Safari
 * has panned the page to show the field (nothing is left covered below the
 * visible area), and a sheet that had seen the keyboard then took that 0 as
 * "the keyboard went": the bar with the round Close came back over the keys
 * (images/133.webp). The visible height says it plainly in that case: it is
 * the layout height less the keyboard. Either signal counts.
 *
 * On a touch screen a focused field means the keyboard is on its way, so it
 * counts as up until a keyboard has been seen and then gone again with the
 * field still focused (Android's Back puts the keys away and keeps focus).
 * A mouse or a hardware keyboard never hides anything.
 */
export function keyboardState(read: KeyboardReading, memory: KeyboardMemory): { up: boolean; memory: KeyboardMemory } {
  if (!read.field) return { up: false, memory: { saw: false } }
  const shrunk = read.inset > 0 || read.layoutHeight - read.visibleHeight > KEYBOARD_MIN_PX
  if (shrunk) return { up: true, memory: { saw: true } }
  if (!read.touch) return { up: false, memory }
  return { up: !memory.saw, memory }
}

/**
 * How far a scroller must move so a focused field sits above the keyboard
 * with `gap` to spare, or below its own top edge. 0 when it is in view.
 * All values in the same client coordinates (getBoundingClientRect, plus
 * visualViewport.offsetTop for the visible bottom).
 */
export function revealDelta(field: { top: number; bottom: number }, box: { top: number; bottom: number }, visibleBottom: number, gap = 16): number {
  const floor = Math.min(box.bottom, visibleBottom) - gap
  const ceiling = box.top + gap
  if (field.bottom > floor) {
    /* Never so far that the field's own top goes under the box's top. */
    return Math.max(0, Math.min(field.bottom - floor, field.top - ceiling))
  }
  if (field.top < ceiling) return field.top - ceiling
  return 0
}

/* ── Back inside a sheet ─────────────────────────────────────────────────── */

/**
 * What Back does inside a sheet that has steps (a form, a booking): a step
 * back while there is one, else the sheet closes. Never a navigation.
 */
export function sheetBack(step: number): "step" | "close" {
  return step > 0 ? "step" : "close"
}

/* ── The hero header as the page scrolls ─────────────────────────────────── */

/** How dark the picture gets once it has scrolled away, and how far it lags the page. */
export const HERO_DIM_MAX = 0.55
export const HERO_LAG = 0.35
export const HERO_SCALE_MAX = 0.06

/**
 * The hero's state for a scroll of `y` over a hero `height` tall: the dark
 * layer's opacity, how far the picture is held back (it moves down by this
 * while the page moves up, so the content slides over it), and its scale.
 * The same curve the CSS scroll timeline draws (app/globals.css op-hero-*),
 * for browsers without one.
 */
export function heroScroll(y: number, height: number): { dim: number; shift: number; scale: number } {
  if (!(height > 0)) return { dim: 0, shift: 0, scale: 1 }
  const p = Math.min(1, Math.max(0, y / height))
  return {
    dim: Math.round(p * HERO_DIM_MAX * 1000) / 1000,
    shift: Math.round(p * height * HERO_LAG * 10) / 10,
    scale: Math.round((1 + p * HERO_SCALE_MAX) * 1000) / 1000,
  }
}

/**
 * The slim bar at the top shows once the profile area's bottom edge has
 * gone above the bar itself, and hides as soon as it comes back below it.
 * `profileBottom` is that edge in viewport coordinates.
 */
export function topBarShown(profileBottom: number, barHeight: number): boolean {
  return profileBottom < barHeight
}

/** The header layouts that get the scroll effect: a full picture or video, not the circle. */
export function heroScrollEffect(headerLayout: string | null | undefined, heroDrawn: boolean): boolean {
  return heroDrawn && headerLayout === "hero"
}

/* ── The profile bar and the corner buttons (round AS) ─────────────────────── */

/** The bar's height below the safe area: on a phone, and on a computer, where it floats inside the card. */
export const BAR_PHONE_PX = 60
export const BAR_DESKTOP_PX = 56
/** On a computer the bar floats this far inside the card's edges, its corner concentric with the card's 40px. */
export const BAR_DESKTOP_INSET_PX = 12
/** How far the name travels while the bar forms over it. */
export const BAR_MORPH_PX = 64

/**
 * How far the bar has formed, 0 to 1, for the profile's name (its foot,
 * `anchorBottom`, in viewport coordinates) under a bar whose foot is at
 * `barBottom`. Nothing while the name is more than BAR_MORPH_PX below the
 * bar; all of it once the name has gone under. The page's own scroll drives
 * it, so it runs backwards exactly as it ran forwards: no timer, nothing to
 * jump when the page comes back to the top.
 */
export function barMorph(anchorBottom: number, barBottom: number, range = BAR_MORPH_PX): number {
  if (!Number.isFinite(anchorBottom) || !(range > 0)) return 0
  const p = (barBottom + range - anchorBottom) / range
  return Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000
}

/** The Share and Subscribe buttons always show this close to the top. */
export const CORNER_TOP_PX = 48
/** And otherwise change only after this much travel one way: a finger's wobble, a toolbar folding or a rubber band never flips them. */
export const CORNER_TRAVEL_PX = 28

export type CornerState = { shown: boolean; y: number; travel: number }

export const CORNER_START: CornerState = { shown: true, y: 0, travel: 0 }

/**
 * The corner buttons' next state for a scroll position `y`, already held
 * between 0 and the page's end (a pull past either end is not a direction).
 * Travel adds up while the page keeps going one way and starts again when it
 * turns; down hides them, up shows them, near the top they always show.
 */
export function cornerNext(s: CornerState, y: number): CornerState {
  const at = Math.max(0, y)
  if (at <= CORNER_TOP_PX) return { shown: true, y: at, travel: 0 }
  const d = at - s.y
  if (d === 0) return s
  const travel = s.travel === 0 || d > 0 === s.travel > 0 ? s.travel + d : d
  const shown = travel >= CORNER_TRAVEL_PX ? false : travel <= -CORNER_TRAVEL_PX ? true : s.shown
  return { shown, y: at, travel }
}

/* ── A block leaving the page ────────────────────────────────────────────── */

/** How long a removed block takes to fold away, in the editor's list and in the preview. */
export const LEAVE_MS = 240

/**
 * The blocks to draw: the ones there now, in order, and each one that was
 * there a moment ago and has just gone, kept at its old place (after the
 * block it followed) and marked leaving, so it can fold away instead of
 * vanishing. `previous` is what was drawn last time, leaving ones included.
 */
export function withLeaving<T extends { id: string }>(previous: readonly { id: string; item: T; leaving: boolean }[], next: readonly T[], gone: ReadonlySet<string>): { id: string; item: T; leaving: boolean }[] {
  const now = new Set(next.map((b) => b.id))
  const out: { id: string; item: T; leaving: boolean }[] = next.map((b) => ({ id: b.id, item: b, leaving: false }))
  previous.forEach((p, i) => {
    if (now.has(p.id) || gone.has(p.id)) return
    /* After whatever it followed that is still drawn, else first. */
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((o) => o.id === previous[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    out.splice(at, 0, { id: p.id, item: p.item, leaving: true })
  })
  return out
}

/* ── Press ───────────────────────────────────────────────────────────────── */

/**
 * What counts as pressable on a OnePage for the shared press feedback
 * (app/globals.css [data-op-pressing]): a link, a button, anything with the
 * button role. Never a field, and never something marked data-no-press.
 */
export const PRESSABLE = "a[href],button:not([disabled]),[role=button]:not([aria-disabled=true]),label[for],summary"
export const NOT_PRESSABLE = "input,textarea,select,[contenteditable=true],[data-no-press],iframe"
