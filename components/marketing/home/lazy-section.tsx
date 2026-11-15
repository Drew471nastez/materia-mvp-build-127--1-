"use client"

/**
 * ===========================================================================
 *  BELOW THE FOLD, MOUNTED AS IT COMES NEAR (the home page, wave 12)
 * ===========================================================================
 * Two tools, for two kinds of section:
 *
 *   lazySection(load, { name, minHeight })
 *       A section that is mostly motion and pictures. Its code is not in the
 *       page's first load at all: the page imports only this small wrapper,
 *       which draws an empty box of the section's height (so nothing below
 *       it moves when it arrives) and imports the section when the box comes
 *       within LAZY_AHEAD of the screen, or earlier, within LAZY_IDLE_AHEAD,
 *       when the browser is idle. It is drawn as a React transition, so the
 *       render is sliced between frames. Every section's code is fetched as
 *       soon as the page has painted (landing round 9); once the page has
 *       loaded, the stylesheets are put in <head> (`styles`, see SectionStyle), so a fast
 *       flick to the bottom finds it ready and its mount adds no stylesheet.
 *       Defined in a client file (components/marketing/home/lazy-sections.tsx
 *       holds the home page's):
 *
 *         export const LazyCheckoutScene = lazySection(
 *           () => import("./checkout-scene").then((m) => m.CheckoutScene),
 *           {
 *             name: "checkout",
 *             minHeight: "clamp(900px, 160vh, 1600px)",
 *             styles: () => import("./checkout-scene").then((m) => m.CHECKOUT_STYLES),
 *           },
 *         )
 *
 *       Not for words a search engine must read: the server draws only the
 *       box. A section whose words matter keeps its server render and is
 *       wrapped in <LazySection> below instead.
 *
 *   <LazySection minHeight="...">{children}</LazySection>
 *       A section the server still draws (pricing, FAQ). The browser skips
 *       its layout and paint while it is far from the screen
 *       (content-visibility: auto, keeping its last measured size), which is
 *       most of what a long page costs while scrolling. Pass `sticky` for a
 *       section with a sticky or fixed child: paint containment would trap it.
 *
 * Neither changes what anybody sees: a visitor who asked for less motion, a
 * link into the page (#faq) and a browser with no IntersectionObserver all
 * get the section mounted at once.
 */

import { startTransition, useEffect, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react"

/**
 * How far ahead of the screen a lazy section mounts: two and a half screens
 * either way. Wave 14: it was a screen and a half, and a fling on a phone
 * (or Page Down held on a slow one) reached the box before the section had
 * arrived, so a blank box scrolled into view. A section mounted this far
 * away costs little: its box skips it (content-visibility) until it is
 * near, so the mount is React's work only, sliced as a transition.
 *
 * Landing round 9 (the owner: "when I scroll too fast, sections appear as
 * white blank containers"): four screens. A flick on a phone runs at six or
 * seven screens a second, so two and a half screens was a third of a second
 * of warning, less than a mount takes on a busy phone.
 */
export const LAZY_AHEAD = "400% 0px 400% 0px"
/**
 * Further ahead, a section mounts when the browser is idle (a visitor
 * reading, not flicking), so the work of drawing it rarely lands in a frame
 * of a scroll. LAZY_AHEAD still mounts it at once if it gets that close first.
 */
export const LAZY_IDLE_AHEAD = "800% 0px 800% 0px"
/**
 * How far ahead a mounted section (and a server-drawn LazySection) stops
 * being skipped and is drawn. Wave 14: left to content-visibility: auto, the
 * browser draws a skipped box only when it is within half a screen, and only
 * in a frame of the page's own thread; on a slow phone that thread is busy
 * for a tenth of a second at a time, the scroll itself runs on, and the
 * section arrived blank and filled in after it was already on screen.
 * Drawn a screen and a half ahead, its pictures are painted and rastered
 * before it gets there, and a fling never outruns them.
 *
 * Landing round 9: two and a half screens (it was one and a half), for the
 * same reason as LAZY_AHEAD.
 */
export const LAZY_DRAW_AHEAD = "250% 0px 250% 0px"
/** How long after the load event the idle prefetch starts, so it never competes with the hero or a first tap. */
export const LAZY_PREFETCH_AFTER_MS = 1000
/**
 * Wave 14: and at the latest this long after the page came alive (the first
 * lazy box's effect). On a slow network the load event waits for every
 * picture and the hero video, many seconds after the page works, and the
 * sections' code (a few kilobytes each) waited with it.
 */
export const LAZY_PREFETCH_LATEST_MS = 2500
/**
 * Landing round 9: the sections' code alone (no styles, no mount) is fetched
 * as soon as the page has painted and the browser has a free moment, and at
 * the latest this long after the page came alive, scrolling or not. It was
 * part of the idle prefetch above, which waits for the load event and for
 * the page to stop scrolling: a visitor who started scrolling at once and
 * kept going reached boxes whose code had not even been asked for.
 */
export const LAZY_CODE_LATEST_MS = 700
/**
 * Landing round 9: how long the work that follows (a section's styles, its
 * mount, a slice of its layout) waits for the page to stop scrolling before
 * it goes ahead anyway. With no limit, a visitor who never paused got none of
 * it, and every section was then built in the frame that brought it on
 * screen: the blank boxes and the stutter on reaching a section.
 */
export const LAZY_BUSY_WAIT_MS = 450
/**
 * Landing round 9: a box that is on screen, or within a screen of it, and
 * still empty is filled at once, in one go, ahead of every other section: an
 * empty white box on screen is worse than one long frame.
 */
export const LAZY_NOW = "100% 0px 100% 0px"
/** Landing round 9: how long the line waits for one section to be drawn before it moves on (a section that never arrives must not hold the rest). */
export const LAZY_DRAW_LATEST_MS = 1500
/** An idle slot shorter than this is passed over: fetching and running a section's code needs room. */
const IDLE_ROOM_MS = 12
/**
 * Wave 14: idle work waits until the page has not scrolled for this long. A
 * scroll runs on the compositor and leaves the page's own thread idle, so
 * the browser offered its idle slots in the middle of a fling, and a mount
 * or a measure (50 to 180 ms at 4x CPU) landed there as a dropped frame.
 */
const CALM_MS = 260

/**
 * A stylesheet a section draws as `<style href precedence>`. Listed beside
 * the section (lazySection's `styles`), it is put in <head> while the browser
 * is idle, ahead of the section, exactly as React would put it there. React
 * then finds it (it looks for style[data-href~=href]) and adds nothing when
 * the section mounts. Adding a stylesheet makes Chromium re-check the whole
 * document against it (and every running animation, for its @keyframes):
 * 50 to 120 ms at 4x CPU on this page, which mid-scroll is a dropped frame.
 */
export type SectionStyle = { href: string; precedence: string; css: string }

export function insertSectionStyles(styles: readonly SectionStyle[]) {
  if (typeof document === "undefined") return
  for (const s of styles) {
    if (document.querySelector(`style[data-href~="${s.href}"]`)) continue
    const el = document.createElement("style")
    el.setAttribute("data-href", s.href)
    el.setAttribute("data-precedence", s.precedence)
    el.textContent = s.css
    /* React's own place for it (react-dom insertStylesheet): after the last of its precedence, else after the last of any. */
    const nodes = document.querySelectorAll<HTMLElement>('link[rel="stylesheet"][data-precedence],style[data-precedence]')
    const last = nodes.length ? nodes[nodes.length - 1] : null
    let prior = last
    for (const node of nodes) {
      if (node.dataset.precedence === s.precedence) prior = node
      else if (prior !== last) break
    }
    if (prior?.parentNode) prior.parentNode.insertBefore(el, prior.nextSibling)
    else document.head.insertBefore(el, document.head.firstChild)
  }
}

type Options = {
  /** A short name, drawn as data-lazy-section (tests and probes find the box by it). */
  name: string
  /** The height the box keeps until the section mounts: as close to the real one as possible. */
  minHeight: string
  /** How far ahead it mounts (an IntersectionObserver rootMargin), when not LAZY_AHEAD. */
  rootMargin?: string
  /** The section's own stylesheets (see SectionStyle), put in place while idle, before it mounts. */
  styles?: () => Promise<readonly SectionStyle[]>
  /** false: the mounted section is never skipped off screen (one with a fixed child, which containment would trap). */
  contain?: boolean
}

let lastScroll = -Infinity
let scrollHooked = false
function hookScroll() {
  if (scrollHooked) return
  scrollHooked = true
  window.addEventListener("scroll", () => (lastScroll = performance.now()), { passive: true, capture: true })
}

const noSubscription = () => () => {}
const drawnInBrowser = () => true
const drawnOnServer = () => false

type Idle = (cb: (deadline?: IdleDeadline) => void, timeout?: number) => void
/** An idle slot while the page is not scrolling (CALM_MS); `timeout` still bounds the wait, scrolling or not. */
const idle: Idle = (cb, timeout) => {
  hookScroll()
  const until = timeout ? performance.now() + timeout : Infinity
  const run = (deadline?: IdleDeadline) => {
    const now = performance.now()
    const since = now - lastScroll
    if (since < CALM_MS && now < until) {
      window.setTimeout(() => ask(), CALM_MS - since)
      return
    }
    cb(deadline)
  }
  const ask = () => {
    const left = until - performance.now()
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, left < Infinity ? { timeout: Math.max(1, left) } : undefined)
    else window.setTimeout(() => run(), left < Infinity ? Math.min(left, 600) : 1200)
  }
  ask()
}

type Loader = (() => Promise<unknown>) & { box?: Element; code?: () => Promise<unknown> }
const loaders = new Set<Loader>()
let prefetchScheduled = false
let settled: Promise<void> | null = null
/**
 * Resolves LAZY_PREFETCH_AFTER_MS after the load event, or LAZY_PREFETCH_LATEST_MS
 * after the page came alive (first asked), whichever is first: nothing
 * optional starts before.
 */
function afterLoad() {
  return (settled ??= new Promise<void>((done) => {
    const later = () => window.setTimeout(done, LAZY_PREFETCH_AFTER_MS)
    window.setTimeout(done, LAZY_PREFETCH_LATEST_MS)
    if (document.readyState === "complete") later()
    else window.addEventListener("load", later, { once: true })
  }))
}

/*
 * Landing round 9: ONE SECTION IS DRAWN AT A TIME, THE NEAREST FIRST. Every
 * mount is a React transition, and transitions asked for close together are
 * rendered as one: a fling that brought five boxes within range at once got
 * all five sections rendered together and shown together, when the last was
 * done, so the first box the reader reached was still empty (measured at
 * 4x CPU: the second section's box on screen empty for 14 frames). In a
 * line, each is shown as soon as it alone is ready, and the one nearest the
 * screen goes first (farness, below: no layout is read to choose).
 */
type Job = { box: Element | null; start: () => Promise<void> }
const jobs: Job[] = []
let drawing = false
function drawNext() {
  if (drawing || !jobs.length) return
  jobs.sort((a, b) => farness(a.box ?? document.body) - farness(b.box ?? document.body))
  const job = jobs.shift()!
  drawing = true
  void job.start().then(() => {
    drawing = false
    drawNext()
  })
}

/** Sections still showing their box, by box: what mounts each one. */
const waiting = new Map<HTMLElement, () => Promise<unknown>>()

/**
 * How far a box is from the screen, in pixels, sections below counted a
 * little nearer than those above (a visitor reads down). Read from the boxes
 * the observers last saw (nearBox), so choosing costs no layout.
 */
const distance = new WeakMap<Element, number>()
function farness(el: Element) {
  const d = distance.get(el)
  return d === undefined ? Infinity : d
}

/**
 * Once every section's code is here, the ones still waiting are mounted one
 * at a time, each in an idle slot with room for it (never on a timeout):
 * while a visitor reads, the page finishes drawing itself, so the scroll that
 * follows has nothing left to build. A visitor who is scrolling leaves the
 * browser no such slots (idle waits for a pause), and the observers mount
 * what they reach. Wave 14: the one nearest the screen first, not the one
 * nearest the top: after a jump to the end (End, or the scroll bar), the
 * sections around the reader come before the ones they skipped.
 */
function mountNext(deadline?: IdleDeadline) {
  if (!waiting.size) return
  if (deadline && !deadline.didTimeout && deadline.timeRemaining() < IDLE_ROOM_MS) return idle(mountNext, LAZY_BUSY_WAIT_MS)
  const [el, mount] = [...waiting].sort(([a], [b]) => farness(a) - farness(b) || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
  waiting.delete(el)
  /* After it has drawn (two frames), wait for the next idle slot. */
  void mount().finally(() => requestAnimationFrame(() => requestAnimationFrame(() => idle(mountNext, LAZY_BUSY_WAIT_MS))))
}

/*
 * Wave 14: one observer for every box's distance from the screen (above:
 * how far its bottom is above the top; below: how far its top is below the
 * bottom, at two thirds), refreshed as boxes cross a few thresholds, so the
 * idle chain picks the nearest without reading any layout itself.
 */
let distanceWatch: IntersectionObserver | null = null
function watchDistance(el: Element) {
  if (typeof IntersectionObserver !== "function") return () => {}
  distanceWatch ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const r = e.boundingClientRect
        const vh = e.rootBounds?.height ?? window.innerHeight
        distance.set(e.target, r.bottom < 0 ? -r.bottom : r.top > vh ? (r.top - vh) * 0.67 : 0)
      }
    },
    { rootMargin: "400% 0px 400% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
  )
  distanceWatch.observe(el)
  return () => distanceWatch?.unobserve(el)
}

/** A slice of a section laid out in one idle slot: subtrees of at most this many elements. */
const SLICE_ELEMENTS = 60

/*
 * Wave 14: a mounted section is laid out ahead (the measure below) a slice at
 * a time. In one go it cost 60 to 180 ms of the page's thread at 4x CPU for
 * each of the big sections (the mocks' many text sizes), a dozen long tasks
 * in the seconds after load (most of the page's Total Blocking Time), or, put
 * off, a dropped frame in the middle of a scroll. Instead the section's
 * subtrees of up to SLICE_ELEMENTS elements are held back with
 * content-visibility: hidden (the section is off screen and skipped, so
 * nobody sees it), and let go a few per calm idle slot, each slot laying out
 * only those: 10 to 45 ms a slot at 4x. How many per slot follows how long
 * the last ones took. If the box comes near before the last slice
 * (LAZY_DRAW_AHEAD), everything still held back is let go at once.
 */
const slicing = new WeakMap<Element, () => void>()
function layOutInSlices(box: HTMLElement, done: () => void): () => void {
  const inner = box.firstElementChild
  if (!(inner instanceof HTMLElement)) return () => {}
  const groups: HTMLElement[] = []
  const walk = (el: Element) => {
    const n = el.getElementsByTagName("*").length
    if (n <= SLICE_ELEMENTS) {
      if (n >= 4 && el instanceof HTMLElement && !el.style.contentVisibility) groups.push(el)
      return
    }
    for (const child of el.children) walk(child)
  }
  let next = 0
  let per = 0
  let over = false
  let held = false
  const letGo = (to: number) => {
    if (held) for (; next < to; next++) groups[next].style.contentVisibility = ""
  }
  const finish = () => {
    if (over) return
    over = true
    slicing.delete(box)
    letGo(groups.length)
  }
  const step = () => {
    if (over) return
    if (!held) {
      /*
       * The first slot. Already drawn (near the screen, LAZY_DRAW_AHEAD,
       * whose first report comes before any idle slot): nothing is held
       * back, since that would blank part of a section someone can see; it
       * is laid out by the frame that draws it, and done() reads its height.
       */
      if (box.style.contentVisibility === "visible") {
        finish()
        done()
        return
      }
      for (const child of inner.children) walk(child)
      for (const g of groups) g.style.contentVisibility = "hidden"
      held = true
    }
    const t = performance.now()
    letGo(Math.min(groups.length, next + per))
    /* A size read lays out what was let go (and, the first time, the section around the held-back slices). */
    void inner.getBoundingClientRect()
    const took = performance.now() - t
    per = per === 0 ? 1 : took < 12 ? per * 2 : took > 30 ? Math.max(1, per >> 1) : per
    if (next < groups.length) idle(step, LAZY_BUSY_WAIT_MS)
    else {
      finish()
      done()
    }
  }
  slicing.set(box, finish)
  idle(step, LAZY_BUSY_WAIT_MS)
  return finish
}

/*
 * Wave 14: drawn ahead (LAZY_DRAW_AHEAD). Near the screen a box is
 * content-visibility: visible with the same containment content-visibility:
 * auto gives it (layout, paint and style), so nothing it draws looks
 * different; further away it is auto again and costs a frame nothing.
 */
/*
 * Landing round 11 (the owner, on an iPhone: images "appear too abruptly"):
 * a box being drawn ahead also asks for its pictures then. A picture marked
 * loading="lazy" was left to the browser's own distance, which in Safari is
 * a fraction of a screen, so it arrived (and faded in, landing-story.tsx
 * IMG_FADE_MS) with the section already on screen. From LAZY_DRAW_AHEAD it
 * is decoded before the reader gets there.
 */
function eagerPictures(box: HTMLElement) {
  for (const img of box.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) img.loading = "eager"
}

let drawWatch: IntersectionObserver | null = null
function watchDraw(el: HTMLElement) {
  if (typeof IntersectionObserver !== "function") return () => {}
  drawWatch ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const box = e.target as HTMLElement
        if (!box.style.contentVisibility) continue
        if (e.isIntersecting) {
          slicing.get(box)?.()
          eagerPictures(box)
        }
        box.style.contentVisibility = e.isIntersecting ? "visible" : "auto"
        box.style.contain = e.isIntersecting ? "layout paint style" : ""
      }
    },
    { rootMargin: LAZY_DRAW_AHEAD },
  )
  drawWatch.observe(el)
  return () => drawWatch?.unobserve(el)
}

/**
 * After load, when the browser is idle: fetch every lazy section's code and
 * put its styles in place, one section per roomy idle slot, in page order.
 * Landing round 9: each step waits for a calm idle slot for at most
 * LAZY_BUSY_WAIT_MS, so a visitor who never stops scrolling still gets it.
 */
function schedulePrefetch() {
  if (prefetchScheduled || typeof window === "undefined") return
  prefetchScheduled = true
  /* Not on Save-Data or 2g: those visitors fetch a section only when they reach it. */
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return
  /*
   * Wave 14: two at a time, nearest first. One at a time, each waiting for an
   * idle slot of its own, the last section's code arrived seconds after the
   * first on a slow network, and a reader who got there first found its box.
   */
  const start = () => {
    const queue = [...loaders].sort((a, b) => farness(a.box ?? document.body) - farness(b.box ?? document.body))
    let running = 0
    let done = false
    const next = (deadline?: IdleDeadline) => {
      if (deadline && !deadline.didTimeout && deadline.timeRemaining() < IDLE_ROOM_MS) return idle(next, LAZY_BUSY_WAIT_MS)
      while (running < 2 && queue.length) {
        const load = queue.shift()!
        running++
        void load()
          .catch(() => undefined)
          .finally(() => {
            running--
            idle(next, LAZY_BUSY_WAIT_MS)
          })
      }
      if (!running && !queue.length && !done) {
        done = true
        idle(mountNext, LAZY_BUSY_WAIT_MS)
      }
    }
    idle(next, LAZY_BUSY_WAIT_MS)
  }
  /* Landing round 9: the code first, three sections at a time in the page's order, once the page has painted (two frames) and has a free moment. */
  const code = () => {
    const queue = [...loaders]
    let running = 0
    const next = () => {
      while (running < 3 && queue.length) {
        const load = queue.shift()!
        running++
        void (load.code ? load.code() : Promise.resolve())
          .catch(() => undefined)
          .finally(() => {
            running--
            next()
          })
      }
    }
    next()
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(code, { timeout: LAZY_CODE_LATEST_MS })
      else window.setTimeout(code, 200)
    }),
  )
  void afterLoad().then(start)
}

export function lazySection<P extends object>(load: () => Promise<ComponentType<P>>, options: Options): ComponentType<P> {
  let cached: ComponentType<P> | null = null
  let pending: Promise<ComponentType<P>> | null = null
  const get = () => {
    if (cached) return Promise.resolve(cached)
    pending ??= load().then(
      (c) => (cached = c),
      (e) => {
        pending = null
        throw e
      },
    )
    return pending
  }
  let styled: Promise<void> | null = null
  const style = () =>
    (styled ??= options.styles
      ? options.styles().then(
          (list) => new Promise<void>((done) => idle(() => (insertSectionStyles(list), done()), 1000)),
          () => undefined,
        )
      : Promise.resolve())
  /* The prefetch: the code, then (in an idle slot of its own) the styles. `box` is the section's box once drawn, so the nearest is fetched first. */
  const loader: Loader = () => get().then(style)
  loader.code = get
  loaders.add(loader)

  function LazySectionMount(props: P) {
    const ref = useRef<HTMLDivElement>(null)
    /*
     * Wave 14: false while React hydrates the server's HTML (it reads the
     * server snapshot then), true for a box drawn in the browser. Hydrating,
     * the box starts empty, as the server drew it, even when the section's
     * code is already here: on a slow network the prefetch can land before
     * React reaches a box further down, and drawing the section there made
     * the HTML differ from the server's (React error #418, and the page
     * re-drawn). After a navigation back to the page, a section whose code
     * is here is drawn at once, as before.
     */
    const browserDrawn = useSyncExternalStore(noSubscription, drawnInBrowser, drawnOnServer)
    const [Section, setSection] = useState<ComponentType<P> | null>(() => (browserDrawn ? cached : null))

    useEffect(() => {
      schedulePrefetch()
      if (Section) return
      let live = true
      let asked = false
      const el = ref.current
      let job: Job | null = null
      let finished: Promise<void> | null = null
      let settle: (() => void) | null = null
      /*
       * Drawn as a transition: React renders the section in slices between
       * frames, never as one long task. Landing round 9: in a line with the
       * other sections (drawNext), and the promise settles when the section
       * is in the page (this effect's cleanup), not when it was asked for.
       * `urgent` (the box is on screen or about to be, LAZY_NOW): out of the
       * line and drawn now, in one go.
       */
      const mount = (urgent = false) => {
        if (el) waiting.delete(el)
        if (urgent) {
          if (job) {
            const i = jobs.indexOf(job)
            if (i >= 0) jobs.splice(i, 1)
          }
          asked = true
          return get().then(
            (c) => {
              if (live) setSection(() => c)
              settle?.()
            },
            () => {
              asked = false
              settle?.()
            },
          )
        }
        if (asked) return finished ?? Promise.resolve()
        asked = true
        finished = new Promise<void>((done) => {
          settle = done
          job = {
            box: el,
            start: () =>
              get()
                .then(
                  (c) =>
                    new Promise<void>((drawn) => {
                      if (!live) return drawn()
                      committed = drawn
                      window.setTimeout(drawn, LAZY_DRAW_LATEST_MS)
                      startTransition(() => setSection(() => c))
                    }),
                  () => {
                    asked = false
                  },
                )
                .then(done),
          }
          jobs.push(job)
          drawNext()
        })
        return finished
      }
      let committed: (() => void) | null = null
      const now =
        !el ||
        typeof IntersectionObserver !== "function" ||
        location.hash.length > 1 ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      if (now) {
        void mount()
        return () => {
          live = false
          committed?.()
        }
      }
      /*
       * On screen or within a screen of it: now, in one go, if the page is
       * being scrolled. While it stands still (the first sections under the
       * hero as the page loads) the box joins the line like any other: it is
       * the nearest, so it is first, and the load is not held up by it.
       */
      hookScroll()
      const soon = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            soon.disconnect()
            void mount(performance.now() - lastScroll < CALM_MS)
          }
        },
        { rootMargin: LAZY_NOW },
      )
      /* Near: mount now. */
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect()
            void mount()
          }
        },
        { rootMargin: options.rootMargin ?? LAZY_AHEAD },
      )
      /* Further: styles, then the section, each when the browser is idle. */
      const far = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return
          far.disconnect()
          void afterLoad()
            .then(style)
            .then(() => idle(() => live && mount(), LAZY_BUSY_WAIT_MS))
        },
        { rootMargin: LAZY_IDLE_AHEAD },
      )
      io.observe(el)
      soon.observe(el)
      if (!options.rootMargin) far.observe(el)
      waiting.set(el, mount)
      loader.box = el
      const unwatch = watchDistance(el)
      return () => {
        live = false
        committed?.()
        waiting.delete(el)
        io.disconnect()
        soon.disconnect()
        far.disconnect()
        unwatch()
      }
    }, [Section])

    /*
     * Mounted: the same box stays around the section, now letting the
     * browser skip it while it is off screen (content-visibility: auto, as
     * LazySection does). A skipped section costs a frame nothing: no style,
     * no layout, no paint and no compositor layers, which is what kept every
     * frame of a scroll busy once a dozen sections had mounted. Right after
     * it mounts it is laid out while still skipped, in calm idle slots, a
     * slice at a time (wave 14, layOutInSlices; it was one long task), and
     * its real height is kept as the box's size, so the page below it is in
     * its final place and the frame that brings it on screen only has to
     * paint it. Near the screen it is drawn ahead
     * (LAZY_DRAW_AHEAD): skipped boxes also kept every animation in them on
     * the page's thread (Chromium composites none inside content-visibility:
     * auto), restyling each one on every frame.
     */
    useEffect(() => {
      const el = ref.current
      if (!Section || !el || options.contain === false) return
      let live = true
      const unwatch = watchDraw(el)
      const stopSlicing = layOutInSlices(el, () => {
        const inner = live ? el.firstElementChild : null
        if (!inner) return
        const height = inner.getBoundingClientRect().height
        if (height > 0) el.style.containIntrinsicSize = `auto ${Math.round(height)}px`
      })
      return () => {
        live = false
        unwatch()
        stopSlicing()
      }
    }, [Section])

    if (Section)
      return (
        <div
          ref={ref}
          data-lazy-section={options.name}
          data-lazy-mounted=""
          style={options.contain === false ? undefined : { contentVisibility: "auto", containIntrinsicSize: `auto ${options.minHeight}` }}
        >
          <Section {...props} />
        </div>
      )
    return <div ref={ref} data-lazy-section={options.name} aria-hidden="true" style={{ minHeight: options.minHeight }} />
  }
  LazySectionMount.displayName = `LazySection(${options.name})`
  return LazySectionMount
}

/**
 * A server-drawn section the browser may skip while it is far from the
 * screen. `minHeight` is the size it is guessed at until it has been drawn
 * once; then the browser keeps the real one (`auto`), so the scroll bar does
 * not jump as sections come and go.
 */
export function LazySection({
  children,
  minHeight = "900px",
  sticky = false,
  name,
}: {
  children: ReactNode
  minHeight?: string
  /** The section has a sticky or fixed child: no containment. */
  sticky?: boolean
  name?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  /* Wave 14: drawn ahead like the mounted sections (LAZY_DRAW_AHEAD). */
  useEffect(() => {
    const el = ref.current
    if (sticky || !el) return
    return watchDraw(el)
  }, [sticky])
  const style: CSSProperties | undefined = sticky ? undefined : { contentVisibility: "auto", containIntrinsicSize: `auto ${minHeight}` }
  return (
    <div ref={ref} data-lazy-section={name ?? ""} style={style}>
      {children}
    </div>
  )
}
