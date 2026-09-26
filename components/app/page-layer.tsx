"use client"

import * as React from "react"
import { useLayoutEffect, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { cn } from "@/lib/utils"
import { HtmlClassScript } from "@/components/platform/html-class"
import { routerStartCount } from "@/lib/ui/router-starts"

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
 * GOING BACK: A VIEW TRANSITION OF ITS OWN, AROUND THE NAVIGATION. Most ways
 * back are router.back(), a popstate, and React renders a popstate at once,
 * with no view transition, so it cannot be React's. moveLayer("leave")
 * starts one itself: the picture of the layer is taken as it is on the
 * screen, the navigation runs inside the transition, and the transition
 * waits for this file's own signal that the commit happened (the layer
 * unmounting, in a layout effect, before that frame is painted), at most
 * LAYER_WAIT_MS. The page a layer goes back to is almost always the one it
 * was opened from, which the router still holds, so the commit is a frame or
 * two away; past the wait the move is skipped and the page lands on its own.
 * While it runs, React is told the layer has no exit of its own (`manual`),
 * so the two never both move it. A link out of a layer to another address
 * is a push, and React drops the layer itself, the same way.
 *
 * <html> carries data-layer-motion ("enter" or "leave") while a layer moves,
 * which is what the ::view-transition rules select on and what tells the
 * stage to play no landing of its own under the move. The durations and the
 * curve are set here and handed to the CSS as custom properties on <html>,
 * one number in one place.
 *
 * NO MOVE under reduced motion, from 768px, in a browser with no view
 * transitions (the page swaps), on the browser's own back (a gesture on iOS
 * draws its own), or when a layer stands in for itself at a new address
 * (holdLayerLanding) or for another layer in the same commit: the new one is
 * simply there.
 */
export const LAYER_MOTION_MS = 360
/** Going back down is a little quicker than coming up, as a sheet is. */
export const LAYER_LEAVE_MS = 300
/** The iOS sheet curve, the one the segmented control and the sheets use. */
export const LAYER_MOTION_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** The longest the way back holds its picture for the page under it to commit. */
export const LAYER_WAIT_MS = 450
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

export function startWhenFramesFlow(animations: Animation[]) {
  if (typeof window === "undefined" || animations.length === 0) return
  /* Held by a rate of 0, not a pause: a held move still runs on the compositor, so what it moves is drawn during the wait and not in its first moving frame. */
  for (const a of animations) a.playbackRate = 0
  const began = performance.now()
  let last = -1
  const tick = (t: number) => {
    if ((last >= 0 && t - last < FRAME_FLOWS_MS) || performance.now() - began > FRAMES_FLOW_CAP_MS) {
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

/** Called from the layer's layout effect, inside React's transition: marks what this commit does. */
function markReactMotion(kind: "enter" | "leave") {
  const html = document.documentElement
  const move = (document as WithViewTransitions).__reactViewTransition
  /* Only inside a transition React is running for this commit, with the layer moving; a commit with none (a popstate, reduced motion, a wide window, our own way back) marks nothing here. */
  if (!move || !reactMoves()) return
  const now = html.dataset.layerMotion as Mark | undefined
  /* Standing in for itself (holdLayerLanding), or already one layer for another in this commit. */
  if (now === "stay" || now === "swap") return
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
}

/* The way back of our own: resolved by the layer unmounting. */
let leaving: (() => void) | null = null
let leaves = 0

function dropLayer(navigate: () => void) {
  const doc = document as WithViewTransitions
  const html = document.documentElement
  /* Not while one is running already (ours, or React's), and only with a layer on the screen to drop. */
  if (leaving || manual || doc.__reactViewTransition || !layerMotionOn() || typeof doc.startViewTransition !== "function" || !document.querySelector("[data-page-layer]")) {
    navigate()
    return
  }
  clearLeftovers()
  const id = ++leaves
  /* React is told first, and draws it before anything else: this layer has no exit of its own now. */
  manual = true
  flushSync(() => {
    for (const change of changes) change()
  })
  let landed!: () => void
  const commit = new Promise<void>((resolve) => {
    landed = resolve
  })
  leaving = () => {
    leaving = null
    landed()
  }
  html.dataset.layerMotion = "leave"
  setMotionVars(html)
  const done = () => {
    if (leaves !== id) return
    leaving = null
    manual = false
    for (const change of changes) change()
    if (html.dataset.layerMotion === "leave") delete html.dataset.layerMotion
    runAfterMove()
  }
  let move: ViewTransitionLike
  try {
    move = doc.startViewTransition(() => {
      return new Promise<void>((resolve) => {
        let settled = false
        const giveBack = () => {
          /* Not here yet: give the screen back, live, with the press's spinner turning, and let the page land on its own. */
          if (settled) return
          settled = true
          window.clearTimeout(late)
          window.removeEventListener("popstate", onPop)
          leaving = null
          move.skipTransition()
          resolve()
        }
        const late = window.setTimeout(giveBack, LAYER_WAIT_MS)
        /*
          A way back that is a popstate is drawn by React at once, in the
          same task, when the router has the page; when it has to fetch it,
          nothing is drawn. So by the task after the popstate the answer is
          known, and a page still on its way does not hold the picture.
        */
        const onPop = () => window.setTimeout(giveBack, 0)
        window.addEventListener("popstate", onPop, { once: true })
        void commit.then(() => {
          if (settled) return
          settled = true
          window.clearTimeout(late)
          window.removeEventListener("popstate", onPop)
          resolve()
        })
        navigate()
      })
    })
  } catch {
    done()
    navigate()
    return
  }
  /* A skipped move rejects `ready`; that is an outcome, not an error. */
  move.ready.catch(() => {})
  layerMoveWhenDrawn(move)
  move.finished.then(done, done)
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
  const cap = window.setTimeout(() => release(), LAYER_PRESS_KEPT_MS)
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
 * layer at the commit (see above). "leave": the layer drops inside a view
 * transition of its own, with `navigate` run in it. `press` is the control
 * to answer: by default the one under the last pointer press; `false` when
 * the caller draws its own answer (the products list's row, the product
 * editor's Cancel).
 */
export function moveLayer(motion: "enter" | "leave", navigate: () => void, press?: Element | null | false) {
  if (press !== false) holdPress(press ?? recentPress())
  if (motion === "leave") dropLayer(navigate)
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

  useLayoutEffect(() => {
    const html = document.documentElement
    const name = phoneOnly ? "has-phone-page-layer" : "has-page-layer"
    html.classList.add(name)
    /* The commit a press was waiting for: this layer is on the screen. */
    releasePresses()
    markReactMotion("enter")
    /* A layer standing in for the one before it (holdLayerLanding): from the next frame the stage lands pages again. */
    if (html.dataset.layerMotion === "stay") {
      requestAnimationFrame(() => {
        if (html.dataset.layerMotion === "stay") delete html.dataset.layerMotion
      })
    }
    return () => {
      html.classList.remove(name)
      /* ...or it has gone, and the page under it is in the same commit: the way back of our own can take its picture. */
      releasePresses()
      leaving?.()
      markReactMotion("leave")
    }
  }, [phoneOnly])

  const layer = (
    <div
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
