"use client"

/**
 * ===========================================================================
 *  ONE SHEET, ONE MOTION
 * ===========================================================================
 * Every phone sheet in /app is this component, so they all open, close and
 * follow the thumb the same way. What it has to get right, and what each
 * earlier version got wrong:
 *
 *   THE FIRST FRAME IS ALREADY OFF SCREEN. The account sheet "double
 *   glitched": it appeared fully open for a frame, vanished, then slid up.
 *   `present` was set from an effect, so the portal was committed by a
 *   default priority render whose passive effects run AFTER the browser has
 *   painted, and the effect that moved the sheet below the screen came one
 *   paint too late. Measured over twenty opens: thirteen painted the sheet at
 *   rest before it slid. Now the portal is committed in the same render that
 *   flips `isOpen`, and the entrance starts in a layout effect, which runs
 *   before that commit is painted.
 *
 *   THE MOTION IS THE COMPOSITOR'S. Open and close are Web Animations on
 *   `transform` and `opacity` with one curve, so a busy main thread cannot
 *   stall them, and an interruption (closed while opening, reopened while
 *   closing) starts from wherever the sheet actually is, read off the running
 *   animation. It can never jump backwards.
 *
 *   THE DRAG DOES NOT GO THROUGH REACT. The finger writes the transform once
 *   per frame and React is told only when the gesture ends. The listeners are
 *   native and non-passive, because React registers touchmove passively and
 *   `preventDefault` in an `onTouchMove` prop does nothing.
 *
 *   A FLICK CLOSES, a stale flick does not, and a close takes as long as the
 *   distance left says it should.
 *
 *   WHAT IS INSIDE STAYS PUT WHILE IT LEAVES. A caller that renders
 *   `{open && <Panel/>}` used to empty the sheet on the first frame of its
 *   close, so it shrank to a handle as it went. The last children are kept
 *   until the sheet is gone.
 *
 *   A SHEET THAT IS TAKEN AWAY STILL LEAVES. When the parent itself goes (a
 *   row deleted from its own action sheet, a page navigated away from with a
 *   sheet open) React removes the sheet in the same commit, and it used to
 *   vanish on that frame. Now a copy of what was on screen is left on the
 *   body, inert, and slides out from exactly where the sheet was
 *   (`leaveBehind` below). Nothing reads it and nothing can touch it; it
 *   removes itself when the slide ends.
 *
 *   A LEAVING SHEET TAKES NO TAPS. From the moment it starts to close the
 *   layer is `pointer-events: none`, so the page and the nav pill under it
 *   answer the next tap instead of a scrim that is already fading.
 *
 *   THE PILL STAYS. The nav pill is not hidden, faded or moved while a sheet
 *   is up. The sheet's layer is above it, so the scrim dims it like the rest
 *   of the page and takes the tap that lands on it (app/globals.css).
 *
 *   A CONTROL THAT OWNS ITS FINGER KEEPS IT. Anything marked
 *   `data-sheet-no-drag` (a cover being pinched, a slider) is left alone
 *   from touchdown: the sheet neither drags nor decides anything about it.
 *
 *   A FLICK IS READ OVER THE LAST FEW FRAMES, not the last one. A single
 *   pair of touch events 4ms apart can say 3 px/ms for a finger doing 1, so
 *   the release velocity is the travel over the last 80ms of samples.
 *
 *   PICTURES ARE DECODED BEFORE IT MOVES, when asked (`waitForImages`): a
 *   sheet whose first frames include decoding a photograph drops exactly
 *   those frames. It waits for them, never longer than IMAGE_WAIT_MS, and
 *   only for a fresh open.
 *
 *   A SHEET THAT IS ALREADY THERE OPENS FOR FREE (`keepMounted`). The
 *   website builder's sheets are never taken out of the page: closed, they
 *   wait below the screen on their own layer, so opening one is a transform
 *   and nothing else. Every other sheet was built on the tap that opened it:
 *   React rendered its content, and the browser matched every one of its
 *   elements against the app's whole stylesheet and laid it out, all before
 *   the first frame could move. Measured on the account, notifications,
 *   date range and share sheets over the home page with the CPU slowed four
 *   times (scripts/check-app-sheets-frames.mjs): 70 to 260ms on the tap, most
 *   of it style for 100 to 300 new elements at about 0.2ms each. A sheet
 *   that asks for it is now built once, while the page is idle, and kept
 *   after it closes: at rest it is below the screen, invisible (so out of
 *   the accessibility tree), takes no tap, has no `data-app-sheet` and does
 *   not tell the page it is up, and its styles and layout are kept, so the
 *   tap that opens it only makes it visible and starts the slide.
 *   `visibility` is one of the properties the browser hands down without
 *   restyling what is inside.
 *
 * `will-change` is set only while something is moving, so a sheet at rest
 * does not hold a layer it does not need; except a kept sheet, which holds
 * its layer the whole time, as the builder's do, so an open never has to
 * make one on its first frame.
 *
 * ===========================================================================
 *  THE SAME HAND AS THE BUILDER'S SHEET
 * ===========================================================================
 * "All the sheets in /app are laggy. The website builder's sheet is
 * perfectly smooth." Both wrote the transform once a frame and moved on the
 * compositor, so the frames were not where they differed. What differed was
 * everything around them, and each one is now what the builder's sheet
 * (components/website-builder/mobile-editor-sheet.tsx) does, from the same
 * arithmetic (components/website-builder/sheet-gestures.ts):
 *
 *   A RELEASE LEAVES AT THE FINGER'S SPEED AND ONLY SLOWS (`snapMotion`).
 *   A snap back ignored the finger: a fixed curve over a time worked out from
 *   the distance, so a sheet let go at 1 px/ms left at 2.5 or at 0. A slow
 *   pull past the line closed on an ease in, so the sheet stopped dead under
 *   the finger and then set off again. Now the curve and its length are
 *   chosen so the first frame moves at the speed the sheet was moving.
 *
 *   IT CLOSES WHERE IT WOULD HAVE GONE (`snapTarget`). Carried on at the
 *   finger's speed, where would the sheet stop? Nearer the bottom than its
 *   resting place, it closes; a flick down always does.
 *
 *   THE SPEED IS THE FINGER'S, TIMED BY THE EVENTS (`releaseVelocity`).
 *   Samples were stamped with the time the handler ran, so a busy frame
 *   bunched three moves into one millisecond and read as a hard flick. The
 *   event's own time is when the finger was there. A finger that held still
 *   before lifting counts as still.
 *
 *   A PULL UP GIVES LIKE A SCROLL VIEW (`rubberBand`), rather than stopping
 *   hard after 28px, and a list that cannot go further up hands the pull to
 *   the sheet instead of doing nothing.
 *
 *   THE PAGE HEARS ABOUT A CLOSE AFTER THE SLIDE HAS STARTED. A pull, a tap
 *   outside or Escape called the parent's onClose in the same task, and
 *   React renders a touch handler's update before the browser paints, so
 *   the parent's whole render ran between the finger lifting and the first
 *   frame of the slide. The slide starts, a frame is drawn, then the parent
 *   is told; the compositor carries the sheet while the page renders.
 *
 *   TOUCHDOWN DOES NOT WAIT FOR SCRIPT. The touchstart listener was
 *   registered non passive, so every scroll that began on a sheet waited on
 *   the main thread before it could move. It never cancels anything, so it
 *   is passive. The end of a gesture is heard on the window, so a finger
 *   lifted from a row that has since been replaced still ends the drag.
 *
 *   THE SAME TIMES. An open in 360ms on iOS's curve, the scrim fading on an
 *   even ease over at most 300ms, so the dimming is done before the sheet
 *   has stopped rather than trailing it.
 *
 * Two things stay as they were, on purpose. The sheet keeps to the finger
 * from the first pixel it moves, the slop included, so it is never a few
 * pixels behind the thumb (Android's WebView holds back the first 15px of
 * a touch, and a drag that started from there would trail by all of it).
 * And a close nobody is dragging (a tap outside, Escape, the page) keeps
 * its ease in and out: iOS's curve covers a quarter of the way in its first
 * two frames, and on a close that read as the sheet vanishing rather than
 * going down.
 *
 *   THE DIM IS ITS OWN LAYER. While a finger drags the sheet, the scrim's
 *   opacity is written every frame. The panel is a layer of its own by its
 *   3D transform, the scrim was not, so each of those frames repainted the
 *   whole screen under it on the main thread. With `will-change: opacity`
 *   it is an opacity on the compositor, for every sheet, not only a kept one.
 *
 *   A BUTTON INSIDE CAN CLOSE IT THE SAME WAY (`data-sheet-close`). A
 *   control that closed its sheet by telling the parent (Explore's "Show 30
 *   results") had the parent's whole render before the slide could start:
 *   the sheet only moved once the page behind had re-rendered. Marked
 *   `data-sheet-close`, its tap closes the sheet as a tap outside does: the
 *   slide first, the parent a frame later.
 */

import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { readPublishedKeyboardInset, sheetFoot, sheetOverKeyboard } from "@/lib/ui/keyboard-safe-sheet"
/* The builder sheet's arithmetic, so the two move alike (pure: no DOM, no React). */
import { releaseVelocity, rubberBand, snapMotion, snapTarget, curveCss, type Sample } from "@/components/website-builder/sheet-gestures"

/**
 * THE TIMING. An open is 360ms on iOS's presentation curve, the builder
 * sheet's own (SNAP_DURATION_MS and SNAP_EASING in
 * components/website-builder/mobile-editor-sheet.tsx): it leaves fast and
 * settles into place, never past it. A close by a tap outside, Escape or the
 * page is 340ms on an ease in and out: it starts gently and ends gently. A
 * release keeps the finger's speed instead (`snapMotion`, see THE SAME HAND
 * above).
 *
 * The scrim does not travel, so it does not use a travelling curve: it
 * fades on the even ease (the builder's FADE_EASING), over at most
 * SHEET_FADE_MS, and is done a little before the sheet stops.
 */
export const SHEET_OPEN_MS = 360
export const SHEET_CLOSE_MS = 340
/** iOS's own sheet curve: leaves fast, arrives slow, never overshoots. For an open. */
export const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** A close nobody is dragging, and the scrim's fade: in gently, out gently. */
export const SHEET_CLOSE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)"
export const SHEET_FADE_MS = 300
const OPEN_MS = SHEET_OPEN_MS
const CLOSE_MS = SHEET_CLOSE_MS
const EASE = SHEET_EASE
const CLOSE_EASE = SHEET_CLOSE_EASE
const FADE_EASE = SHEET_CLOSE_EASE
/** How far a pull upward can lift the sheet at most, on a scroll view's rubber band. */
const PULL_CAP = 80
/** A finger has to travel this far before the sheet decides what it is. */
const SLOP_PX = 6
/** Samples kept for the release speed: more than a 100ms window needs at any touch rate. */
const MAX_SAMPLES = 12
/** The longest an open will wait for its pictures to decode. */
const IMAGE_WAIT_MS = 120
/**
 * The keyboard's own slide, near enough, so the sheet's content rides up with
 * it. The panel itself never moves (A SHEET ON THE KEYBOARD STILL PAINTS TO
 * THE FOOT OF THE SCREEN, lib/ui/keyboard-safe-sheet): what changes is the
 * room taken out of it at the bottom, and the box grown by the same amount,
 * so these three carry the move the way `bottom` used to.
 */
const KEYBOARD_MOVE = "padding-bottom 250ms cubic-bezier(0.32, 0.72, 0, 1), height 250ms cubic-bezier(0.32, 0.72, 0, 1), max-height 250ms cubic-bezier(0.32, 0.72, 0, 1)"

/** How long after the page settles a kept sheet is built, at the latest. */
const PREWARM_TIMEOUT_MS = 4000
/** A kept sheet at rest: there, styled and laid out, and neither seen nor touched. */
const REST_STYLE: React.CSSProperties = { visibility: "hidden", pointerEvents: "none" }

const translate = (y: number) => `translate3d(0, ${y.toFixed(1)}px, 0)`

/**
 * ===========================================================================
 *  THE SHEET THE EYE SEES, AND THE BOX THAT PAINTS IT
 * ===========================================================================
 * A sheet on the keyboard keeps its box down to the foot of the screen and
 * holds the keyboard's room at the bottom as padding (sheetOverKeyboard, and
 * the note it carries). So the box is taller than the sheet anybody can see,
 * by exactly the published inset.
 *
 * Every number the motion works in is the COLUMN, not the box: how far a
 * drag has to travel before it means dismiss, how fast the scrim fades
 * beside it, how long a close takes. Measured against the box instead, a
 * sheet with the keyboard up would need a longer pull to close and would
 * keep a little scrim at the end of one. The one number that is the whole
 * box is the distance that takes the panel off the screen.
 *
 * With no keyboard the inset is 0 and the two are the same number, which is
 * every sheet in the app at rest: nothing about any of this is reached.
 */
function panelLift(aboveKeyboard: boolean): number {
  return aboveKeyboard ? readPublishedKeyboardInset() : 0
}

/** Where the sheet really is right now, running animation included. */
function readY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  if (!t || t === "none") return 0
  return new DOMMatrixReadOnly(t).m42
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * When the finger was there, not when the handler got to run: a busy frame
 * runs three moves back to back, and stamped with `performance.now()` they
 * read as a finger crossing the screen in a millisecond.
 */
function eventTime(e: Event): number {
  const t = e.timeStamp
  const now = performance.now()
  if (typeof t !== "number" || !(t > 0) || t > now + 1000) return now
  return t
}

/**
 * ===========================================================================
 *  THE PAGE IS TOLD A SHEET IS UP BY AN ATTRIBUTE ON <html>, NOT BY :has()
 * ===========================================================================
 * The nav pill steps under a sheet and gives up its taps, and the cookie
 * banner steps aside (app/globals.css). Those rules asked
 * `html:has([data-app-sheet])`, and a `:has()` on the root that changes its
 * answer makes the browser work out the style of every element in the
 * document again. Measured with Chromium's own trace
 * (scripts/check-app-sheets-frames.mjs): 590 elements, the whole home page,
 * restyled on every open and every close, and on every change of any
 * attribute named in any of those `:has()` (a role, an aria-hidden). It was
 * most of what a tap on the pill or the account cost.
 *
 * Now each sheet says where it is, and `data-app-sheet-up` on <html> is
 * "open" while any sheet is open and "closing" while one is still on its
 * way out. A rule on an attribute of <html> restyles only what it names.
 * A sheet's own root carries `data-sheet-root`, which the rules for other
 * dialogs leave out, and a kept sheet never changes its role or
 * aria-modal, so nothing any `:has()` names changes when it opens.
 */
const sheetStates = new Map<object, "open" | "closing">()
function showSheetState(key: object, state: "open" | "closing" | null) {
  if (typeof document === "undefined") return
  if (state) sheetStates.set(key, state)
  else sheetStates.delete(key)
  let up: "open" | "closing" | null = null
  for (const v of sheetStates.values()) {
    if (v === "open") { up = "open"; break }
    up = "closing"
  }
  const html = document.documentElement
  const now = html.getAttribute("data-app-sheet-up")
  if (up === now) return
  if (up) html.setAttribute("data-app-sheet-up", up)
  else html.removeAttribute("data-app-sheet-up")
}

/**
 * The exit for a sheet whose parent has gone. `root` is the sheet's own layer,
 * still in the document when this runs (React calls it before it removes the
 * nodes). A copy goes on the body and finishes the close the sheet would have
 * made: from where it is, down by the distance left, with the scrim fading
 * out beside it.
 */
function leaveBehind(root: HTMLElement, fromY: number, height: number, scrimOpacity: number) {
  if (typeof document === "undefined" || !root.isConnected) return
  const h = Math.max(1, height)
  if (fromY >= h - 1) return
  const ghost = root.cloneNode(true) as HTMLElement
  ghost.setAttribute("data-app-sheet", "closing")
  ghost.setAttribute("data-sheet-ghost", "")
  ghost.setAttribute("aria-hidden", "true")
  ghost.removeAttribute("role")
  ghost.removeAttribute("aria-modal")
  ghost.setAttribute("inert", "")
  ghost.style.pointerEvents = "none"
  const panel = ghost.querySelector<HTMLElement>("[data-sheet-panel]")
  const scrim = ghost.firstElementChild as HTMLElement | null
  if (!panel) return
  /* What was scrolled stays scrolled, so the content does not jump to its top as it goes. */
  const from = root.querySelectorAll<HTMLElement>("[data-sheet-panel] *")
  const to = panel.querySelectorAll<HTMLElement>("*")
  const scrolled: [number, number][] = []
  from.forEach((el, i) => { if (el.scrollTop > 0) scrolled.push([i, el.scrollTop]) })
  panel.style.transform = translate(h)
  panel.style.willChange = "transform"
  if (scrim) scrim.style.opacity = "0"
  document.body.appendChild(ghost)
  /* The page keeps treating it as a sheet on its way out (the pill stays under it). */
  const ghostKey = {}
  showSheetState(ghostKey, "closing")
  for (const [i, top] of scrolled) if (to[i]) to[i].scrollTop = top
  let gone = false
  const done = () => { if (!gone) { gone = true; ghost.remove(); showSheetState(ghostKey, null) } }
  const ms = reducedMotion() ? 1 : Math.max(200, CLOSE_MS * Math.min(1, (h - fromY) / h))
  if (typeof panel.animate !== "function") { done(); return }
  const a = panel.animate([{ transform: translate(fromY) }, { transform: translate(h) }], { duration: ms, easing: CLOSE_EASE })
  scrim?.animate([{ opacity: scrimOpacity }, { opacity: 0 }], { duration: Math.min(ms, SHEET_FADE_MS), easing: FADE_EASE })
  a.onfinish = done
  a.oncancel = done
  /* However the animation ends, or if it never runs (a hidden tab), the copy goes. */
  window.setTimeout(done, ms + 400)
}

/**
 * Whether `scroller` has room to scroll the way a finger moving `dy` would
 * take it: up the list (finger down) needs something above, down the list
 * (finger up) needs something below.
 */
function canScroll(scroller: HTMLElement | null, dy: number): boolean {
  if (!scroller) return false
  if (dy > 0) return scroller.scrollTop > 1
  return scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 1
}

/** How far everything that scrolls between the finger and the sheet is scrolled, summed: 0 is all of it at its top. */
function scrolledAbove(target: EventTarget | null, stop: HTMLElement): number {
  let sum = 0
  let el = target as HTMLElement | null
  while (el && el !== stop) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY
      if (oy === "auto" || oy === "scroll") sum += Math.max(0, el.scrollTop)
    }
    el = el.parentElement
  }
  return sum
}

/** The nearest thing between the finger and the sheet that scrolls vertically. */
function scrollerAt(target: EventTarget | null, stop: HTMLElement): HTMLElement | null {
  let el = target as HTMLElement | null
  while (el && el !== stop) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const oy = getComputedStyle(el).overflowY
      if (oy === "auto" || oy === "scroll") return el
    }
    el = el.parentElement
  }
  return null
}

/*
 * ===========================================================================
 *  SAFARI'S FLOATING BAR
 * ===========================================================================
 * Image 55: the notifications sheet on an iPhone ended a hand's width above
 * the bottom of the screen, and between it and the browser's floating bar
 * the page showed through, undimmed. Safari 26 puts `bottom: 0` at the top
 * of its bar, not at the bottom of the screen, and draws a fully opaque
 * fixed layer only down to there; the skirt below the sheet was cut off
 * with it. What Safari carries on under its bar is what it reads from a
 * FIXED element at the edge (it tints and fills the bar from it) and any
 * layer that is not fully opaque. So while a sheet is up (never while a
 * kept one rests below the screen) its panel and its dim are fixed
 * themselves, not only placed inside the fixed root, and the panel's
 * opacity is 0.999: under 1, which is what makes Safari paint the panel,
 * and its skirt, on to the bottom of the screen, and too close to 1 to
 * show anything through (0.99 let the dimmed page show faintly through
 * the white in screenshots). Everywhere else (Chrome, Android, the app's own
 * WebView) it changes nothing: the geometry is the same either way, since
 * the root is itself fixed to the whole window.
 */
export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  label,
  header,
  hideFrom = "sm",
  fill = false,
  height,
  maxHeight = "min(86dvh, 720px)",
  aboveKeyboard = false,
  className,
  scrollKey,
  scrim = "dim",
  waitForImages = false,
  onClosed,
  onOpened,
  dismissible = true,
  lowered = 0,
  onRaise,
  keepMounted = false,
  zIndex,
}: {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  /** For a sheet with no visible title. */
  label?: string
  /** Drawn under the handle, and draggable like it: a title row with a close button, say. */
  header?: React.ReactNode
  /** The width from which a phone sheet is not drawn at all. Match whatever decides to open it. */
  hideFrom?: "sm" | "md" | null
  /** The children lay themselves out and scroll themselves (a list under tabs, say). */
  fill?: boolean
  /** A fixed height, so content that arrives late does not move the top edge. */
  height?: string
  maxHeight?: string
  /**
   * The sheet has a field in it: it sits on the keyboard rather than under
   * it, and is never taller than the room the keyboard leaves
   * (lib/ui/keyboard-safe-sheet). Off by default, so no sheet without a
   * field changes.
   */
  aboveKeyboard?: boolean
  className?: string
  /** When this changes the content scrolls back to the top: a list that
      swaps for a sub-list, say, would otherwise open part way down. */
  scrollKey?: string | number | null
  /**
   * "clear" leaves the page behind undimmed: for a sheet that edits that
   * page, where dimming the thing being changed works against seeing it
   * change. The layer is still there and a tap on it still closes.
   */
  scrim?: "dim" | "clear"
  /** Hold a fresh open until the pictures inside have decoded (at most IMAGE_WAIT_MS). */
  waitForImages?: boolean
  /** Runs once the sheet has finished leaving and is out of the document (or, kept, at rest). */
  onClosed?: () => void
  /** Runs once the sheet has finished arriving: the moment for work that should not share its frames. */
  onOpened?: () => void
  /**
   * False while the sheet must stay (a save in flight): a pull down springs
   * back, and a tap outside or Escape does nothing, rather than the sheet
   * sliding away and coming back up because the parent said no.
   */
  dismissible?: boolean
  /**
   * A SECOND RESTING PLACE, LOWER DOWN. Pixels below its full height that the
   * open sheet sits at, so the page above it shows (a colour being tried on
   * the page behind, say). The sheet glides there and back when this changes,
   * a drag starts from wherever it is, and a pull up or a flick up takes it
   * back to the top, telling the caller through `onRaise`. 0, the default, is
   * a sheet with one resting place, exactly as before.
   */
  lowered?: number
  /** The finger took a lowered sheet back up to the top. */
  onRaise?: () => void
  /**
   * Build the sheet while the page is idle and keep it after it closes, so
   * opening it costs no rendering, styling or layout (see A SHEET THAT IS
   * ALREADY THERE above). What is inside keeps its state between opens, so
   * a caller that wants a fresh start resets it itself.
   */
  keepMounted?: boolean
  /**
   * ABOVE A PANEL THAT IS ITSELF ABOVE THE PAGE. A sheet sits at z-index 200,
   * which clears the page and its chrome. A field inside a panel drawn higher
   * than that (Set up payments is a full screen subpage at 1000) would open
   * its sheet behind the panel: the tap looks like it did nothing. Such a
   * panel passes the layer it wants the sheet on, and nothing else moves.
   */
  zIndex?: number
}) {
  const [mounted, setMounted] = useState(false)
  /**
   * In the DOM or not. Derived during render, not in an effect: an effect
   * that sets this is what put a whole extra paint between "open" and "the
   * sheet is below the screen, ready to rise".
   */
  const [present, setPresent] = useState(isOpen)
  /* Kept, closed and still: in the DOM, out of sight (keepMounted). */
  const [resting, setResting] = useState(false)
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      setPresent(true)
      setResting(false)
    }
  }
  const atRest = resting && !isOpen

  /* The children the sheet had while open, drawn unchanged while it leaves.
     A kept sheet at rest draws what it is given, so it opens up to date. */
  const shownRef = useRef<React.ReactNode>(children)
  if (isOpen || atRest) shownRef.current = children

  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [scrollKey])

  /* Gesture and motion state is refs: none of it should cause a render. */
  const startYRef = useRef(0)
  const startXRef = useRef(0)
  /* Where the finger came down, for how far the whole gesture went. */
  const downYRef = useRef(0)
  const lastYRef = useRef(0)
  const draggingRef = useRef(false)
  const pendingRef = useRef(false)
  /* The finger is scrolling the list. If that scroll runs out at the top and the finger keeps going down, the sheet takes the rest. */
  const scrollingRef = useRef(false)
  /* A finger that came down on this sheet and has not lifted: the window's touchend is only this sheet's then. */
  const touchingRef = useRef(false)
  const fromHandleRef = useRef(false)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const offsetRef = useRef(0)
  /** The column: what the sheet looks like it is (panelLift). */
  const heightRef = useRef(0)
  /** The box: how far down the panel has to go to be off the screen. */
  const goneRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const animsRef = useRef<Animation[]>([])
  const closingRef = useRef(false)
  /* The last few finger positions, for a release velocity that is not one noisy pair. */
  const samplesRef = useRef<Sample[]>([])
  /* A close the parent has not been told about yet (see THE PAGE HEARS ABOUT A CLOSE): the frame and the timer that will. */
  const tellRef = useRef<{ raf: number; timer: number } | null>(null)
  /* Bumped by every open, so a wait for pictures that outlives its open does nothing. */
  const openTokenRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const onClosedRef = useRef(onClosed)
  /**
   * ONLY A KEYBOARD MOVES IT, AND ONLY ONCE IT HAS ARRIVED. `bottom` carries
   * a 250ms transition so a keyboard lifts the sheet rather than teleporting
   * it. While the sheet is still rising, that same transition turned any
   * change in the reported keyboard inset into a second, slower slide a
   * moment after it landed: the sheet appeared to creep up and settle again.
   * The inset still applies from the first frame (a keyboard already up puts
   * the sheet in the right place at once); only the transition waits.
   */
  const [settled, setSettled] = useState(false)
  const onOpenedRef = useRef(onOpened)
  const waitRef = useRef(waitForImages)
  const dismissibleRef = useRef(dismissible)
  const onRaiseRef = useRef(onRaise)
  const keepRef = useRef(keepMounted)
  const aboveKbRef = useRef(aboveKeyboard)
  useEffect(() => { onCloseRef.current = onClose; onClosedRef.current = onClosed; onOpenedRef.current = onOpened; waitRef.current = waitForImages; dismissibleRef.current = dismissible; onRaiseRef.current = onRaise; keepRef.current = keepMounted; aboveKbRef.current = aboveKeyboard })
  /** Both numbers off the panel as it stands now (THE SHEET THE EYE SEES). */
  const sizeUp = useCallback((sheet: HTMLElement) => {
    goneRef.current = sheet.offsetHeight || goneRef.current || 600
    heightRef.current = Math.max(1, goneRef.current - panelLift(aboveKbRef.current))
  }, [])
  /** Where the open sheet rests: 0 at the top, or `lowered` below it. */
  const restRef = useRef(0)
  /**
   * How far a `data-sheet-pin-bottom` element is held up against the sheet
   * going down: the lowered distance, kept through the glide back up and
   * cleared once the sheet is at the top again. See `pinY`.
   */
  const pinLimitRef = useRef(0)
  const isOpenRef = useRef(isOpen)
  useLayoutEffect(() => { isOpenRef.current = isOpen }, [isOpen])
  const atRestRef = useRef(atRest)
  useLayoutEffect(() => { atRestRef.current = atRest }, [atRest])
  /* Where this sheet is, for <html> (see showSheetState): in the same commit as its own attributes. */
  const stateKeyRef = useRef({})
  const pageState = !mounted || !present || atRest ? null : isOpen ? "open" : "closing"
  useLayoutEffect(() => {
    const key = stateKeyRef.current
    showSheetState(key, pageState)
    return () => showSheetState(key, null)
  }, [pageState])
  /* The layer a panel keeps between moves: a kept sheet's, always. */
  const restingWillChange = () => (keepRef.current ? "transform" : "")

  useEffect(() => setMounted(true), [])

  /**
   * BUILT WHILE NOTHING ELSE IS HAPPENING. A kept sheet is put in the page
   * the first time the page is idle, at a priority any tap overtakes, so
   * even the first open is only a slide. Opened before then, it is built on
   * the tap as any other sheet is.
   */
  useEffect(() => {
    if (!keepMounted || !mounted || present) return
    const build = () => {
      if (isOpenRef.current) return
      startTransition(() => {
        setPresent(true)
        setResting(true)
      })
    }
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(build, { timeout: PREWARM_TIMEOUT_MS })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(build, 1200)
    return () => window.clearTimeout(t)
  }, [keepMounted, mounted, present])

  const stopMotion = useCallback(() => {
    for (const a of animsRef.current) a.cancel()
    animsRef.current = []
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  /**
   * THE FOOTER STAYS ON THE SCREEN WHILE THE SHEET IS LOWERED. Anything in
   * the sheet marked `data-sheet-pin-bottom` (Cancel and Save) is moved up by
   * as much as the sheet has gone down, up to the lowered distance, so it
   * sits where it was, at the bottom edge, while the rest of the sheet slides
   * down behind it. Past that (a pull down to close) it goes with the sheet.
   * Nothing is marked in a sheet that is never lowered, and nothing moves.
   */
  const pinY = (y: number) => -Math.min(Math.max(y, 0), pinLimitRef.current)
  const pins = (sheet: HTMLElement) => Array.from(sheet.querySelectorAll<HTMLElement>("[data-sheet-pin-bottom]"))

  const paint = useCallback(() => {
    rafRef.current = null
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transform = translate(offsetRef.current)
    if (pinLimitRef.current > 0) for (const el of pins(sheet)) el.style.transform = translate(pinY(offsetRef.current))
    const scrim = scrimRef.current
    /* The backdrop lightens as the sheet leaves, so the two move together. */
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - offsetRef.current / (heightRef.current || 1))))
  }, [])

  /**
   * Move from wherever the sheet is to `to`, on the compositor.
   *
   * The final value goes on the node first and the animation plays over it,
   * so when the animation ends there is nothing to hand back: the node is
   * already where the animation left it.
   */
  const glide = useCallback((from: number, to: number, ms: number, then?: () => void, easing: string = EASE) => {
    const sheet = sheetRef.current
    const scrim = scrimRef.current
    if (!sheet) { then?.(); return }
    stopMotion()
    const h = heightRef.current || sheet.offsetHeight || 1
    const duration = reducedMotion() ? 1 : Math.max(1, Math.round(ms))
    const opacity = (y: number) => Math.max(0, Math.min(1, 1 - y / h))
    offsetRef.current = to
    sheet.style.willChange = "transform"
    sheet.style.transform = translate(to)
    if (scrim) scrim.style.opacity = String(opacity(to))
    if (typeof sheet.animate !== "function") {
      sheet.style.willChange = restingWillChange()
      then?.()
      return
    }
    const timing: KeyframeAnimationOptions = { duration, easing }
    const a = sheet.animate([{ transform: translate(from) }, { transform: translate(to) }], timing)
    const anims = [a]
    /* The scrim on its own even fade, finished no later than the sheet (see THE TIMING). */
    if (scrim) anims.push(scrim.animate([{ opacity: opacity(from) }, { opacity: opacity(to) }], { duration: Math.min(duration, SHEET_FADE_MS), easing: FADE_EASE }))
    /* The pinned footer moves by the inverse, on the same clock, so it holds still on screen. */
    const pinned = pinLimitRef.current > 0 ? pins(sheet) : []
    for (const el of pinned) {
      el.style.transform = translate(pinY(to))
      anims.push(el.animate([{ transform: translate(pinY(from)) }, { transform: translate(pinY(to)) }], timing))
    }
    animsRef.current = anims
    a.onfinish = () => {
      if (animsRef.current[0] !== a) return
      animsRef.current = []
      sheet.style.willChange = restingWillChange()
      /* Back at the top: nothing is held any more. */
      if (restRef.current === 0 && to <= 0.5) {
        pinLimitRef.current = 0
        for (const el of pinned) el.style.transform = ""
      }
      then?.()
    }
  }, [stopMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Where the sheet is this frame: mid-animation, mid-drag or at rest. */
  const currentY = useCallback(() => {
    const sheet = sheetRef.current
    if (!sheet) return 0
    if (animsRef.current.length) return readY(sheet)
    return offsetRef.current
  }, [])

  /* ── Open and close ─────────────────────────────────────────────────── */
  useLayoutEffect(() => {
    if (!mounted || !present) return
    /* Built ahead, or back at rest after a close: nothing to move. */
    if (atRest) return
    const sheet = sheetRef.current
    if (!sheet) return
    sizeUp(sheet)
    if (isOpen) {
      closingRef.current = false
      /* A fresh open is unsettled again, so the keyboard curve waits for this one too. */
      setSettled(false)
      const token = ++openTokenRef.current
      /* Fresh: from below the screen. Reopened mid-close: from where it is. */
      const fresh = !animsRef.current.length
      /* A kept sheet opens at the top of its content, as a new one would. */
      if (fresh && keepRef.current && bodyRef.current) bodyRef.current.scrollTop = 0
      const from = fresh ? goneRef.current : readY(sheet)
      const pictures =
        waitRef.current && fresh
          ? Array.from(sheet.querySelectorAll("img[src]")).filter((img) => img.src && typeof img.decode === "function")
          : []
      const opened = () => {
        /* Settled: from here a keyboard may move it, with its own curve. */
        setSettled(true)
        onOpenedRef.current?.()
      }
      if (!pictures.length) {
        glide(from, restRef.current, OPEN_MS, opened)
        return
      }
      /* Parked below the screen, invisible, until the pictures are ready. */
      offsetRef.current = from
      sheet.style.transform = translate(from)
      Promise.race([
        Promise.all(pictures.map((img) => img.decode().catch(() => undefined))),
        new Promise((resolve) => window.setTimeout(resolve, IMAGE_WAIT_MS)),
      ]).then(() => {
        if (openTokenRef.current !== token || !isOpenRef.current || closingRef.current) return
        if (draggingRef.current || animsRef.current.length) return
        glide(offsetRef.current, restRef.current, OPEN_MS, opened)
      })
      return
    }
    /**
     * ONE DISMISSAL, and `closingRef` is what makes it one. A drag that
     * dismisses has already started the slide out before it tells the
     * parent, and the parent's answer must not start a second one.
     */
    if (closingRef.current) return
    closingRef.current = true
    const from = currentY()
    const travel = Math.max(1, heightRef.current - from)
    /* The page closed it: in gently and out gently, over the part of the way that is left. */
    const ms = Math.max(200, CLOSE_MS * Math.min(1, travel / heightRef.current))
    glide(from, heightRef.current, ms, () => {
      closingRef.current = false
      pinLimitRef.current = 0
      if (keepRef.current) setResting(true)
      else setPresent(false)
      onClosedRef.current?.()
    }, CLOSE_EASE)
  }, [isOpen, present, mounted, atRest, glide, currentY, sizeUp])

  useEffect(() => () => {
    stopMotion()
    const tell = tellRef.current
    if (tell) { cancelAnimationFrame(tell.raf); window.clearTimeout(tell.timer); tellRef.current = null }
  }, [stopMotion])

  /* The resting place moved (see `lowered`): an open sheet at rest glides there. */
  useLayoutEffect(() => {
    const next = Math.max(0, lowered || 0)
    const prev = restRef.current
    restRef.current = next
    /* Held for the whole move, whichever way it goes; cleared at the top (glide). */
    pinLimitRef.current = Math.max(pinLimitRef.current, next)
    if (!mounted || !present || !isOpenRef.current || closingRef.current || draggingRef.current) return
    const sheet = sheetRef.current
    if (!sheet || Math.abs(prev - next) < 0.5) return
    const from = currentY()
    if (Math.abs(from - next) < 0.5) return
    glide(from, next, Math.max(260, Math.min(OPEN_MS, OPEN_MS * 1.6 * Math.abs(from - next) / (heightRef.current || 1))))
  }, [lowered, mounted, present, glide, currentY])

  /**
   * TAKEN AWAY WHILE ON SCREEN. This cleanup runs when the sheet itself is
   * unmounted, before React removes its nodes, so the layer is still there to
   * copy and the running animation still says where the panel is.
   */
  const leaveRef = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    leaveRef.current = () => {
      const root = rootRef.current
      const sheet = sheetRef.current
      /* A kept sheet at rest was never on screen: nothing to see leave. */
      if (!root || !sheet || atRestRef.current) return
      const scrim = scrimRef.current
      leaveBehind(root, currentY(), goneRef.current || sheet.offsetHeight, scrim ? Number(getComputedStyle(scrim).opacity) || 0 : 0)
    }
  })
  useLayoutEffect(() => {
    const leave = leaveRef
    return () => leave.current()
  }, [])

  /** Tells the parent now, if it has not been told yet. True if it had not. */
  const tellNow = useCallback(() => {
    const tell = tellRef.current
    if (!tell) return false
    cancelAnimationFrame(tell.raf)
    window.clearTimeout(tell.timer)
    tellRef.current = null
    onCloseRef.current()
    return true
  }, [])

  /** Back to where it rests, from wherever it is, leaving at `velocity`. */
  const springBack = useCallback((velocity = 0) => {
    const from = currentY()
    const rest = restRef.current
    if (Math.abs(from - rest) <= 0.5) return
    const motion = snapMotion(rest - from, velocity)
    glide(from, rest, motion.ms, undefined, curveCss(motion.curve))
  }, [currentY, glide])

  /**
   * Out of the way, then gone: the parent is told, and its answer closes it.
   * `velocity` is the finger's at release, downward: the slide leaves at it.
   */
  const dismiss = useCallback((velocity = 0) => {
    if (closingRef.current) return
    if (!dismissibleRef.current) {
      springBack(Math.min(velocity, 0))
      return
    }
    closingRef.current = true
    const sheet = sheetRef.current
    /* Again now: a keyboard that came up after the sheet did changed both
       numbers, and a close is the one move that has to clear the box. */
    if (sheet) sizeUp(sheet)
    const h = heightRef.current || sheet?.offsetHeight || 600
    /* Off the screen is the box; how long that takes is the column, as it was. */
    const gone = Math.max(h, goneRef.current || h)
    const from = currentY()
    const travel = Math.max(1, h - from)
    /* A release keeps the finger's speed; a tap outside or Escape eases in and out over what is left. */
    const motion = velocity > 0 ? snapMotion(travel, velocity) : null
    const ms = motion ? motion.ms : Math.max(200, CLOSE_MS * Math.min(1, travel / h))
    /* A leaving sheet takes no taps, from now, not from the parent's answer. */
    if (rootRef.current) rootRef.current.style.pointerEvents = "none"
    const settled = () => {
      closingRef.current = false
      /* The parent said no (a refund still in flight, say): come back up
         rather than leave a sheet it still thinks is open. */
      if (isOpenRef.current) {
        if (rootRef.current) rootRef.current.style.pointerEvents = ""
        glide(gone, restRef.current, OPEN_MS)
        return
      }
      pinLimitRef.current = 0
      if (keepRef.current) setResting(true)
      else setPresent(false)
      onClosedRef.current?.()
    }
    glide(from, gone, ms, () => {
      /* Arrived before the parent was told (a background tab draws no frames): tell it, and give it a moment to answer. */
      if (tellNow()) window.setTimeout(settled, 50)
      else settled()
    }, motion ? curveCss(motion.curve) : CLOSE_EASE)
    /**
     * THE PARENT IS TOLD ONCE THE SLIDE HAS HAD A FRAME. Told here, React
     * would render the parent before the browser paints, and the slide
     * would wait for that render. After the next frame the compositor is
     * already carrying the sheet and the render only runs beside it.
     * With less motion asked for there is no slide to protect.
     */
    if (reducedMotion()) { onCloseRef.current(); return }
    tellNow()
    const tell = { raf: 0, timer: 0 }
    tell.raf = requestAnimationFrame(() => { tell.timer = window.setTimeout(tellNow, 0) })
    tellRef.current = tell
  }, [currentY, glide, springBack, tellNow, sizeUp])

  const requestClose = useCallback(() => { dismiss(0) }, [dismiss])

  /* A control inside marked `data-sheet-close` closes the sheet as a tap outside does (A BUTTON INSIDE CAN CLOSE IT). */
  const onPanelClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return
    const closer = (e.target as HTMLElement | null)?.closest?.("[data-sheet-close]")
    if (closer && e.currentTarget.contains(closer)) requestClose()
  }, [requestClose])

  /* ── The drag ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mounted || !present) return
    const sheet = sheetRef.current
    if (!sheet) return

    const onStart = (e: TouchEvent) => {
      /* A second finger is a pinch, not a drag: whatever the first began settles where it was left. */
      if (e.touches.length > 1) { if (touchingRef.current) onEnd(null); return }
      touchingRef.current = false
      if (closingRef.current) return
      const target = e.target as HTMLElement | null
      /* The control under the finger has asked for it: a pinch, a slider. */
      if (target?.closest?.("[data-sheet-no-drag]")) {
        pendingRef.current = false
        draggingRef.current = false
        return
      }
      touchingRef.current = true
      scrollingRef.current = false
      fromHandleRef.current = !!target?.closest?.("[data-sheet-handle]")
      scrollerRef.current = fromHandleRef.current ? null : scrollerAt(target, sheet)
      /* Mid-animation: take the sheet from exactly where it is. */
      if (animsRef.current.length) {
        const y = readY(sheet)
        stopMotion()
        offsetRef.current = y
        sheet.style.transform = translate(y)
      }
      /* Measuring the sheet forces layout. Once an open has measured it, a new finger does not measure it again. */
      if (!heightRef.current) sizeUp(sheet)
      pendingRef.current = true
      draggingRef.current = false
      startYRef.current = e.touches[0].clientY - offsetRef.current
      startXRef.current = e.touches[0].clientX
      downYRef.current = e.touches[0].clientY
      lastYRef.current = e.touches[0].clientY
      samplesRef.current = [{ t: eventTime(e), y: lastYRef.current }]
    }

    const onMove = (e: TouchEvent) => {
      if (!touchingRef.current || (!pendingRef.current && !draggingRef.current && !scrollingRef.current)) return
      const y = e.touches[0].clientY
      /* A list that has come back to its top hands the rest of the same downward finger to the sheet, the way the editor's sheet does. */
      if (scrollingRef.current && !draggingRef.current) {
        const step = y - lastYRef.current
        lastYRef.current = y
        const scroller = scrollerRef.current
        const field = (e.target as HTMLElement | null)?.closest?.("textarea, input, [contenteditable='true']")
        if (!(scroller && step > 0 && scroller.scrollTop <= 0 && !field)) return
        scrollingRef.current = false
        draggingRef.current = true
        sheet.style.willChange = "transform"
        startYRef.current = y - offsetRef.current
      }
      if (pendingRef.current) {
        const dy = y - lastYRef.current
        const dx = e.touches[0].clientX - startXRef.current
        if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) {
          /**
           * THE FIRST PIXELS ARE THE SHEET'S TOO. They were left to the
           * browser unless the finger was on the handle, so on a list that
           * could not scroll the way the finger went (a short sub-list, or
           * any list at its end) the browser chained them to the page, and a
           * page that has started to scroll keeps the finger: the list sat
           * still and the page behind the sheet moved. Held now, unless the
           * list under the finger can take them itself.
           */
          const vertical = dy !== 0 && Math.abs(dy) >= Math.abs(dx)
          if (e.cancelable && (fromHandleRef.current || (vertical && !canScroll(scrollerRef.current, dy)))) e.preventDefault()
          return
        }
        pendingRef.current = false
        /* Sideways is a row of tabs or chips scrolling, not the sheet. */
        if (Math.abs(dx) > Math.abs(dy)) return
        const scroller = scrollerRef.current
        /*
          A list keeps the finger, except for the one pull it can not take: a
          pull down that starts with everything under the finger already at
          its top. That pull is the sheet's, as on an iOS sheet and the
          website builder's (sheet-gestures.ts dragIntent), so a post closes
          from anywhere on it, not only from the handle. Decided once, here,
          on the first move. A scroll that later runs out at the top hands the
          rest of that finger to the sheet, and a field being typed in keeps its own finger.
        */
        if (!fromHandleRef.current && scroller) {
          const pullFromTop = dy > 0 && scrolledAbove(e.target, sheet) <= 0 && !(e.target as HTMLElement | null)?.closest?.("textarea, input, [contenteditable='true']")
          if (!pullFromTop) {
            scrollingRef.current = true
            if (!canScroll(scroller, dy) && e.cancelable && Math.abs(dy) >= Math.abs(dx)) e.preventDefault()
            return
          }
        }
        draggingRef.current = true
        sheet.style.willChange = "transform"
      }
      if (!draggingRef.current) return
      let next = y - startYRef.current
      if (next < 0) {
        /**
         * PULLING UP MOVES THE SHEET, AND THE SHEET HAS A BOTTOM. It gives on
         * a scroll view's rubber band, less the further it goes and never
         * past PULL_CAP, and the sheet paints on past its own bottom edge
         * (the skirt below), so even the full give uncovers nothing.
         */
        next = -rubberBand(-next, PULL_CAP)
      }
      /* Native and non-passive, so this actually refuses the page's scroll. */
      if (e.cancelable) e.preventDefault()
      const samples = samplesRef.current
      samples.push({ t: eventTime(e), y })
      if (samples.length > MAX_SAMPLES) samples.shift()
      lastYRef.current = y
      offsetRef.current = next
      /* Written on the event, not the next frame: a frame of lag is what makes the sheet trail the finger. */
      paint()
    }

    /* `null` is a gesture cut short (a second finger): no speed, no flick. */
    function onEnd(e: TouchEvent | null) {
      /* Heard on the window, so only a gesture that began on this sheet is this sheet's. */
      if (!touchingRef.current) return
      if (e && e.type === "touchend" && e.touches.length > 0) return
      touchingRef.current = false
      pendingRef.current = false
      scrollingRef.current = false
      if (!draggingRef.current) {
        /* Touched mid-animation and let go without dragging: finish the move. */
        if (!closingRef.current && Math.abs(offsetRef.current - restRef.current) > 0.5 && !animsRef.current.length) springBack(0)
        return
      }
      draggingRef.current = false
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; paint() }
      /**
       * A FLICK IS A FLICK ONLY IF THE FINGER WAS STILL MOVING WHEN IT LEFT.
       * `releaseVelocity` counts a finger that held still before lifting as
       * still; a gesture the system took (touchcancel) has no speed at all.
       */
      const v = !e || e.type === "touchcancel" ? 0 : releaseVelocity(samplesRef.current, eventTime(e))
      const rest = restRef.current
      const h = heightRef.current || 1
      const current = offsetRef.current
      /* Where it would stop, carried on at that speed: the top, where it rests, or gone. */
      const stops = rest > 0 ? [0, rest, h] : [rest, h]
      const index = snapTarget({ offsets: stops, current, velocity: v, totalDelta: lastYRef.current - downYRef.current })
      if (index === stops.length - 1) {
        dismiss(Math.max(v, 0))
      } else if (rest > 0 && index === 0) {
        /* Up from a lowered rest: back to the top, and the caller hears it. */
        restRef.current = 0
        const motion = snapMotion(-current, v)
        glide(current, 0, motion.ms, undefined, curveCss(motion.curve))
        onRaiseRef.current?.()
      } else {
        springBack(v)
      }
    }

    /* Touchdown never cancels anything, so it does not make the browser wait for script. */
    sheet.addEventListener("touchstart", onStart, { passive: true })
    sheet.addEventListener("touchmove", onMove, { passive: false })
    /* On the window: a finger lifted from a row that was replaced under it still ends the drag. */
    const onLift = (e: TouchEvent) => onEnd(e)
    window.addEventListener("touchend", onLift)
    window.addEventListener("touchcancel", onLift)
    return () => {
      sheet.removeEventListener("touchstart", onStart)
      sheet.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onLift)
      window.removeEventListener("touchcancel", onLift)
    }
  }, [mounted, present, dismiss, glide, paint, stopMotion, springBack, sizeUp])

  /* The scrim takes no scroll: a drag on it must not move the page behind. */
  useEffect(() => {
    if (!mounted || !present) return
    const scrim = scrimRef.current
    if (!scrim) return
    const refuse = (e: TouchEvent) => { if (e.cancelable) e.preventDefault() }
    scrim.addEventListener("touchmove", refuse, { passive: false })
    return () => scrim.removeEventListener("touchmove", refuse)
  }, [mounted, present])

  /**
   * FOCUS GOES IN, AND COMES BACK. A modal dialog that leaves focus on the
   * page behind it is one a screen reader never enters, and one a keyboard
   * tabs straight past. The panel takes focus when it opens, without
   * scrolling anything, and the control that opened it gets it back after.
   */
  /* Both moves wait for the slide to finish: a focus change restyles the
     control that gains it and the one that loses it, and neither belongs in
     the first frames of a movement. */
  useEffect(() => {
    if (!isOpen || !mounted) return
    const opener = document.activeElement as HTMLElement | null
    const into = window.setTimeout(() => {
      const panel = sheetRef.current
      if (panel && isOpenRef.current && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    }, reducedMotion() ? 0 : OPEN_MS)
    return () => {
      window.clearTimeout(into)
      window.setTimeout(() => {
        /* Only if focus has not gone somewhere of its own since (a sheet
           opened again, a field tapped). */
        const now = document.activeElement
        if (now && now !== document.body && !rootRef.current?.contains(now)) return
        if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true })
      }, reducedMotion() ? 0 : CLOSE_MS)
    }
  }, [isOpen, mounted])

  useEffect(() => {
    if (!isOpen) return
    /* Not an Escape something inside already used: a menu or a popover in
       the sheet closes itself (Radix marks the event), and the sheet, with
       whatever was typed into it, stays. Nor one that ends an IME word. */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return
      requestClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, requestClose])

  if (!mounted || !present) return null

  return createPortal(
    <div
      ref={rootRef}
      /* At rest a kept sheet is not a sheet to the page's own rules (the
         pill, the cookie banner) nor a dialog to a screen reader. */
      data-app-sheet={atRest ? undefined : isOpen ? "open" : "closing"}
      data-app-sheet-rest={atRest ? "" : undefined}
      /* The rules for other dialogs leave this one out; <html> says it is up. */
      data-sheet-root=""
      className={cn("fixed inset-0", zIndex == null && "z-[200]", hideFrom === "sm" && "sm:hidden", hideFrom === "md" && "md:hidden")}
      style={{ ...(zIndex == null ? null : { zIndex }), ...(isOpen ? null : atRest ? REST_STYLE : { pointerEvents: "none" }) }}
      /* The same at rest: a role or an aria-* that changed would be a change
         under the page's `:has()` rules. Out of sight, it is out of the
         accessibility tree anyway. */
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
    >
      <div
        ref={scrimRef}
        onClick={requestClose}
        /* Fixed in its own right, not only through the root (SAFARI'S FLOATING BAR below). */
        className={cn(atRest ? "absolute inset-0" : "fixed inset-0", scrim === "clear" ? "bg-transparent" : "bg-black/40")}
        /* Below the screen and invisible on the very first paint, before any
           script has run: there is no frame in which the sheet is at rest.
           Its own layer, so a drag's dimming is the compositor's (THE DIM IS
           ITS OWN LAYER). */
        style={{ opacity: 0, touchAction: "none", willChange: "opacity" }}
      />
      <div
        ref={sheetRef}
        data-sheet-panel=""
        tabIndex={-1}
        onClick={onPanelClick}
        className={cn(atRest ? "absolute" : "fixed", "inset-x-0 bottom-0 rounded-t-[20px] bg-white outline-none", className)}
        style={{
          transform: "translate3d(0, 100%, 0)",
          /* See SAFARI'S FLOATING BAR: a hair under 1, so the layer is drawn on past the bar's edge. Not while it rests below the screen. */
          ...(atRest ? null : { opacity: 0.999 }),
          /* Its own layer for the whole time it is on screen, so the first pixel of a drag does not have to build one. */
          willChange: keepMounted || !atRest ? "transform" : undefined,
          /* The sheet owns every touch on it: the browser must not decide
             half way through that this was a scroll. */
          touchAction: "none",
          /*
            ON THE KEYBOARD, AND STILL DOWN TO THE FOOT OF THE SCREEN. The
            panel is never lifted off the bottom: the keyboard's room is
            taken out of it as padding and added back to its height, so the
            content column is where a lifted panel put it and the box carries
            on underneath in the sheet's own white. Image 66, and the long
            note in lib/ui/keyboard-safe-sheet.
          */
          ...(aboveKeyboard ? sheetOverKeyboard(maxHeight, height) : { ...sheetFoot(), maxHeight, height }),
          /* A keyboard arriving moves the content with it rather than in one frame. */
          ...(aboveKeyboard && settled ? { transition: KEYBOARD_MOVE } : {}),
          display: "flex",
          flexDirection: "column",
          /* Layout and style stop at the panel. Paint cannot: the skirt
             below is painted outside it on purpose. The content inside gets
             paint containment as well (the body below). */
          contain: "layout style",
          /* A short soft edge along the top. It was a 40px blur at 18%:
             under a 40% scrim it could not be seen, and it was the largest
             thing to raster on the first frame of every open. */
          boxShadow: "0 -2px 16px rgba(0, 0, 0, 0.08)",
        }}
      >
        <div data-sheet-handle className="shrink-0 pt-2.5 pb-1">
          <div className="mx-auto h-1 w-9 rounded-full bg-neutral-300" />
          {title && !header && (
            <p className="px-5 pt-3 text-[15px] font-semibold text-neutral-900">{title}</p>
          )}
          {header}
        </div>
        {fill ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain" style={{ touchAction: "pan-x pan-y", contain: "layout paint" }}>
            {shownRef.current}
          </div>
        ) : (
          <div ref={bodyRef} data-sheet-scroll="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y", contain: "layout paint" }}>
            {shownRef.current}
          </div>
        )}
        {/*
          THE SKIRT. The sheet's own colour, carried on below where the sheet
          ends. Nothing here is ever meant to be seen: it is what is there
          instead of the scrim when the sheet is lifted by a pull, by a
          keyboard, or by a phone deciding its safe area is bigger than it
          said. Out of the layout, so it changes nothing above it.
        */}
        <div
          aria-hidden
          style={{ position: "absolute", left: 0, right: 0, top: "100%", height: 160, background: "inherit" }}
        />
      </div>
    </div>,
    document.body,
  )
}

export default BottomSheet
