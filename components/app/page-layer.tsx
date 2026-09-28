"use client"

import * as React from "react"
import { useLayoutEffect, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { cn } from "@/lib/utils"
import { HtmlClassScript } from "@/components/platform/html-class"
import { routerStartCount } from "@/lib/ui/router-starts"
import { getAppNavigation } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  A LAYER RISES FROM THE BOTTOM, AND DROPS BACK DOWN
 * ===========================================================================
 * "When I click on a product to go to the edit product page, make sure that
 * slide is smooth. It should not slide to the left or right. It should come
 * from the bottom, very smooth and clean. When I click back or cancel, the
 * same thing reversed." And for every page drawn as a layer (the product and
 * coupon editors, the email composer, the plans page): one motion, the same
 * everywhere.
 *
 * So a layer comes up from the bottom edge over the page it was opened from,
 * which stays drawn underneath, still, where it was; Back or Cancel drops it
 * back down with the page it goes to already there under it. The way an iOS
 * sheet comes and goes, full height. It used to be a push from the right
 * edge.
 *
 * ON A PHONE ONLY. From 768px a `phoneOnly` layer is a page in the shell,
 * under the header and beside the rail, and it arrives on the stage's landing
 * (components/app/app-stage.tsx) like every page there. The plans page, a
 * layer at every width, also moves on a phone only, as it did.
 *
 * Both ways are a view transition: the layer is a picture of its own, named
 * `page-layer`, and moves on transform alone, on the compositor, from and to
 * translateY(100%) (the rules are in app/globals.css). The rest of the screen
 * does not move or fade. Coming in, a picture of the page under it holds;
 * going back, the page it goes to is live under it. So no frame is ever
 * without a page, and the /app header, which is part of the page, is always
 * under the layer, never over it.
 *
 * COMING IN: REACT'S OWN VIEW TRANSITION, AT THE COMMIT. The layer is wrapped
 * in a <ViewTransition> (in the React the app router runs) with an enter
 * and nothing for an update. When a navigation mounts it (a router push or
 * replace is a transition, and a Link is one), React takes the pictures at
 * the commit, when the new page is ready, not at the press. So while the
 * page is still on its way nothing is frozen: the page you pressed on stays
 * live and the control you pressed answers (THE PRESS, below) with a
 * spinner that keeps turning if the wait is long. React leaves out of the
 * transition whatever is not in a <ViewTransition>, and hides the picture of
 * it; the layer puts that picture back (keepPageUnder), since the page under
 * a rising layer is the whole point.
 *
 * GOING BACK: PLAYED BY THE LAYER, AT THE COMMIT, IN EVERY ENGINE. Most ways
 * back are router.back(), a popstate, which React renders with no view
 * transition, and the page it goes to may have to be fetched first. So
 * moveLayer("leave") starts the navigation and leaves the layer live until
 * the commit that takes it away; in that commit it is copied into a still
 * over the page that came, and the still drops (THE WAY BACK, PLAYED AT THE
 * COMMIT, below). While a way back is on its way, React is told the layer
 * has no exit of its own (`manual`), so the two never both move it. A link
 * out of a layer to another address is a push, and React drops the layer
 * itself in a view transition, where there are any.
 *
 * <html> carries data-layer-motion ("enter" or "leave") while a layer moves,
 * which is what the ::view-transition rules select on and what tells the
 * stage to play no landing of its own under the move. The durations and the
 * curve are set here and handed to the CSS as custom properties on <html>,
 * one number in one place.
 *
 * WHERE THERE ARE NO VIEW TRANSITIONS the layer rises by itself, the same
 * distance over the same time on the same curve, over a still copy of the
 * window that stands in for the photograph a transition would have taken
 * (BY HAND, below). Going back is played that way everywhere. WebKit had none before Safari 18, and on those
 * iPhones the editor used to appear and vanish in one frame.
 *
 * NO MOVE under reduced motion, from 768px, on the browser's own back (a
 * gesture on iOS draws its own), or when a layer stands in for itself at a
 * new address (holdLayerLanding) or for another layer in the same commit: the
 * new one is simply there.
 */
export const LAYER_MOTION_MS = 360
/** Going back down is a little quicker than coming up, as a sheet is. */
export const LAYER_LEAVE_MS = 280
/** The iOS sheet curve, the one the segmented control and the sheets use. */
export const LAYER_MOTION_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** Where the editor is a layer at all: the pill's breakpoint, the same 768px as `phoneOnly`. */
export const LAYER_PHONE = "(max-width: 767px)"
/** The view transition name the layer carries while it moves, and that the CSS animates. */
export const LAYER_NAME = "page-layer"

type ViewTransitionLike = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void }
type WithViewTransitions = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike
  __reactViewTransition?: ViewTransitionLike | null
}
type ViewTransitionProps = {
  children: React.ReactNode
  name?: string
  enter?: string
  exit?: string
  update?: string
  share?: string
  default?: string
}
/*
  React's <ViewTransition>. The app router runs Next's own build of React,
  which has it; a React without it (a test, an older build) draws the layer
  with no rise, as a browser without view transitions does.
*/
const ReactViewTransition = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition ?? null

/* ── Whether a layer moves here: a phone, motion allowed, no drop of our own running ── */
const REDUCED = "(prefers-reduced-motion: reduce)"
function layerMotionOn(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(LAYER_PHONE).matches && !window.matchMedia(REDUCED).matches
}
/**
 * Can the move be a view transition here? It needs the browser's own
 * `startViewTransition` (WebKit had none before Safari 18, which is most of
 * the iPhones the app is installed on) and React's <ViewTransition> for the
 * way in. Where either is missing the layer moves itself instead, over or
 * under a still copy of the window (BY HAND, below): the same distance, the
 * same times, the same curve.
 */
const canViewTransition = () =>
  typeof (document as WithViewTransitions).startViewTransition === "function" && !!ReactViewTransition
/* A way back of our own is running (moveLayer "leave"): React must not move the layer as well. */
let manual = false
const changes = new Set<() => void>()
function subscribeMotion(change: () => void) {
  changes.add(change)
  if (typeof window === "undefined" || !window.matchMedia) return () => changes.delete(change)
  const queries = [window.matchMedia(LAYER_PHONE), window.matchMedia(REDUCED)]
  for (const q of queries) q.addEventListener?.("change", change)
  return () => {
    changes.delete(change)
    for (const q of queries) q.removeEventListener?.("change", change)
  }
}
const reactMoves = () => layerMotionOn() && !manual
const serverMotion = () => false

/* ── The mark on <html> while a layer moves ─────────────────────────────── */
type Mark = "enter" | "leave" | "swap" | "stay"

function setMotionVars(html: HTMLElement) {
  html.style.setProperty("--layer-motion-ms", `${LAYER_MOTION_MS}ms`)
  html.style.setProperty("--layer-leave-ms", `${LAYER_LEAVE_MS}ms`)
  html.style.setProperty("--layer-motion-ease", LAYER_MOTION_EASE)
  /* Whether the moving layer keeps the nav pill over it (the CSS orders the two pictures by it). */
  html.toggleAttribute("data-layer-pill", !!document.querySelector('[data-page-layer="pill"]'))
}

/*
  THE PAGE UNDER A RISING LAYER. React takes a picture of the whole screen
  (root) before the commit like any view transition, but when nothing
  outside a <ViewTransition> is meant to animate it takes root out of the
  new state and hides the old picture (an opacity 0 on
  ::view-transition-group(root), from its own script). Under a layer that is
  the page it was opened from, which must stay: so once the transition is
  ready, and before its first frame, that one hiding is undone.
*/
function keepPageUnder(move: ViewTransitionLike) {
  move.ready.then(
    () => {
      for (const a of document.getAnimations()) {
        const effect = a.effect as KeyframeEffect | null
        if (effect?.pseudoElement !== "::view-transition-group(root)") continue
        if (effect.getKeyframes().some((k) => k.opacity !== undefined)) a.cancel()
      }
    },
    () => {},
  )
}

/*
  ===========================================================================
   THE MOVE STARTS WHEN ITS FRAMES DO
  ===========================================================================
  A move's clock starts the moment its pictures are ready, but its first
  frame reaches the screen only once the page it brings has been drawn for
  the first time (the editor, the composer, a list of fifty rows). On a
  slow phone that was 200ms: the clock ran on while nothing could be shown,
  so the first frame anyone saw was the layer already most of the way up,
  "so direct", and every frame before it counted as dropped. So the move is
  held at its first position until frames arrive a frame apart again, then
  let go: all of it is seen, from the edge, one frame after another. At most
  FRAMES_FLOW_CAP_MS is spent waiting, whatever happens.
*/
const FRAMES_FLOW_CAP_MS = 400
/** Two frames this close together: the screen is keeping up again. */
const FRAME_FLOWS_MS = 24

/**
 * `steady` is how many frames in a row have to arrive on time before the move
 * is let go. One is enough behind a view transition, where the page is a
 * picture and nothing of it can draw again. A move played by hand moves the
 * live page (BY HAND, below), whose own mount work is still landing: one quiet
 * frame there is often the gap between two pieces of it, and the move started
 * into the next one. Two in a row is the proof, for the price of a frame.
 */
export function startWhenFramesFlow(animations: Animation[], steady = 1) {
  if (typeof window === "undefined" || animations.length === 0) return
  /* Held by a rate of 0, not a pause: a held move still runs on the compositor, so what it moves is drawn during the wait and not in its first moving frame. */
  for (const a of animations) a.playbackRate = 0
  const began = performance.now()
  let last = -1
  let quiet = 0
  const tick = (t: number) => {
    quiet = last >= 0 && t - last < FRAME_FLOWS_MS ? quiet + 1 : 0
    if (quiet >= steady || performance.now() - began > FRAMES_FLOW_CAP_MS) {
      for (const a of animations) if (a.playbackRate === 0) a.playbackRate = 1
      return
    }
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** The layer's own move in a view transition that is ready: held until its frames flow (above). */
function layerMoveWhenDrawn(move: ViewTransitionLike) {
  move.ready.then(
    () => startWhenFramesFlow(document.getAnimations().filter((a) => /page-layer/.test((a.effect as KeyframeEffect | null)?.pseudoElement ?? ""))),
    () => {},
  )
}

/*
  What React leaves behind. Its opacity 0 on the root's group and its 0 by 0
  on ::view-transition are Web Animations that hold their last frame, on
  pseudo elements that exist only during a transition, and they are still
  there when the next one begins: the next view transition, ours, would
  start with its whole overlay 0 by 0. So they go when a transition ends,
  and before ours begins. Read from the document's list: once the pseudo
  elements are gone, <html>'s own list no longer shows them.
*/
function clearLeftovers() {
  for (const a of document.getAnimations()) {
    const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? ""
    if (pseudo.startsWith("::view-transition")) a.cancel()
  }
}

/*
  ===========================================================================
   WORK THAT WAITS FOR THE MOVE
  ===========================================================================
  The move itself is the compositor's, but a frame of it still needs the
  main thread to put the page's own changes on the screen, and a page that
  draws itself again half way up (an answer from the server landing, a list
  laid out) takes those frames: a slow phone dropped two or three of them in
  every move. So a page hands such work to afterLayerMove, which runs it at
  once when nothing moves and otherwise the moment the move has finished
  (at the latest AFTER_MOVE_CAP_MS later, whatever happens).
*/
const AFTER_MOVE_CAP_MS = 1500
const afterMove: Array<() => void> = []

/** Is a layer rising or dropping right now? */
export function layerMoving(): boolean {
  if (typeof document === "undefined") return false
  const m = document.documentElement.dataset.layerMotion
  return m === "enter" || m === "leave"
}

function runAfterMove() {
  for (const fn of afterMove.splice(0)) fn()
}

/** Runs `fn` now, or once the layer that is moving has arrived. Returns a cancel. */
export function afterLayerMove(fn: () => void): () => void {
  if (!layerMoving()) {
    fn()
    return () => {}
  }
  let live = true
  const run = () => {
    if (!live) return
    live = false
    window.clearTimeout(cap)
    fn()
  }
  const cap = window.setTimeout(run, AFTER_MOVE_CAP_MS)
  afterMove.push(run)
  return () => {
    live = false
    window.clearTimeout(cap)
  }
}

/*
  ===========================================================================
   BY HAND, WHERE THERE ARE NO VIEW TRANSITIONS
  ===========================================================================
  "Specifically on mobile devices, when I go to edit a product or add a new
  product, it needs to appear smooth, and when I click Back or Cancel it
  should go down very smooth and clean, not direct." Everything above is a
  view transition, and WebKit had none until Safari 18: on those iPhones, and
  in the native app's web view on them, the editor simply appeared and, on
  Cancel, was gone in one frame. Nothing rose, nothing dropped. That is the
  "direct" the owner means.

  So where the browser cannot do it, the layer does it itself, and the two
  moves are the same moves: translateY 100% to 0 coming in and back out
  again, LAYER_MOTION_MS and LAYER_LEAVE_MS, the iOS curve, held at the
  first position until the screen keeps up (startWhenFramesFlow), the same
  data-layer-motion mark on <html> so the stage plays no landing of its own
  underneath and afterLayerMove still waits for the move.

  WHAT A VIEW TRANSITION GAVE US FOR FREE WAS THE PAGE UNDER THE MOVE. A
  transition photographs the screen; by hand there is no photograph, and the
  page the router replaced is gone from the document. So a STILL is made
  instead: a copy of what is on the screen, laid over the window, inert and
  taking no presses, which is under a rising layer (the list you pressed on)
  and over a dropping one (the editor, copied as the way back starts and
  shown in the commit that puts the list under it, dropAtCommit). A copy is not a photograph, so three things are put back into
  it, because cloneNode does not carry them: what is typed in the fields (a
  clone carries the value attribute, not the value), where every scroller is
  standing, and no element ids, which must not exist twice in one document.

  A RISING LAYER'S STILL IS BUILT EARLY AND SHOWN LATE. It is cloned and laid
  out right after the press is painted, so none of that work lands in a frame
  of the move; but it stays `visibility: hidden` until the editor mounts.
  Until then the live list is what you are looking at, with the pressed row's
  spinner turning on it if the page is slow in coming. The still is uncovered
  in the same commit that takes the list away, before that frame is painted,
  so nothing is ever drawn twice and nothing is ever missing.

  THE KEYBOARD. A drop starts by blurring whatever had focus: a keyboard
  coming down resizes the visual viewport, and a move that runs through that
  resize fights it. Down first, then the move. Nothing here touches the
  document's own scroll, and the still is `position: fixed` with its overflow
  hidden, so it adds no height and traps nothing; the page underneath keeps
  the scroll the router gives it.

  Transform alone on one element each way (and, going down, a little
  opacity), promoted for the move (app/globals.css, [data-layer-still]). Nothing under reduced motion or
  from 768px: layerMotionOn decides that for both paths alike.
*/

/** A still never outlives this, whatever happens to the navigation it was taken for. */
const STILL_CAP_MS = 1200
/**
 * ...UNLESS THAT NAVIGATION IS PLAINLY STILL ON ITS WAY. A rising layer's
 * still is hidden until the editor mounts, and the rise is only played if it
 * is still wanted then. At 1200ms it used to be given up whatever the router
 * was doing, so an editor that took longer to come (a slow answer from the
 * server) was simply there when it came, in one frame: "then the page
 * appears with a delay, very abruptly". While the app's navigation record
 * (lib/ui/app-navigation) says the press is still underway, the wait is
 * renewed, up to this long in all; the record itself gives up at 10s.
 */
const STILL_WAIT_MAX_MS = 8000

/* The boxes a clone would start at the top of, named so the copy can be put back where the original stands. */
const STILL_SCROLLERS = "[data-page-layer-scroll],.page-scroll,.app-content-scroll,.orders-pane,.orders-list,.dashboard-scroll-container,.sales-scroll-container"

/*
  WHERE A STILL GOES, AND WHY NOT AT <body>. The shell's own wrapper is
  `position: fixed`, which makes it a stacking context of its own, and the
  layer's z-index lives inside it. A fixed box added at <body> is in the
  document's context instead, where the whole shell counts as one picture at
  z 0: 51 and 53 would then both land over the layer, whatever they say. So a
  still is put beside the page, inside that same context, where the numbers
  mean what they say against the layer's 52, the header's 50 and the pill's
  55. <body> only if the shell is not there at all.
*/
function stillHome(): HTMLElement {
  return document.querySelector<HTMLElement>(".app-content-scroll")?.parentElement ?? document.body
}

/** The empty still: fixed over the whole window, inert, taking no presses, painting nothing outside itself. */
function stillBox(over: boolean): HTMLElement {
  const box = document.createElement("div")
  box.dataset.layerStill = over ? "over" : "under"
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  /* Over a dropping layer, under a rising one; a layer without the pill moves over it, as its view transition does. */
  const z = over ? (document.querySelector('[data-page-layer="pill"]') ? 53 : 56) : 51
  box.style.cssText = `position:fixed;inset:0;z-index:${z};overflow:hidden;pointer-events:none;contain:layout paint style`
  return box
}

/*
  A STILL IS NOT BUILT IN THE PRESS'S OWN TASK. It is a clone, a layout and a
  first paint of a whole page, and while that ran the frame that shows the
  press had not been painted yet: the finger waited 200ms for the control to
  dim, where the transition path answers in under 20. So the press is answered,
  that frame is painted, and the still and the navigation follow on the next
  one. One frame later to start, and every frame of the move is then the
  compositor's alone.
*/
function afterNextPaint(run: () => void) {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return run()
  /* The frame callback runs BEFORE the paint; the task it queues runs after it. */
  window.requestAnimationFrame(() => window.setTimeout(run, 0))
}

/**
 * The part of a clone a clone does not carry: what is typed, where things are
 * scrolled to. Walked by the same query on both trees, which are the same
 * tree, so the two lists line up.
 */
function copyLiveState(from: HTMLElement, to: HTMLElement) {
  const pair = <T extends HTMLElement>(selector: string, put: (a: T, b: T) => void) => {
    const a = from.querySelectorAll<T>(selector)
    const b = to.querySelectorAll<T>(selector)
    for (let i = 0; i < a.length && i < b.length; i++) put(a[i], b[i])
  }
  if (from.scrollTop) to.scrollTop = from.scrollTop
  pair<HTMLElement>(STILL_SCROLLERS, (a, b) => {
    if (a.scrollTop) b.scrollTop = a.scrollTop
    if (a.scrollLeft) b.scrollLeft = a.scrollLeft
  })
  pair<HTMLInputElement>("input", (a, b) => {
    b.value = a.value
    b.checked = a.checked
  })
  pair<HTMLTextAreaElement>("textarea", (a, b) => {
    b.value = a.value
  })
  pair<HTMLSelectElement>("select", (a, b) => {
    b.value = a.value
  })
}

/** A copy of `el` for the still: no ids, no second nav pill, nothing this file's own queries can find. */
function copyFor(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement
  copy.removeAttribute("id")
  copy.removeAttribute("data-shell-chrome")
  for (const node of Array.from(copy.querySelectorAll("[id]"))) node.removeAttribute("id")
  /* A copy is never a layer: this file, and the stage, find layers by this attribute (the page a still copies can be one, an editor opened from another). */
  for (const node of [copy, ...Array.from(copy.querySelectorAll<HTMLElement>("[data-page-layer]"))]) {
    node.removeAttribute("data-page-layer")
    node.removeAttribute("data-page-layer-phone")
  }
  /* The pill is fixed over everything and stays live where it is; a copy of it would ride the move. */
  for (const node of Array.from(copy.querySelectorAll("[data-app-nav-pill]"))) node.remove()
  return copy
}

/** The layer as it stands, to drop over the page the router has just brought. */
function layerStill(layer: HTMLElement): HTMLElement {
  const box = stillBox(true)
  const copy = copyFor(layer)
  copy.style.position = "absolute"
  copy.style.inset = "0"
  copy.style.margin = "0"
  box.append(copy)
  stillHome().append(box)
  copyLiveState(layer, copy)
  return box
}

/** The screen as it stands, to hold under a layer about to rise over it. */
function pageStill(): HTMLElement | null {
  const shows = (el: HTMLElement) => {
    const cs = getComputedStyle(el)
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const parts = [
    ...Array.from(document.querySelectorAll<HTMLElement>("[data-shell-chrome]")),
    ...Array.from(document.querySelectorAll<HTMLElement>(".app-content-scroll")),
  ].filter(shows)
  if (parts.length === 0) return null
  const box = stillBox(false)
  /* Laid out now, shown only when the page it copies goes (riseByHand). */
  box.style.visibility = "hidden"
  const pairs: Array<[HTMLElement, HTMLElement]> = []
  for (const el of parts) {
    const r = el.getBoundingClientRect()
    const copy = copyFor(el)
    copy.style.cssText += `;position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0`
    box.append(copy)
    pairs.push([el, copy])
  }
  stillHome().append(box)
  for (const [a, b] of pairs) copyLiveState(a, b)
  return box
}

/** A move of our own, on one element, held until the screen keeps up. Going down it fades a little (LAYER_LEAVE_FADE). */
function moveByHand(el: HTMLElement, up: boolean, ms: number) {
  const a = el.animate(
    up
      ? [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }]
      : [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(100%)", opacity: LAYER_LEAVE_FADE }],
    { duration: ms, easing: LAYER_MOTION_EASE, fill: up ? "backwards" : "forwards" },
  )
  startWhenFramesFlow([a], 2)
  return a
}

/* The rise a press asked for, waiting for the layer it opens to mount. */
let rising: { still: HTMLElement | null; cap: number } | null = null
/* A drop of our own is running (dropAtCommit): a second press must not start another. */
let dropping = false

function endRise(want: { still: HTMLElement | null; cap: number }) {
  window.clearTimeout(want.cap)
  want.still?.remove()
  if (rising === want) rising = null
  const html = document.documentElement
  /* Only our own mark: a React transition may have taken over this commit and set "enter" for itself. */
  if (html.dataset.layerHand !== undefined && html.dataset.layerMotion === "enter") {
    delete html.dataset.layerMotion
    delete html.dataset.layerHand
  }
  runAfterMove()
}

/**
 * A press that opens a layer, on an engine that cannot make a view
 * transition of it: the screen is held as a still and the layer rises over
 * it when it mounts (riseByHand, from the layer's own layout effect).
 */
function raiseByHand(navigate: () => void) {
  const html = document.documentElement
  if (rising || html.dataset.layerMotion) {
    navigate()
    return
  }
  const want: { still: HTMLElement | null; cap: number } = { still: null, cap: 0 }
  rising = want
  const pressedAt = Date.now()
  const hold = () => {
    if (rising !== want) return
    /* Still coming: wait on, so it rises when it lands rather than appearing in one frame. */
    if (getAppNavigation() !== null && Date.now() - pressedAt + STILL_CAP_MS <= STILL_WAIT_MAX_MS) {
      want.cap = window.setTimeout(hold, STILL_CAP_MS)
      return
    }
    endRise(want)
  }
  want.cap = window.setTimeout(hold, STILL_CAP_MS)
  afterNextPaint(() => {
    /* Already mounted, or given up on, in the frame we waited: nothing to hold. */
    if (rising !== want) return
    /*
      The mark goes on <html> here and not in the press's task either: every
      `html[data-layer-motion] ...` rule restyles the document when it lands,
      and one of them lays out every row the list had skipped off screen.
    */
    html.dataset.layerMotion = "enter"
    html.dataset.layerHand = ""
    setMotionVars(html)
    want.still = pageStill()
    navigate()
  })
}

/** Called from the layer's layout effect when React is not moving it: the rise, if a press asked for one. */
function riseByHand(layer: HTMLElement | null) {
  const want = rising
  if (!want) return
  rising = null
  const html = document.documentElement
  if (!layer || !layerMotionOn() || html.dataset.layerMotion !== "enter") {
    endRise(want)
    return
  }
  /* The list has gone in this commit; its copy takes its place before the frame is painted. */
  if (want.still) want.still.style.visibility = ""
  const move = moveByHand(layer, true, LAYER_MOTION_MS)
  const done = () => endRise(want)
  move.finished.then(done, done)
}

/**
 * Called from the layer's layout effect, inside React's transition: marks what
 * this commit does. True when React is moving the layer for it, so the layer
 * knows not to move itself as well (riseByHand).
 */
function markReactMotion(kind: "enter" | "leave"): boolean {
  const html = document.documentElement
  const move = (document as WithViewTransitions).__reactViewTransition
  /* Only inside a transition React is running for this commit, with the layer moving; a commit with none (a popstate, reduced motion, a wide window, our own way back) marks nothing here. */
  if (!move || !reactMoves()) return false
  const now = html.dataset.layerMotion as Mark | undefined
  /* Standing in for itself (holdLayerLanding), or already one layer for another in this commit. */
  if (now === "stay" || now === "swap") return true
  /* The one going in this same commit: one layer in place of another, which moves nothing. */
  const next: Mark = kind === "enter" && now === "leave" ? "swap" : kind
  html.dataset.layerMotion = next
  setMotionVars(html)
  if (next === "enter") keepPageUnder(move)
  if (next === "enter" || next === "leave") layerMoveWhenDrawn(move)
  const clear = () => {
    clearLeftovers()
    if (html.dataset.layerMotion === next) delete html.dataset.layerMotion
    runAfterMove()
  }
  move.finished.then(clear, clear)
  return true
}

/*
  ===========================================================================
   THE WAY BACK, PLAYED AT THE COMMIT
  ===========================================================================
  "When I'm in the edit product page or add new product page and I click
  Cancel to close that page, it's not closing smoothly, going down, on
  mobile version; it's abrupt, direct."

  The way back used to be two moves. With view transitions it took its
  picture at the press and waited up to 450ms for the page under it, and
  when a popstate brought no page at once (the list had to be fetched again:
  after a save, whose refresh drops every page the router kept, or on a slow
  line) it let the picture go on the next task, so the editor stayed and
  then the list simply replaced it. Without them (WebKit before Safari 18)
  a still of the editor dropped at once, whatever the router was doing: over
  the live editor, which then stood there again until the list came and
  took it away in one frame. Both are the "direct" above, and both were
  only smooth when the list was already in the router.

  So there is one way back now, the same in every engine, and it does not
  guess how long the router takes. The press is answered (the button dims,
  and turns into a spinner if the list is slow); React is told the layer has
  no exit of its own (`manual`); the navigation starts. The editor stays
  live on the screen, taking no second press, for as long as the list takes,
  with a still copy of it built and laid out, hidden, over it. Then, in the
  commit that takes the layer away and puts the list in its place (the
  layer's layout effect cleanup, before that frame is painted), the still is
  uncovered where the layer was, over the list, and drops to the bottom
  edge over LAYER_LEAVE_MS on the iOS curve, fading a little as it goes. So the first frame after the commit is the
  editor where it was, with the list already under it, and the list is
  under every frame after that: no frame without a page, no frame of the
  editor gone before it has moved.

  Nothing under reduced motion or from 768px (layerMotionOn), on the
  browser's own back (a gesture on iOS draws its own), or when the press
  never becomes a navigation (the wait ends after LAYER_PRESS_KEPT_MS).
*/
/** How far the dropping layer fades: a little, so it reads as going away, never as a crossfade. */
export const LAYER_LEAVE_FADE = 0.85

/* A way back that has started and whose commit has not come yet. */
let dropWant: { cap: number; still: HTMLElement | null } | null = null

/** React draws the layer's own exit again, after a way back of ours. */
function endManual() {
  manual = false
  for (const change of changes) change()
}

function dropLayer(navigate: () => void) {
  const doc = document as WithViewTransitions
  /* Not while one is on its way or running already (ours, or React's), and only with a layer on the screen to drop. */
  if (dropWant || dropping || manual || doc.__reactViewTransition || !layerMotionOn() || !document.querySelector("[data-page-layer]")) {
    navigate()
    return
  }
  /* The keyboard comes down before the move, not through it. */
  const focused = document.activeElement
  if (focused instanceof HTMLElement && focused !== document.body) focused.blur()
  /* React is told first, and draws it before anything else: this layer has no exit of its own now. */
  manual = true
  flushSync(() => {
    for (const change of changes) change()
  })
  const want: { cap: number; still: HTMLElement | null } = { cap: 0, still: null }
  dropWant = want
  /* A press that never became a navigation: the layer is React's again. */
  want.cap = window.setTimeout(() => {
    if (dropWant !== want) return
    dropWant = null
    want.still?.remove()
    endManual()
  }, LAYER_PRESS_KEPT_MS)
  /*
    The press's own frame is painted first. Then, on the next one, the still
    is built and laid out, hidden, while the live layer stays in front, and
    the navigation starts: a copy, a style pass and a layout of a whole
    editor, which inside the commit that brings the list would have been
    that much longer before the first frame of the drop. The commit only
    uncovers it (dropAtCommit).
  */
  afterNextPaint(() => {
    if (dropWant === want) {
      const layer = document.querySelector<HTMLElement>("[data-page-layer]")
      want.still = layer ? layerStill(layer) : null
      if (want.still) want.still.style.visibility = "hidden"
    }
    navigate()
  })
}

/**
 * Called from the layer's layout effect cleanup, in the commit that takes it
 * away: the drop a press asked for, from the still of the layer, shown over
 * the page that commit brings before that frame is painted. False when no
 * drop was asked for.
 */
function dropAtCommit(): boolean {
  const want = dropWant
  if (!want) return false
  dropWant = null
  window.clearTimeout(want.cap)
  const html = document.documentElement
  const still = want.still
  if (!still || !still.isConnected || !layerMotionOn()) {
    still?.remove()
    endManual()
    return true
  }
  dropping = true
  /* The page under it holds still, fully drawn: the stage reads this in the same commit and plays no landing of its own. */
  html.dataset.layerMotion = "leave"
  html.dataset.layerHand = ""
  setMotionVars(html)
  /* The layer has gone in this commit; its copy takes its place before the frame is painted. */
  still.style.visibility = ""
  let over = false
  const done = () => {
    if (over) return
    over = true
    dropping = false
    window.clearTimeout(cap)
    still.remove()
    if (html.dataset.layerHand !== undefined && html.dataset.layerMotion === "leave") {
      delete html.dataset.layerMotion
      delete html.dataset.layerHand
    }
    endManual()
    runAfterMove()
  }
  const cap = window.setTimeout(done, LAYER_LEAVE_MS + STILL_CAP_MS)
  const move = moveByHand(still, false, LAYER_LEAVE_MS)
  move.finished.then(done, done)
  return true
}

/**
 * ===========================================================================
 *  THE PRESS
 * ===========================================================================
 * "When I click the back icon, there's no feedback of loading." A press that
 * opens or leaves a layer answers on the next frame, whatever the page
 * behind it is doing: what was pressed dims, the way an iOS bar button does
 * under a finger. If the page it goes to is not there LAYER_PRESS_WAIT_MS
 * later, a small spinner (the app's own, components/ui/activity-spinner)
 * takes the place of what the control shows, and turns until the move
 * begins. Most presses land well inside that, and show only the dim.
 *
 * Which presses: every moveLayer call (the element under the last pointer
 * press, unless the caller shows its own answer), and, inside any layer,
 * every link to another address and every control marked data-layer-back.
 * A link whose click the page kept for itself (its default prevented and no
 * navigation started) is let go at once.
 *
 * It ends when the layer mounts or unmounts (the commit the press was for),
 * for a link when the address it went to is the one showing (a link from
 * one product to another keeps the same layer up), when the page is shown
 * again from the back cache, or after LAYER_PRESS_KEPT_MS whatever happens:
 * it never outlives a navigation that went nowhere by more than that.
 *
 * Written on the element's attributes, never through React: the control
 * belongs to whatever page drew it, and the answer must not wait on that
 * page drawing again.
 */
export const LAYER_PRESS_WAIT_MS = 100
export const LAYER_PRESS_KEPT_MS = 8000
const PRESS_RECENT_MS = 800
const PRESSABLE = "a[href],button,[role=button],[data-layer-back]"

let lastPress: { el: HTMLElement; at: number } | null = null
const held = new Map<HTMLElement, () => void>()

/* The spinner, drawn as components/ui/activity-spinner.tsx draws it (eight spokes, the leading one darkest). */
function spinnerNode(size: number): HTMLElement {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const opacity = (1 - ((8 - i) % 8) * ((1 - 0.28) / 7)).toFixed(3)
    return `<rect x="9.05" y="1.4" width="1.9" height="5.4" rx="0.95" fill="currentColor" opacity="${opacity}" transform="rotate(${45 * i} 10 10)"/>`
  }).join("")
  const wrap = document.createElement("span")
  wrap.dataset.layerPressSpinner = ""
  wrap.setAttribute("role", "status")
  wrap.setAttribute("aria-label", "Loading")
  wrap.innerHTML = `<span class="activity-spinner" data-keep-transform="" aria-hidden="true" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 20 20" class="block">${spokes}</svg></span>`
  return wrap
}

/* An element that answers its own press (the product editor's Cancel, the plans page's Back): left to it. */
function answersItself(el: HTMLElement) {
  return el.hasAttribute("data-answers-press") || el.getAttribute("aria-busy") === "true" || el.hasAttribute("data-leaving") || !!el.querySelector("[data-activity-spinner]")
}

/**
 * Answers a press on `el`: dimmed now, a spinner in its place after
 * LAYER_PRESS_WAIT_MS if nothing has landed by then. `until` is the address
 * whose arrival also ends it (a link's). Safe to call twice.
 */
export function holdPress(pressed: Element | null | undefined, until: string | null = null) {
  /* A list row's link answers as its row: the row takes the pressed grey. */
  const el = pressed instanceof HTMLElement && pressed.matches("[data-row-link]") ? (pressed.closest<HTMLElement>("[data-row]") ?? pressed) : pressed
  if (typeof window === "undefined" || !(el instanceof HTMLElement) || !el.isConnected || held.has(el)) return
  if (answersItself(el)) return
  const row = el.matches("tr,li,[data-row]")
  el.dataset.layerPress = row ? "row" : ""
  let spinner: HTMLElement | null = null
  let positioned = false
  const wait = window.setTimeout(() => {
    if (!held.has(el) || !el.isConnected) return
    /* It drew an answer of its own in the meantime: that one is enough. */
    if (answersItself(el)) return release()
    if (getComputedStyle(el).position === "static") {
      el.style.position = "relative"
      positioned = true
    }
    const box = el.getBoundingClientRect()
    spinner = spinnerNode(Math.max(14, Math.min(18, Math.round(box.height * 0.45))))
    el.dataset.layerPress = row ? "row-wait" : "wait"
    el.setAttribute("aria-busy", "true")
    el.append(spinner)
  }, LAYER_PRESS_WAIT_MS)
  /*
    THE CAP IS NOT A CLOCK OF ITS OWN. "Sometimes it ends, and then I have to
    wait another 10 seconds to load the page." A press whose page was still
    being fetched had its answer taken away at LAYER_PRESS_KEPT_MS and the
    page then arrived seconds later, which reads as a press refused and a
    screen that changes by itself. So the cap looks again each time it comes
    round, and only lets go once the shell has no navigation underway.
  */
  let cap = window.setTimeout(function again() {
    if (getAppNavigation()) {
      cap = window.setTimeout(again, LAYER_PRESS_KEPT_MS)
      return
    }
    release()
  }, LAYER_PRESS_KEPT_MS)
  /* A link's address is written when the router commits it: a tenth of a second is soon enough to notice. */
  const landed = until
    ? window.setInterval(() => {
        if (window.location.pathname + window.location.search === until) release()
      }, 100)
    : 0
  const release = () => {
    if (held.get(el) !== release) return
    held.delete(el)
    window.clearTimeout(wait)
    window.clearTimeout(cap)
    window.clearInterval(landed)
    delete el.dataset.layerPress
    if (spinner) {
      spinner.remove()
      el.removeAttribute("aria-busy")
    }
    if (positioned) el.style.position = ""
  }
  held.set(el, release)
}

/** Every press still waiting ends: the commit it was waiting for has come, or will not. */
export function releasePresses() {
  for (const release of [...held.values()]) release()
}

/** The control under the last pointer press, if it was a moment ago and is not in a sheet or a dialog that has since closed. */
function recentPress(): HTMLElement | null {
  if (!lastPress || performance.now() - lastPress.at > PRESS_RECENT_MS) return null
  const el = lastPress.el
  if (!el.isConnected || el.closest("[role=dialog],[role=alertdialog],[data-app-sheet]")) return null
  return el
}

let listening = false
function listen() {
  if (listening || typeof window === "undefined") return
  listening = true
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null
      lastPress = el ? { el, at: performance.now() } : null
    },
    true,
  )
  /*
    A LINK OR A BACK INSIDE A LAYER. Read after the page's own handlers (the
    window's bubble phase comes last), so a control that answers itself has
    already said so, and a click the page kept for itself is known.
  */
  let startsAtClick: number | null = null
  window.addEventListener("click", () => { startsAtClick = routerStartCount() }, true)
  window.addEventListener("click", (e) => {
    const target = e.target as Element | null
    const el = target?.closest?.("a[href],[data-layer-back]") as HTMLElement | null
    if (!el || !el.closest("[data-page-layer]")) return
    if ((e.button ?? 0) !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    let until: string | null = null
    if (el instanceof HTMLAnchorElement) {
      if (el.hasAttribute("download") || (el.target && el.target !== "_self")) return
      try {
        const url = new URL(el.href)
        if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
        until = url.pathname + url.search
      } catch {
        return
      }
      /* Kept by the page: prevented, and the router started nothing. A Link prevents its default too, but the router has counted it. */
      if (e.defaultPrevented) {
        const now = routerStartCount()
        if (now === null || now === startsAtClick) return
      }
    }
    holdPress(el, until)
  })
  window.addEventListener("pageshow", releasePresses)
}
if (typeof window !== "undefined") listen()

/**
 * A navigation to or from a layer, with its press answered first.
 * "enter": `navigate` runs at once, in the same task, and React raises the
 * layer at the commit (see above), or, where there are no view transitions,
 * the layer raises itself over a still of the page (raiseByHand). "leave":
 * `navigate` runs on the frame after the press, the layer stays live until
 * the commit that takes it away, and a still of it drops from there over the
 * page that commit brought (dropAtCommit), in every engine. `press` is the control
 * to answer: by default the one under the last pointer press; `false` when
 * the caller draws its own answer (the products list's row, the product
 * editor's Cancel).
 */
export function moveLayer(motion: "enter" | "leave", navigate: () => void, press?: Element | null | false) {
  if (press !== false) holdPress(press ?? recentPress())
  if (motion === "leave") dropLayer(navigate)
  else if (layerMotionOn() && !canViewTransition()) raiseByHand(navigate)
  else navigate()
}

/**
 * THE SAME PAGE AT A NEW ADDRESS. A new product's first save opens it at
 * its own address, where the router draws a new layer with the same product
 * in it. That is not a new page to land: the stage would fade the editor in
 * from nothing, a blink right after Save, and the layer would rise again. So
 * the address change and the new layer are marked as a layer standing in for
 * itself (data-layer-motion "stay"), which the stage lands without its
 * entrance and the view transition moves nothing for, and the mark goes the
 * frame after the new layer mounts, or after 8s if it never does.
 */
export function holdLayerLanding() {
  const html = document.documentElement
  if (html.dataset.layerMotion) return
  html.dataset.layerMotion = "stay"
  window.setTimeout(() => {
    if (html.dataset.layerMotion === "stay") delete html.dataset.layerMotion
  }, 8000)
}

/**
 * ===========================================================================
 *  A PAGE DRAWN OVER THE WHOLE SHELL
 * ===========================================================================
 * The plans page and the product editor are pages of their own: no dark
 * header over them, no avatar, no bell. They are still routes under /app, so
 * the session checks, the router and the landing are the same as everywhere
 * else, but what they draw is a layer over the whole window.
 *
 * WHY THE HEADER STILL SHOWED ON AN IPHONE. The layer is rendered inside the
 * shell's scroller, `.app-content-scroll`, which carries
 * `-webkit-overflow-scrolling: touch`. On iOS that property no longer changes
 * how anything scrolls, but WebKit still makes the element a stacking
 * context for it. A fixed layer at z 60 inside it is then at layer 0 as far
 * as the header (z 50, outside it) is concerned: the header painted over the
 * layer's own bar, and the Back row sat underneath it. Chrome and Android
 * have no such rule, which is why a desktop probe passed.
 *
 * So three things hold while a layer is up, in app/globals.css:
 *
 *   the scroller stops being a stacking context on iOS (the property goes
 *   back to `auto`), so the layer's z-index means what it says;
 *
 *   the shell's header and rail are not painted at all, so even an engine
 *   with some other reason to trap the layer has nothing of them to show;
 *
 *   the black strip the native app paints under the status bar stands down,
 *   and this layer paints that strip itself, in its own colour, by padding
 *   its top by env(safe-area-inset-top). A browser has no inset and the
 *   padding is 0.
 *
 * The html class is the same statement as `:has([data-page-layer])`, for an
 * engine without `:has()`: either alone is enough.
 *
 * `pill` keeps the phone's nav pill over the page (the product editor, where
 * the owner asked for it). The layer sits between the header (50) and the
 * pill (55); a page without it hides the pill instead (the plans page), and
 * every sheet and dialog (60 and up) is over both.
 *
 * The page inside scrolls in `[data-page-layer-scroll]`, or in a scroller of
 * its own that fills it (the editor's `.page-scroll`). The room the pill
 * needs at the foot goes on whichever one moves, in app/globals.css.
 *
 * ONLY ON A PHONE (`phoneOnly`, the product editor). "On desktop large
 * screen the edit product page should be with the sidebar, with the header up
 * there. Not how it is on mobile." Below md it is the layer described above;
 * from md it is an ordinary page in the shell's content area, under the
 * header and beside the rail, filling it the way every page that scrolls
 * itself does, and the page's own bar sticks to the top of that area. Decided
 * by the stylesheet alone (768px, the pill's breakpoint), so the server draws
 * the same thing for both, and a window dragged across the breakpoint keeps
 * the same boxes and the same scroll: only where they sit changes. What the
 * layer does to the shell (the chrome, the shield, the strip under the status
 * bar) is then under a media query too, keyed on [data-page-layer-phone] and
 * the html class `has-phone-page-layer`.
 */
export function PageLayer({
  children,
  pill = false,
  inset = "page",
  phoneOnly = false,
  className,
}: {
  children: React.ReactNode
  /** Keep the phone's nav pill over this page. */
  pill?: boolean
  /**
   * Who clears the status bar. "page" and "white": the layer pads its top by
   * the inset and paints that strip in the page's colour or in white. "bar":
   * the page's own sticky bar pads itself (the product editor's does, inside
   * any [data-page-layer] below md), so the layer adds nothing and the bar's
   * colour runs up under the clock as the page scrolls beneath it.
   */
  inset?: "page" | "white" | "bar"
  /** A layer below md only; from md an ordinary page inside the shell. */
  phoneOnly?: boolean
  className?: string
}) {
  /* Whether this layer rises and drops: read on the client only, so the server's HTML is the same for every width. */
  const moves = useSyncExternalStore(subscribeMotion, reactMoves, serverMotion)
  /* The box itself, for a rise this file plays on it (riseByHand, where there are no view transitions). */
  const box = React.useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const html = document.documentElement
    const name = phoneOnly ? "has-phone-page-layer" : "has-page-layer"
    html.classList.add(name)
    /* The commit a press was waiting for: this layer is on the screen. */
    releasePresses()
    /* React's move at this commit, or, where it cannot make one, ours on this box. */
    if (!markReactMotion("enter")) riseByHand(box.current)
    /* A layer standing in for the one before it (holdLayerLanding): from the next frame the stage lands pages again. */
    if (html.dataset.layerMotion === "stay") {
      requestAnimationFrame(() => {
        if (html.dataset.layerMotion === "stay") delete html.dataset.layerMotion
      })
    }
    return () => {
      html.classList.remove(name)
      /* ...or it has gone, and the page under it is in the same commit: a way back of our own drops a still of it now, before this frame is painted. */
      releasePresses()
      if (!dropAtCommit()) markReactMotion("leave")
    }
  }, [phoneOnly])

  const layer = (
    <div
      ref={box}
      data-page-layer={pill ? "pill" : ""}
      data-page-layer-phone={phoneOnly ? "" : undefined}
      className={cn(
        phoneOnly
          ? "flex h-full flex-col bg-[#f8f9fa] max-md:fixed max-md:inset-0 max-md:z-[52] max-md:h-auto"
          : "fixed inset-0 z-[52] flex flex-col bg-[#f8f9fa]",
        inset !== "bar" && (phoneOnly ? "max-md:pt-[env(safe-area-inset-top,0px)]" : "pt-[env(safe-area-inset-top,0px)]"),
        inset === "white" && "bg-white",
        className,
      )}
    >
      {/* The class the layout effect above sets, set by the server's HTML too, so it holds from the first paint (components/platform/html-class.tsx). */}
      <HtmlClassScript name={phoneOnly ? "has-phone-page-layer" : "has-page-layer"} />
      {/*
        WHAT A PULL PAST THE TOP SHOWS. On iOS (Safari and the app alike) a
        scroller that is pulled past its top moves its content down and shows
        its own background in the gap, and `overscroll-behavior: contain`
        does not stop that, it only keeps the pull from reaching the page.
        That background was the page grey, so the plans page, whose bar and
        status strip are white, opened a grey band between them on every
        pull: "when I swipe, it lets me see the gray background at the top".

        A white-topped layer paints the scroller's own background in two
        flat halves, white above and page grey below. The page inside is
        opaque and covers all of it, so the halves are only ever seen in a
        pull: white past the top, under the white bar, and grey past the
        bottom, under the grey page. A hard stop, not a blend.
      */}
      <div
        data-page-layer-scroll=""
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#f8f9fa]",
          inset === "white" && "bg-[linear-gradient(#ffffff_50%,#f8f9fa_50%)]",
        )}
      >
        {children}
      </div>
    </div>
  )

  if (!ReactViewTransition) return layer
  /*
    One boundary, named, with a class only for the two moves: an update
    inside the layer (a save, a refresh) moves nothing, and one layer in
    place of another in a commit (share) moves nothing either. No exit while
    a way back of our own is running (`manual`, dropLayer).
  */
  return (
    <ReactViewTransition
      name={LAYER_NAME}
      enter={moves ? "layer-rise" : "none"}
      exit={moves ? "layer-drop" : "none"}
      update="none"
      share="none"
      default="none"
    >
      {layer}
    </ReactViewTransition>
  )
}
