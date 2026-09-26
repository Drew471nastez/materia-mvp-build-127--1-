"use client"

import * as React from "react"
import { useLayoutEffect, useSyncExternalStore } from "react"
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
 * HOW. React's own view transitions (<ViewTransition>, in the React the app
 * router runs). The layer is wrapped in one, named `page-layer`, with an
 * enter and an exit and nothing for an update. When a navigation (a
 * transition, which is what every router push, replace and back is) mounts
 * or unmounts it, React calls document.startViewTransition AT THE COMMIT:
 *
 *   While the next page is still on its way, nothing is frozen. The page you
 *   pressed on stays live, and the control you pressed answers (THE PRESS,
 *   below), with a spinner that keeps turning if the wait is long. The old
 *   way started the view transition on the press and froze the screen on its
 *   picture until the router committed, up to 450ms with nothing moving.
 *
 *   The picture is taken the moment the new page is ready, and the move
 *   starts on the next frame, run by the compositor on transform alone:
 *   ::view-transition-new(page-layer) from translateY(100%) coming in,
 *   ::view-transition-old(page-layer) to translateY(100%) going out. The rest
 *   of the screen (root) does not move or fade: coming in, the picture of the
 *   page under it holds; going out, the live page it goes to is under it. So
 *   no frame is ever without a page, and the /app header, which is part of
 *   root, is always under the layer, never over it.
 *
 *   The layer's own layout effect, which React runs inside that transition,
 *   marks <html> with data-layer-motion ("enter" or "leave"), which is what
 *   the ::view-transition rules in app/globals.css select on and what tells
 *   the stage to play no landing of its own under the move. The mark goes
 *   when the transition has finished.
 *
 * Any route that renders a PageLayer gets this, however it is reached: a
 * Link, router.push, router.back, the browser's back. moveLayer (below) is
 * for the press: a caller that navigates to or from a layer hands it the
 * navigation and it answers the press first.
 *
 * The durations and the curve are set here and handed to the CSS as custom
 * properties on <html>, one number in one place.
 *
 * NO MOVE under reduced motion, from 768px, in a browser with no view
 * transitions (the page swaps), after a back the browser has already drawn
 * its own transition for (Safari's swipe back), or when a layer stands in for
 * itself at a new address (holdLayerLanding) or for another layer in the same
 * commit: the new one is simply there.
 */
export const LAYER_MOTION_MS = 360
/** Going back down is a little quicker than coming up, as a sheet is. */
export const LAYER_LEAVE_MS = 300
/** The iOS sheet curve, the one the segmented control and the sheets use. */
export const LAYER_MOTION_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** Where the editor is a layer at all: the pill's breakpoint, the same 768px as `phoneOnly`. */
export const LAYER_PHONE = "(max-width: 767px)"
/** The view transition name the layer carries while it moves, and that the CSS animates. */
export const LAYER_NAME = "page-layer"

type ViewTransitionLike = { finished: Promise<void>; ready: Promise<void>; skipTransition: () => void }
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
  with no move, as a browser without view transitions does.
*/
const ReactViewTransition = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition ?? null

/* ── Whether a layer moves here: a phone, and motion allowed ─────────────── */
const REDUCED = "(prefers-reduced-motion: reduce)"
function layerMotionOn(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(LAYER_PHONE).matches && !window.matchMedia(REDUCED).matches
}
function subscribeMotion(change: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const queries = [window.matchMedia(LAYER_PHONE), window.matchMedia(REDUCED)]
  for (const q of queries) q.addEventListener?.("change", change)
  return () => {
    for (const q of queries) q.removeEventListener?.("change", change)
  }
}
const serverMotion = () => false

/*
  A BACK THE BROWSER HAS ALREADY MOVED. Safari's swipe back slides a
  picture of the page behind across the screen itself, and says so on the
  popstate (hasUAVisualTransition). A drop after it would be the same way
  back played twice, so that one commit is marked "stay" instead.
*/
let browserMovedAt = -Infinity
const BROWSER_MOVE_KEPT_MS = 1000

/* ── The mark on <html> while a layer moves ─────────────────────────────── */
type Mark = "enter" | "leave" | "swap" | "stay"

function markMotion(kind: "enter" | "leave") {
  const html = document.documentElement
  const move = (document as Document & { __reactViewTransition?: ViewTransitionLike | null }).__reactViewTransition
  /* Only inside the transition React is running for this commit; a commit with none (a sync update, reduced motion, a wide window) marks nothing. */
  if (!move || !layerMotionOn()) return
  const now = html.dataset.layerMotion as Mark | undefined
  /* Standing in for itself (holdLayerLanding), or already one layer for another in this commit. */
  if (now === "stay" || now === "swap") return
  let next: Mark = kind
  /* The one going left in this same commit: one layer in place of another, which moves nothing. */
  if (kind === "enter" && now === "leave") next = "swap"
  if (performance.now() - browserMovedAt < BROWSER_MOVE_KEPT_MS) next = "stay"
  html.dataset.layerMotion = next
  html.style.setProperty("--layer-motion-ms", `${LAYER_MOTION_MS}ms`)
  html.style.setProperty("--layer-leave-ms", `${LAYER_LEAVE_MS}ms`)
  html.style.setProperty("--layer-motion-ease", LAYER_MOTION_EASE)
  const clear = () => {
    if (html.dataset.layerMotion === next) delete html.dataset.layerMotion
  }
  move.finished.then(clear, clear)
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
  return el.getAttribute("aria-busy") === "true" || el.hasAttribute("data-leaving") || !!el.querySelector("[data-activity-spinner]")
}

/**
 * Answers a press on `el`: dimmed now, a spinner in its place after
 * LAYER_PRESS_WAIT_MS if nothing has landed by then. `until` is the address
 * whose arrival also ends it (a link's). Safe to call twice.
 */
export function holdPress(el: Element | null | undefined, until: string | null = null) {
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
  window.addEventListener(
    "popstate",
    (e) => {
      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) browserMovedAt = performance.now()
    },
    true,
  )
}
if (typeof window !== "undefined") listen()

/**
 * A navigation to or from a layer, with its press answered first.
 * `navigate` runs at once, in the same task: the router's own transition is
 * what React moves the layer on (see above), so there is nothing to wait
 * for here. `press` is the control to answer: by default the one under the
 * last pointer press; `false` when the caller draws its own answer (the
 * products list's row, the product editor's Cancel).
 */
export function moveLayer(_motion: "enter" | "leave", navigate: () => void, press?: Element | null | false) {
  if (press !== false) holdPress(press ?? recentPress())
  navigate()
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
  const moves = useSyncExternalStore(subscribeMotion, layerMotionOn, serverMotion)

  useLayoutEffect(() => {
    const html = document.documentElement
    const name = phoneOnly ? "has-phone-page-layer" : "has-page-layer"
    html.classList.add(name)
    /* The commit a press was waiting for: this layer is on the screen. */
    releasePresses()
    markMotion("enter")
    /* A layer standing in for the one before it (holdLayerLanding): from the next frame the stage lands pages again. */
    if (html.dataset.layerMotion === "stay") {
      requestAnimationFrame(() => {
        if (html.dataset.layerMotion === "stay") delete html.dataset.layerMotion
      })
    }
    return () => {
      html.classList.remove(name)
      /* ...or it has gone, and the page under it is in the same commit. */
      releasePresses()
      markMotion("leave")
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
    place of another in a commit (share) moves nothing either.
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
