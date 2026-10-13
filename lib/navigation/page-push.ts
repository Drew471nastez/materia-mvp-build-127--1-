"use client"

/**
 * ===========================================================================
 *  A PAGE PUSHED OVER THE ONE YOU WERE ON, AND POPPED OFF IT AGAIN
 * ===========================================================================
 * Round 18 (C18, item 12), the owner on a member's profile inside a
 * community: "The Visit page button: make it smooth and clean, take me there
 * smoothly, and back from there smoothly, not direct or bad."
 *
 * The full page (a creator page, or /@handle) is another route, so the
 * community leaves the document and the page arrives in one commit. Neither
 * side can be kept alive under the other, and a view transition would freeze
 * the screen while the page loads (lib/navigation/leaving-still.ts says why).
 * So, as the leaving still does, the page that goes is COPIED in the commit
 * that takes it away (a layout effect's cleanup: the node is still in the
 * document, the new page is already in it, nothing painted yet), and the
 * copy and the arriving page move together:
 *
 *   PUSH (phone)  the new page comes in from the right edge over the old one,
 *                 which drifts a third of the way left under it and dims a
 *                 little, the way iOS pushes a screen. The copy cannot be
 *                 under the new page (it is laid over the window), so it is
 *                 cut instead: an outer box that slides its right edge from
 *                 the window's right to its left, exactly where the new
 *                 page's left edge is on every frame, and the copy inside it
 *                 held back to move at a third of the speed. Both are
 *                 translates on the compositor; nothing is laid out again.
 *   POP (phone)   the page leaving slides off to the right with a soft edge
 *                 over the page it returns to, which comes from a third of
 *                 the way left.
 *   COMPUTER      no slide and no blank (round J, the owner: "When I click
 *                 Visit page, I don't like that slide animation taking me
 *                 there. Get rid of it, fully."). The old page stays where it
 *                 is, fully drawn, until the new page is in the document and
 *                 painted under it (its loading screen does not count), then
 *                 the copy goes in a 100ms fade with nothing moving. Before,
 *                 the copy faded out at once, so a page that came after its
 *                 loading screen showed the plain loading colour for a dozen
 *                 frames, and then came in sliding 28px from the right
 *                 (components/profile/profile-arrival.tsx). A page that never
 *                 comes is never waited on for more than WIDE_HOLD_CAP_MS.
 *                 The same for the way back.
 *
 * <html> carries data-page-motion ("push" or "pop") while the copy moves,
 * and arrivalMotion() tells the page that lands in that same commit which way
 * to come in. A page that lands later (its loading screen came first) just
 * lands as it always does: the copy has already gone off over the loading
 * screen.
 *
 * Nothing under reduced motion, nothing while another still is up, and
 * nothing for a way back the system draws itself (the app's edge swipe,
 * html[data-edge-swipe]; a browser's own back is never armed: only our own
 * back control arms a pop).
 */
import { STILL_ATTR, copyFor, copyLiveState } from "./leaving-still"

/** The push and the pop, on the iOS sheet curve the rest of the app moves on. */
export const PAGE_PUSH_MS = 380
export const PAGE_POP_MS = 320
export const PAGE_MOTION_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How far the page underneath travels, as a share of the width: iOS moves it about a third. */
export const PAGE_UNDER_SHIFT = 0.3
/** On a computer: how far the pages move (none), and how long the old page's copy takes to go once the new one is painted. */
export const PAGE_WIDE_SHIFT_PX = 0
export const PAGE_WIDE_FADE_MS = 100
/** On a computer the old page is held over a page that has not come yet (its loading screen) for this long at most. */
export const WIDE_HOLD_CAP_MS = 1200
/** Where the whole width slides: phones, the pill's breakpoint. */
export const PAGE_PHONE = "(max-width: 767px)"
/** The attribute on <html> while a copy moves. */
export const PAGE_MOTION_ATTR = "data-page-motion"
/** A page counts as arriving with the copy when it mounts within this long of it (the same commit). */
const SAME_COMMIT_MS = 120

export type PageMotion = "push" | "pop"

let started: { motion: PageMotion; at: number; wide: boolean; width: number; move: Animation | null } | null = null
let armed: { motion: PageMotion; at: number } | null = null
/** On a computer: the copy held over the window until the page that replaces it has painted (or WIDE_HOLD_CAP_MS). */
let wideHold: { release: () => void } | null = null

const reduced = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
const phone = () => !!window.matchMedia?.(PAGE_PHONE).matches

/** A press that will navigate away arms the motion its leaving page plays (Visit page arms a push, our back arrow a pop). */
export function armPageMotion(motion: PageMotion, now: number = Date.now()): void {
  armed = { motion, at: now }
}

/** Whether a motion was armed in the last few seconds (a page can take that long), and forgets it. */
export function takeArmedMotion(motion: PageMotion, now: number = Date.now(), within = 4000): boolean {
  const a = armed
  if (!a || a.motion !== motion) return false
  armed = null
  return now - a.at <= within
}

/**
 * Lays a copy of `el` over the window and plays `motion` on it, for the page
 * that arrives in the same commit to move with (arrivalMotion). Call it from
 * the layout effect cleanup of the commit that takes `el` away. Returns a
 * function that takes the copy away early.
 */
export function holdPageMotion(el: HTMLElement | null | undefined, motion: PageMotion): () => void {
  const nothing = () => {}
  if (typeof document === "undefined" || typeof window === "undefined") return nothing
  if (!(el instanceof HTMLElement) || !el.isConnected) return nothing
  if (reduced() || document.documentElement.hasAttribute("data-edge-swipe")) return nothing
  if (document.querySelector(`[${STILL_ATTR}]`)) return nothing
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return nothing
  const wide = !phone()
  const html = document.documentElement
  /*
    THE WIDTH, MEASURED ONCE, AND NOTHING WIDER WHILE IT MOVES. A page coming in from the right edge is a page laid out past
    the window's edge for the length of the move, and a phone's browser widens its layout to fit content wider than the
    window (measured in the probe: the window read 780px on the first frame of the push, so every percentage moved twice as
    far). <html> clipping sideways is not enough for that; <body> clipping (clip, never hidden: no scroll box, so iOS keeps
    its touch scrolling) is, and only for the move. Every distance is in pixels of this one width.
  */
  const width = html.clientWidth || window.innerWidth
  const body = document.body
  const bodyClip = body.style.overflowX
  body.style.overflowX = "clip"

  /*
    The window: under the app's own bars (the tab bar stays where it is, on top), taking no presses. A pop's box reaches 24px
    past the window's left edge, so the shade the leaving page casts on the page under it travels with it and is not cut.
  */
  const lip = motion === "pop" && !wide ? 24 : 0
  const box = document.createElement("div")
  box.setAttribute(STILL_ATTR, motion)
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  box.style.cssText = `position:fixed;top:0;bottom:0;left:${-lip}px;width:${width + lip}px;z-index:40;overflow:hidden;pointer-events:none;contain:layout paint style;will-change:translate,opacity`
  const inner = document.createElement("div")
  inner.style.cssText = `position:absolute;top:0;bottom:0;left:${lip}px;right:0;contain:layout paint style;will-change:translate`
  /*
    THE COPY SCROLLED AS THE PAGE WAS, NOT MOVED UP. Laid at its place in the document inside a box scrolled to where the
    window was, so what was stuck to the top (the community's header and its tabs) is stuck there in the copy too; a copy
    simply placed at its on-screen offset loses every sticky bar on the first frame. Fixed bars keep to the window: `inner`
    contains them.
  */
  const scroller = document.createElement("div")
  scroller.style.cssText = "position:absolute;inset:0;overflow:hidden"
  const copy = copyFor(el)
  const y = window.scrollY
  copy.style.cssText += `;position:absolute;left:${Math.round(r.left)}px;top:${Math.round(r.top + y)}px;width:${Math.round(r.width)}px;height:${Math.round(r.height)}px;margin:0`
  scroller.append(copy)
  inner.append(scroller)
  box.append(inner)
  /* The shade a page on top casts on the one under it: over the old page as the new one comes (push), beside the leaving one (pop). */
  const shade = document.createElement("div")
  if (!wide) {
    shade.style.cssText =
      motion === "push"
        ? "position:absolute;inset:0;background:linear-gradient(to left,rgba(17,24,39,0.10),rgba(17,24,39,0.04) 24px,rgba(17,24,39,0.04));opacity:0"
        : `position:absolute;top:0;bottom:0;left:0;width:${lip}px;background:linear-gradient(to left,rgba(17,24,39,0.10),rgba(17,24,39,0))`
    box.append(shade)
  }
  document.body.append(box)
  copyLiveState(el, copy)
  scroller.scrollTop = y

  let over = false
  const ms = wide ? PAGE_WIDE_FADE_MS : motion === "push" ? PAGE_PUSH_MS : PAGE_POP_MS
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(cap)
    box.remove()
    body.style.overflowX = bodyClip
    if (html.getAttribute(PAGE_MOTION_ATTR) === motion) html.removeAttribute(PAGE_MOTION_ATTR)
    if (started && started.motion === motion) started = null
    if (wideHold === hold) wideHold = null
  }
  const cap = window.setTimeout(done, (wide ? WIDE_HOLD_CAP_MS : 0) + ms + 1200)
  html.setAttribute(PAGE_MOTION_ATTR, motion)
  /*
    A COMPUTER: THE OLD PAGE, STILL, UNTIL THE NEW ONE IS PAINTED UNDER IT. Nothing moves and nothing fades yet: the copy is
    the page as it stood. The page that arrives (arriveWithPageMotion) releases it; two frames later, when the new page has
    been painted under it, the copy fades off in PAGE_WIDE_FADE_MS, opacity only. A page slow to come (its loading screen
    first) is waited on for WIDE_HOLD_CAP_MS at most, then the copy fades off whatever is there.
  */
  let hold: { release: () => void } | null = null
  if (wide) {
    let going = false
    const fadeOff = () => {
      if (going || over) return
      going = true
      window.clearTimeout(waitCap)
      try {
        box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: PAGE_WIDE_FADE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" }).finished.then(done, done)
      } catch {
        done()
      }
    }
    const waitCap = window.setTimeout(fadeOff, WIDE_HOLD_CAP_MS)
    hold = { release: () => requestAnimationFrame(() => requestAnimationFrame(fadeOff)) }
    wideHold = hold
    return done
  }
  started = { motion, at: performance.now(), wide, width, move: null }
  try {
    const timing = { duration: ms, easing: PAGE_MOTION_EASE, fill: "forwards" as const }
    let move: Animation
    if (motion === "push") {
      /* The box's right edge is the new page's left edge on every frame; the copy inside drifts left a third as far. */
      move = box.animate([{ translate: "0 0" }, { translate: `${-width}px 0` }], timing)
      inner.animate([{ translate: "0 0" }, { translate: `${Math.round((1 - PAGE_UNDER_SHIFT) * width)}px 0` }], timing)
      shade.animate([{ opacity: 0 }, { opacity: 1 }], timing)
    } else {
      /* The page's left edge travels the width exactly, as the page under it comes the rest of its third: no seam between them. Its shade goes as it leaves. */
      move = box.animate([{ translate: "0 0" }, { translate: `${width}px 0` }], timing)
      shade.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], timing)
    }
    started.move = move
    move.finished.then(done, done)
  } catch {
    window.setTimeout(done, 0)
  }
  return done
}

/**
 * The way a page that is mounting now should come in: with a push or a pop
 * started in this same commit, or null (land as it always does). Read it in
 * the arriving page's layout effect.
 */
export function arrivalMotion(): { motion: PageMotion; wide: boolean; width: number; move: Animation | null } | null {
  if (!started || typeof performance === "undefined") return null
  if (performance.now() - started.at > SAME_COMMIT_MS) return null
  return { motion: started.motion, wide: started.wide, width: started.width, move: started.move }
}

/**
 * Moves an arriving page's root with the copy (arrivalMotion). True when it
 * moved, so the caller plays nothing of its own.
 */
export function arriveWithPageMotion(root: HTMLElement | null | undefined): boolean {
  /*
    A COMPUTER: the page is simply there, under the old page's copy, which goes once it has been painted. Its own landing
    fade (html.nav-landing in app/globals.css, from 0) is ended here, or the two would be seen through each other.
  */
  const held = wideHold
  if (held && root) {
    wideHold = null
    endLandingFade(root)
    held.release()
    return true
  }
  const m = arrivalMotion()
  if (!m || m.wide || !root || typeof root.animate !== "function") return false
  try {
    let a: Animation
    if (m.motion === "push") {
      a = root.animate([{ translate: `${m.width}px 0` }, { translate: "0 0" }], { duration: PAGE_PUSH_MS, easing: PAGE_MOTION_EASE })
    } else {
      a = root.animate([{ translate: `${-Math.round(PAGE_UNDER_SHIFT * m.width)}px 0` }, { translate: "0 0" }], { duration: PAGE_POP_MS, easing: PAGE_MOTION_EASE })
    }
    /*
      ONE CLOCK FOR BOTH. Each animation takes its start time on the first frame it is drawn in; under load the copy's and
      the page's can be a frame apart, which is a 2px seam of nothing between them at the end of a pop (measured at 4x CPU).
      Once both have one, the page takes the copy's.
    */
    const lead = m.move
    if (lead && !m.wide) void Promise.all([lead.ready, a.ready]).then(() => {
      if (lead.startTime !== null && a.playState === "running") a.startTime = lead.startTime
    }, () => {})
    return true
  } catch {
    return false
  }
}

/** The page-wide landing fade (app-page-enter, html.nav-landing) on the arriving page and the boxes the rule names, ended. */
function endLandingFade(root: HTMLElement) {
  try {
    const els = [root, ...Array.from(document.querySelectorAll<HTMLElement>("[data-member-profile],[data-storefront-root]"))]
    for (const el of els) {
      if (el.closest(`[${STILL_ATTR}]`)) continue
      for (const a of el.getAnimations?.() ?? []) {
        if ((a as Animation & { animationName?: string }).animationName === "app-page-enter") a.finish()
      }
    }
  } catch {
    /* A browser without getAnimations: the page fades as it always did. */
  }
}
