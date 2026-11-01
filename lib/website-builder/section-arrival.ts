/**
 * ===========================================================================
 *  A NEW SECTION OPENS THE PAGE WHERE IT LANDS
 * ===========================================================================
 * "When I click add, smoothly close the modal, add the section very smoothly
 * in between the sections where it adds it, auto smooth scroll to it, and it
 * should appear very smoothly in the canvas."
 *
 * It used to appear: the page jumped by the height of a section in one
 * frame, everything under the gap was somewhere else, and the canvas
 * scrolled only if not one pixel of the new section was on screen.
 *
 * Now, in the frame the new section is committed and before it is painted:
 *
 *   THE PAGE OPENS. Every section below the gap is put back where it was, by
 *   transform, and slides down to its new place. The new section fades up
 *   underneath them as they go, so the page reads as parting to make room
 *   rather than as a block being dropped in.
 *
 *   AND IT IS BROUGHT TO YOU. If the new section does not start on screen,
 *   the canvas scrolls to it smoothly first (putting its top a little under
 *   the top of the canvas) and the reveal starts as the scroll arrives, so it
 *   is seen rather than finished before it is reached.
 *
 * Transform and opacity only, which the compositor runs by itself: nothing
 * is laid out or painted again while it plays. `data-arrival` on the section says "playing" and then "done", which
 * is what scripts/check-add-section.mjs times.
 */

/** How long the page takes to open. */
export const ARRIVAL_MS = 460
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How long a smooth scroll to an off screen section is given before the reveal starts. */
export const ARRIVAL_SCROLL_MS = 320

const BOX = '[id^="wb-section-"]'

/*
  The arrivals playing now, by the section's element id. The editor takes a
  section just added into its own state once its arrival has played, so the
  frames of the slide are not the frames it renders in (the editor's
  addSection, A SECTION JUST ADDED, CANVAS FIRST).
*/
const playing = new Map<string, Promise<void>>()

/** The arrival of the section with this element id, while it plays. */
export function arrivalPlaying(elementId: string): Promise<void> | null {
  return playing.get(elementId) ?? null
}

/** Where each section's box starts, in the canvas's own scroll coordinates. */
export function measureSectionTops(scroller: HTMLElement): Map<string, number> {
  const out = new Map<string, number>()
  const base = scroller.getBoundingClientRect().top - scroller.scrollTop
  for (const el of Array.from(scroller.querySelectorAll<HTMLElement>(BOX))) {
    out.set(el.id, el.getBoundingClientRect().top - base)
  }
  return out
}

/**
 * Where to scroll so a section that just arrived is on screen, or null when
 * it already is. Pure, so the rule is tested as a rule.
 *
 *   top, bottom    the section, in the scroller's scroll coordinates
 *   viewTop        the scroller's scrollTop
 *   viewHeight     how much of the canvas is visible
 */
export function arrivalScrollTarget(top: number, viewTop: number, viewHeight: number, bottomInset = 0): number | null {
  const visibleBottom = viewTop + viewHeight - bottomInset
  /* Its top is on screen, with room to see that something is there. */
  if (top >= viewTop && top <= visibleBottom - Math.min(140, viewHeight * 0.25)) return null
  const lead = Math.min(96, Math.round(viewHeight * 0.12))
  return Math.max(0, Math.round(top - lead))
}

/**
 * ===========================================================================
 *  ON A PHONE, THE ROOM ABOVE THE SHEET IS THE SCREEN
 * ===========================================================================
 * A section added on a phone is followed by the sections sheet rising to its
 * middle stop on that section's settings, so "on screen" means above where
 * the sheet will be, not above its peek. The sheet publishes both numbers on
 * the root (components/website-builder/mobile-editor-sheet.tsx): the room it
 * takes when it is up, and its peek, which the canvas already keeps clear
 * below itself. What the risen sheet covers of the canvas is the difference.
 * 0 where there is no sheet. Pure, over anything with getPropertyValue.
 */
export function sheetCoverAbovePeek(style: { getPropertyValue(name: string): string }): number {
  const open = parseFloat(style.getPropertyValue("--wb-sheet-open")) || 0
  const peek = parseFloat(style.getPropertyValue("--wb-sheet-peek")) || 0
  return Math.max(0, Math.round(open - peek))
}

/**
 * ===========================================================================
 *  THE SHEET RISES WHEN THE PAGE HAS STOPPED MOVING
 * ===========================================================================
 * Calls `done` once three things are true: `waitMs` has passed (the library
 * closing), the new section's arrival has started (it scrolls the canvas in
 * the commit that draws the section, which can be a frame or two after the
 * add), and the canvas has not scrolled for two frames. So the sheet never
 * rises over a canvas that is still travelling. `maxMs` after the wait it
 * goes anyway. Returns a function that cancels all of it.
 */
export function afterAddSettles(
  opts: { waitMs: number; scroller: HTMLElement | null; sectionId: string; maxMs?: number },
  done: () => void,
): () => void {
  let raf = 0
  let cancelled = false
  const timer = setTimeout(() => {
    const start = performance.now()
    const limit = opts.maxMs ?? 900
    let last = opts.scroller ? opts.scroller.scrollTop : 0
    let still = 0
    const tick = () => {
      if (cancelled) return
      const el = document.getElementById(`wb-section-${opts.sectionId}`)
      /* Not drawn yet, or drawn and not yet told where to go: keep waiting. */
      const started = !opts.scroller || (el !== null && el.hasAttribute("data-arrival"))
      const now = opts.scroller ? opts.scroller.scrollTop : 0
      still = started && Math.abs(now - last) < 0.5 ? still + 1 : 0
      last = now
      if (still >= 2 || performance.now() - start >= limit) {
        raf = 0
        done()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }, opts.waitMs)
  return () => {
    cancelled = true
    clearTimeout(timer)
    if (raf) cancelAnimationFrame(raf)
  }
}

function reduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * Plays the arrival of `el`, whose siblings below it were at `before` a
 * moment ago. Call it after the section is in the DOM and before the frame
 * is painted (a layout effect).
 */
export function playArrival(
  scroller: HTMLElement,
  el: HTMLElement,
  before: Map<string, number>,
  options: { bottomInset?: number } = {},
): Promise<void> {
  const still = reduced()
  const box = scroller.getBoundingClientRect()
  const base = box.top - scroller.scrollTop
  const top = el.getBoundingClientRect().top - base
  const target = arrivalScrollTarget(top, scroller.scrollTop, box.height, options.bottomInset ?? 0)
  const scrolls = target !== null && Math.abs(target - scroller.scrollTop) > 2
  if (scrolls) scroller.scrollTo({ top: target!, behavior: still ? "auto" : "smooth" })
  if (still) {
    el.setAttribute("data-arrival", "done")
    return Promise.resolve()
  }

  el.setAttribute("data-arrival", "playing")
  const delay = scrolls ? ARRIVAL_SCROLL_MS : 0
  const animations: Animation[] = []

  /* The sections below it start where they were and slide to where they are. */
  const all = Array.from(scroller.querySelectorAll<HTMLElement>(BOX))
  const followers = all.slice(all.indexOf(el) + 1)
  for (const f of followers) {
    const was = before.get(f.id)
    if (was === undefined) continue
    const now = f.getBoundingClientRect().top - base
    const delta = was - now
    if (Math.abs(delta) < 1) continue
    animations.push(
      f.animate([{ transform: `translate3d(0, ${delta}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], {
        duration: ARRIVAL_MS,
        delay,
        easing: EASE,
        fill: "backwards",
      }),
    )
  }

  /*
    And the section itself comes up underneath them as they make room.
    Opacity only, like the slide: both run on the compositor, so the section
    being drawn, selected and given its settings in the same moment cannot
    stall them. (A clip-path reveal was tried first; it is painted on the
    main thread, which is exactly the thread that is busy right then.)
  */
  animations.push(
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ARRIVAL_MS, delay, easing: EASE, fill: "backwards" }),
  )

  const done = Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => {
    el.setAttribute("data-arrival", "done")
    if (playing.get(el.id) === done) playing.delete(el.id)
  })
  playing.set(el.id, done)
  return done
}
