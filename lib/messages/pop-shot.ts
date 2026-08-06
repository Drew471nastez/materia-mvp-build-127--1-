"use client"

/**
 * The conversation, kept on screen after it has stopped existing.
 *
 * ---------------------------------------------------------------------------
 * Why anything like this is needed
 * ---------------------------------------------------------------------------
 * Going back from a conversation has been rebuilt five times, and every one of
 * those was a variation on the same idea: animate a screen. Fade the
 * conversation out, dim it, dip it, slide it; fade the inbox in, parallax it,
 * ease it harder. Each read as "too direct", and it was not a tuning problem in
 * any of them.
 *
 * The reason is structural, and it is this: EXACTLY ONE SCREEN EXISTS AT A
 * TIME. Next unmounts the conversation on the frame it commits /messages, so
 * whatever the two screens are doing, they are never doing it together. The
 * conversation cannot slide off to reveal the inbox, because at the moment it
 * would be sliding there is no inbox behind it — only the bare layout
 * background, which is the blank frame an earlier attempt shipped. And the
 * inbox cannot ease in over the conversation, because by the time it renders
 * the conversation is already gone.
 *
 * So every version was a soft edge on one side of a hard cut. The cut is what
 * you see. An animation on the arriving screen makes the arrival gentle and
 * leaves the SWAP — a whole screen of content replaced between two frames —
 * exactly as abrupt as it was. That is what "direct" means here, and no curve
 * fixes it.
 *
 * ---------------------------------------------------------------------------
 * What this does
 * ---------------------------------------------------------------------------
 * It keeps a copy. A still image of the conversation — a clone of the shell,
 * pinned over the real one, outside the router's tree so nothing unmounts it —
 * is put in place while your finger is still down. The route then changes
 * underneath it, the inbox mounts and paints hidden behind the copy, and only
 * then does the copy slide off to the right and uncover it.
 *
 * Which is an ordinary iOS pop, and the reason it is ordinary is that on iOS
 * both screens genuinely are on screen: the one you are leaving travels, and
 * the one underneath it is really there. This is the smallest way to make that
 * true here without a second router, a persistent layout, or the View
 * Transitions API — which is a whole-app configuration change on a codebase
 * that has been broken by smaller ones.
 *
 * A copy rather than the real element on purpose. Moving the real node out of
 * React's tree means React later tries to remove a child of a parent it is no
 * longer in; a clone is inert, owns nothing, and the worst case if every part
 * of this fails is that it is removed a frame early.
 *
 * ---------------------------------------------------------------------------
 * Why the copy is taken on pointerdown
 * ---------------------------------------------------------------------------
 * Cloning is cheap; PAINTING the clone is a full extra screen, and that has to
 * happen on some frame. On the frame the animation starts it would be the one
 * long frame at the beginning that reads as a stutter. Pointerdown is 80-150ms
 * earlier — the gap between a finger landing and a tap resolving — and the
 * browser is idle in it. The copy is visually identical to what is already
 * there, so putting it up costs nothing anybody can see, and by the time the
 * slide begins it is a promoted layer with nothing left to rasterise.
 *
 * A press is not a promise of a tap, so an abandoned one drops the copy again.
 */

/** Fixed over the conversation, under the tab bar and the site header. */
const Z = 45

/** Long enough to read as a screen leaving; short enough to press repeatedly. */
const SLIDE_MS = 340

/**
 * Belt and braces. If the click never arrives — dragged off the arrow, the
 * gesture eaten — the copy must not be left covering a live screen. Generous,
 * because a real tap always lands inside it and a stuck copy is a frozen app.
 */
const ABANDON_MS = 900

let shot: HTMLElement | null = null
let abandon: number | undefined

/** When the slide began, so the screen underneath can join it already in
 *  progress rather than starting its own. See `popShotElapsed`. */
let slideStart = 0

/**
 * How long the copy has been sliding, or null if none is.
 *
 * THE TWO HALVES OF THIS TRANSITION DO NOT START AT THE SAME MOMENT, and
 * pretending they do was a bug shipped in the first version of this file.
 *
 * The copy starts moving on the click. The inbox underneath cannot start until
 * it MOUNTS, which is one frame later on a warm route and can be a hundred
 * milliseconds on a cold one. Both then ran for their full duration, so the
 * inbox finished travelling that much AFTER the copy had gone — and for exactly
 * that overhang the screen was still offset to the left with nothing covering
 * its right edge. A strip of bare background, on the right, at the end of every
 * pop. Which is the artefact this whole approach exists to avoid, reintroduced
 * by assuming two clocks were one.
 *
 * So the inbox does not start its animation, it JOINS one — with a negative
 * `animation-delay` of however long it missed, which is the CSS way of saying
 * "you are already this far in". The two then end on the same frame no matter
 * how late the mount was, and the containment that lets the parallax be a
 * quarter of the screen holds for the whole of it.
 */
export function popShotElapsed(): number | null {
  if (!shot && !slideStart) return null
  if (!slideStart) return null
  const elapsed = performance.now() - slideStart
  // Past the end there is nothing to join. The caller falls back to the small
  // uncovered offset, which is safe on its own.
  return elapsed >= SLIDE_MS ? null : elapsed
}

function clear(): void {
  window.clearTimeout(abandon)
  abandon = undefined
}

/** Phones only. A wide screen shows the conversation as a PANE beside the list;
 *  it is not covering anything and there is nothing to uncover. */
function eligible(): boolean {
  if (typeof window === "undefined") return false
  if (!window.matchMedia("(max-width: 767px)").matches) return false
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  // `animate` is what the slide runs on. Without it there is no transition to
  // be had and a copy would only ever be a screen that never goes away.
  return typeof Element.prototype.animate === "function"
}

/**
 * Put a still of the conversation over the conversation.
 *
 * Idempotent: a second press while one is up replaces nothing and does nothing.
 */
export function takePopShot(): void {
  if (shot || !eligible()) return

  const source = document.querySelector<HTMLElement>(".thread-shell")
  if (!source) return

  const rect = source.getBoundingClientRect()
  // Zero height is a shell that has not been laid out — mid-navigation, or a
  // media query in between. Nothing to copy, and pinning to an empty rect would
  // put an invisible element over the screen.
  if (rect.height < 1 || rect.width < 1) return

  const clone = source.cloneNode(true) as HTMLElement

  /**
   * SCROLL POSITION IS NOT CLONED, AND IT IS THE ONE THING THAT WOULD GIVE THE
   * WHOLE TRICK AWAY.
   *
   * `cloneNode` copies markup, not the scroll offsets of what it copies — so
   * every scroller in the copy starts at the top. On a conversation that means
   * the copy shows the OLDEST message in the thread while the real screen
   * behind it shows the newest, and the moment it appears the screen appears to
   * jump to the beginning of the conversation.
   *
   * A deep clone walks in the same order as its source and has the same number
   * of elements, so the two lists line up index for index. Only non-zero
   * offsets are written, which keeps this to one pass and a handful of writes.
   */
  const from = source.querySelectorAll<HTMLElement>("*")
  const to = clone.querySelectorAll<HTMLElement>("*")
  if (from.length === to.length) {
    for (let i = 0; i < from.length; i++) {
      const top = from[i].scrollTop
      const left = from[i].scrollLeft
      if (top) to[i].scrollTop = top
      if (left) to[i].scrollLeft = left
    }
  }

  // Pinned to the pixels the original occupies rather than inheriting its
  // rules. `.thread-shell` is positioned from --vv-top and --vv-h, which the
  // component republishes as the visual viewport changes; a copy that kept
  // reading them could move after the screen it is a picture of has gone.
  clone.classList.add("pop-shot")
  clone.style.position = "fixed"
  clone.style.top = `${rect.top}px`
  clone.style.left = `${rect.left}px`
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.margin = "0"
  clone.style.maxWidth = "none"
  clone.style.zIndex = String(Z)
  clone.style.pointerEvents = "none"
  clone.style.willChange = "transform"
  /**
   * INVISIBLE UNTIL IT IS NEEDED, AND THAT IS NOT THE SAME AS NOT BEING THERE.
   *
   * The copy is meant to be pixel-identical to the screen underneath it, so
   * showing it early should be free. It very nearly is — except for images.
   * Cloned <img> elements start their own load, and although every one of them
   * is already in the memory cache, there is no guarantee the decode lands in
   * the same frame as the layout. If it does not, the copy paints with holes
   * where the avatar and the photographs are, over a screen that has them.
   *
   * At opacity 0 none of that reaches the glass, while the expensive half — the
   * clone itself, the style resolution, the layout, and the image loads and
   * decodes that were the risk — all still happen here, during the press. What
   * is left to do at release is one paint of a subtree whose resources are hot,
   * which is the cheap part.
   */
  clone.style.opacity = "0"
  // Nothing in a picture of a screen is real: not for a screen reader, not for
  // the tab order, not for a form. `inert` is the one that covers all three.
  clone.setAttribute("aria-hidden", "true")
  clone.setAttribute("inert", "")
  // Ids are copied by cloneNode and duplicate ids break every getElementById
  // and every label/for pair on the live screen underneath.
  clone.removeAttribute("id")
  clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"))

  document.body.appendChild(clone)
  shot = clone

  clear()
  abandon = window.setTimeout(dropPopShot, ABANDON_MS)
}

/** The press did not become a tap. Take the picture down at once. */
export function dropPopShot(): void {
  clear()
  shot?.remove()
  shot = null
  // Only if no slide is running. `dropPopShot` is also called on a timer after
  // pointerup, which lands AFTER a successful click has already handed the copy
  // to `releasePopShot` — clearing the clock there would strand the inbox
  // mid-parallax with nothing left to synchronise to.
  if (!document.querySelector(".pop-shot")) {
    slideStart = 0
    document.documentElement.style.removeProperty("--pop-delay")
  }
}

/**
 * The navigation is happening. Slide the picture off and uncover what is now
 * genuinely behind it.
 *
 * Called BEFORE `router.back()`, not after: the copy has to be moving on the
 * same frame the route is asked for, so the two are one gesture. The inbox
 * mounts and paints behind the copy while it travels, which is why the pop no
 * longer has a moment where a screen is simply replaced by another.
 *
 * Off the right-hand edge, all the way — the direction the conversation came
 * from. It never has to fade, because it is never partially transparent over
 * something it should be covering; it is opaque for the whole of the travel and
 * then it is gone.
 */
export function releasePopShot(): void {
  const el = shot
  clear()
  shot = null
  if (!el) return

  /**
   * Tell the inbox it is being uncovered rather than simply arriving.
   *
   * It changes how far the screen underneath is allowed to travel, and the
   * difference is not cosmetic. Unaccompanied, the arriving screen may only
   * move as far as the strip of background that exposes on its right — about
   * 22px, which is a hint rather than a parallax. Covered, it can travel a
   * quarter of the viewport, because that edge stays underneath this copy until
   * the copy has finished moving:
   *
   *   at progress p, the copy still covers  [W·p, W]
   *   the gap under the arriving screen is  [W − X(1−p), W]
   *
   * and the second is inside the first for any X ≤ W, at every p, PROVIDED both
   * run on the same duration and the same easing. That is why the numbers are
   * repeated in app/globals.css rather than chosen to taste — they are not two
   * animations that happen to look right together, they are one movement, and
   * changing either one alone puts a strip of bare background on screen.
   */
  // Shown now, and only now. Identical to what is already on screen, so there
  // is nothing to see in the change itself — see the note in takePopShot.
  el.style.opacity = "1"

  const root = document.documentElement
  root.classList.add("pop-covered")
  slideStart = performance.now()

  const done = () => {
    root.classList.remove("pop-covered")
    // The offset the inbox joined at goes with it. Left behind, the next
    // arrival on this screen would start its animation partway through one
    // that ended long ago.
    root.style.removeProperty("--pop-delay")
    slideStart = 0
    el.remove()
  }

  try {
    const anim = el.animate(
      [
        { transform: "translate3d(0, 0, 0)" },
        { transform: "translate3d(100%, 0, 0)" },
      ],
      {
        duration: SLIDE_MS,
        // The curve UIKit uses for a push and a pop: a long, flat decelerate
        // that covers most of the distance early. An even curve over the same
        // travel reads as slower than it is, because the eye judges the tail.
        easing: "cubic-bezier(0.32, 0.72, 0, 1)",
        fill: "forwards",
      },
    )
    anim.addEventListener("finish", done)
    anim.addEventListener("cancel", done)
    // The animation not finishing — a backgrounded tab, a WebView pausing
    // timers mid-slide — must not leave a screenshot over the app.
    window.setTimeout(done, SLIDE_MS + 400)
  } catch {
    done()
  }
}
