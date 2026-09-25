"use client"

import type React from "react"
import { useLayoutEffect } from "react"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A LAYER COMES AND GOES LIKE A PAGE ON A PHONE
 * ===========================================================================
 * The product editor used to arrive and leave in one frame: the list was
 * there, then the editor was, then the list again. Now opening a product
 * slides the editor in from the right edge over the list, and Back or Cancel
 * slides it off to the right with the list already drawn underneath, the
 * way a pushed screen comes and goes on an iPhone. From 768px the travel
 * would be the whole width of a computer's screen, so there it is a short
 * fade with a 12px rise.
 *
 * HOW. The two pages never exist at the same time in React: the router
 * swaps one for the other in a single commit. So the move is a view
 * transition (document.startViewTransition): the browser keeps a picture of
 * the screen as it was, the router commits the new page, and the picture and
 * the live new page are animated against each other, on the compositor.
 * Nothing in the move is drawn by script, and there is never a frame without
 * a page in it: before the commit the old picture covers the screen, after
 * it the new page is live under (or over) it.
 *
 *   The callback waits for this file's own signal that the commit happened:
 *   the layer mounting (enter) or unmounting (leave), in a layout effect,
 *   which is before that frame is painted.
 *
 *   It waits at most LAYER_WAIT_MS. The editor is prefetched from the list,
 *   and the list from the editor, so the commit is normally a frame or two
 *   away; a page that has to come from the server is not. The screen does
 *   not render while the browser waits, so past that the move is skipped:
 *   the screen is live again, the page arrives when it arrives, with the
 *   stage's ordinary landing.
 *
 *   While it runs, <html> carries data-layer-motion ("enter" or "leave"),
 *   which is what the ::view-transition rules in app/globals.css select on,
 *   and what tells the stage (components/app/app-stage.tsx) not to play its
 *   own landing under the move. The pill is named in the transition, so it
 *   stays where it is while the page moves under it.
 *
 * The duration and the curve are set here and handed to the CSS as custom
 * properties on <html>, one number in one place.
 *
 * No move under reduced motion, in a browser with no view transitions (the
 * page swaps as before), or when one is already running.
 */
export const LAYER_MOTION_MS = 300
/** The iOS sheet curve, the one the segmented control and the sheets use. */
export const LAYER_MOTION_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const LAYER_WAIT_MS = 450

type LayerMotion = "enter" | "leave"
let waiting: { motion: LayerMotion; landed: () => void } | null = null
let moves = 0

type ViewTransitionLike = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void }
type WithViewTransitions = Document & { startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike }

export function moveLayer(motion: LayerMotion, navigate: () => void) {
  const doc = document as WithViewTransitions
  const html = document.documentElement
  const reduced = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (waiting || reduced || typeof doc.startViewTransition !== "function") {
    navigate()
    return
  }
  const id = ++moves
  let landed!: () => void
  const commit = new Promise<void>((resolve) => {
    landed = resolve
  })
  waiting = {
    motion,
    landed: () => {
      waiting = null
      landed()
    },
  }
  const stop = () => {
    if (moves === id) delete html.dataset.layerMotion
  }
  html.dataset.layerMotion = motion
  html.style.setProperty("--layer-motion-ms", `${LAYER_MOTION_MS}ms`)
  html.style.setProperty("--layer-motion-ease", LAYER_MOTION_EASE)

  let move: ViewTransitionLike
  try {
    move = doc.startViewTransition(() => {
      navigate()
      return new Promise<void>((resolve) => {
        const late = window.setTimeout(() => {
          /* Not here yet: give the screen back and let the page land on its own. */
          if (waiting && moves === id) waiting = null
          stop()
          move.skipTransition()
          resolve()
        }, LAYER_WAIT_MS)
        void commit.then(() => {
          window.clearTimeout(late)
          resolve()
        })
      })
    })
  } catch {
    waiting = null
    stop()
    navigate()
    return
  }
  /* A skipped move rejects `ready`; that is an outcome, not an error. */
  move.ready.catch(() => {})
  move.finished.then(stop, stop)
}

/**
 * THE SAME PAGE AT A NEW ADDRESS. A new product's first save opens it at
 * its own address, where the router draws a new layer with the same product
 * in it. That is not a new page to land: the stage would fade the editor in
 * from nothing, a blink right after Save. So the address change and the new
 * layer are marked as a layer standing in for itself (data-layer-motion
 * "stay"), which the stage lands without its entrance, and the mark goes
 * the frame after the new layer mounts, or after 8s if it never does.
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
 */
export function PageLayer({
  children,
  pill = false,
  inset = "page",
  className,
}: {
  children: React.ReactNode
  /** Keep the phone's nav pill over this page. */
  pill?: boolean
  /**
   * Who clears the status bar. "page" and "white": the layer pads its top by
   * the inset and paints that strip in the page's colour or in white. "bar":
   * the page's own sticky bar pads itself (the product editor's does, inside
   * any [data-page-layer]), so the layer adds nothing and the bar's colour
   * runs up under the clock as the page scrolls beneath it.
   */
  inset?: "page" | "white" | "bar"
  className?: string
}) {
  useLayoutEffect(() => {
    const html = document.documentElement
    html.classList.add("has-page-layer")
    /* The commit a layer's move is waiting for (moveLayer, below): this layer is on the screen. */
    if (waiting?.motion === "enter") waiting.landed()
    /* A layer standing in for the one before it (holdLayerLanding): from the next frame the stage lands pages again. */
    if (html.dataset.layerMotion === "stay") {
      requestAnimationFrame(() => {
        if (html.dataset.layerMotion === "stay") delete html.dataset.layerMotion
      })
    }
    return () => {
      html.classList.remove("has-page-layer")
      /* ...or it has gone, and the page under it is in the same commit. */
      if (waiting?.motion === "leave") waiting.landed()
    }
  }, [])

  return (
    <div
      data-page-layer={pill ? "pill" : ""}
      className={cn(
        "fixed inset-0 z-[52] flex flex-col bg-[#f8f9fa]",
        inset !== "bar" && "pt-[env(safe-area-inset-top,0px)]",
        inset === "white" && "bg-white",
        className,
      )}
    >
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
}
