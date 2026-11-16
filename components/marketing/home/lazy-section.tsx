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
/** Landing round 12: how long after the hero's first paint the sections start being built (afterLoad). */
export const LAZY_START_AFTER_PAINT_MS = 150
/** An idle slot shorter than this is passed over: fetching and running a section's code needs room. */
const IDLE_ROOM_MS = 12
/**
 * Wave 14: idle work waits until the page has not scrolled for this long. A
 * scroll runs on the compositor and leaves the page's own thread idle, so
 * the browser offered its idle slots in the middle of a fling, and a mount
 * or a measure (50 to 180 ms at 4x CPU) landed there as a dropped frame.
 */
const CALM_MS = 260

/*
 * Landing round 11 (the owner, on an iPhone: headings and pictures jump and
 * stutter while scrolling up and down). SAFARI HAS NO SCROLL ANCHORING
 * (overflow-anchor is not in WebKit), so a box above the screen that grows or
 * shrinks moves everything on screen by as much, in one frame. Chromium
 * anchors the scroll and hid it. A skipped box shows the height it was given
 * (the placeholder, measured in Chromium) until it is first drawn, and WebKit
 * draws most sections a few pixels off that (measured at 390: the checkout
 * 12px, the map 13, pricing 47, the questions 29). So:
 *
 *   (landing round 12: no box is skipped any more, so a built section has its
 *   real height from the frame it is built in, and nothing is kept for it);
 *
 *   where the browser does not anchor the scroll, a box wholly above the
 *   screen that changes height anyway (one never drawn: the page put back
 *   halfway down on a reload, or flung past) is held (holdAbove): in the
 *   frame it changed, before it is painted, the page is scrolled by the same
 *   amount, so nothing on screen moves. Never during a fling (a script scroll
 *   on iOS stops a fling dead): then the box takes the difference in its own
 *   top margin, above the screen, so nothing below it moves either, and the
 *   margin is traded for a scroll once the page stands still.
 */
/** The browser keeps what is on screen in place when something above it changes size (Chromium, Firefox; not WebKit). */
const anchored = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("overflow-anchor", "auto")
const calm = () => performance.now() - lastScroll >= CALM_MS
/*
 * The scroll moved by a box's change. WebKit keeps the page's scroll in whole
 * pixels and drops the fraction of a scrollBy (a section 0.56px shorter moved
 * the screen by 0.56px, and a few of those added up to 1.5px), so the
 * fractions are carried until they make a pixel.
 */
let carried = 0
function scrollWith(d: number) {
  carried += d
  const whole = Math.round(carried)
  if (!whole) return
  carried -= whole
  window.scrollBy(0, whole)
}

const heights = new WeakMap<Element, number>()
/** How much of a box's change in height its top margin is holding, until a calm moment. */
const owed = new Map<HTMLElement, number>()
let holdWatch: ResizeObserver | null = null
/**
 * Watches a box's height where the browser does not anchor the scroll. A
 * ResizeObserver reports after layout and before paint, so what it changes
 * lands in the same frame as the change it answers.
 */
function holdAbove(el: HTMLElement) {
  if (typeof ResizeObserver !== "function" || anchored()) return () => {}
  hookScroll()
  holdWatch ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.target as HTMLElement
      const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
      const was = heights.get(box)
      heights.set(box, h)
      if (was === undefined || Math.abs(h - was) < 0.25) continue
      /* Only a box that was wholly above the screen: one on screen changed in front of the reader (a question opened), and the page stays where it is. */
      if (box.getBoundingClientRect().top + was > 0) continue
      if (calm()) scrollWith(h - was)
      else {
        const m = (owed.get(box) ?? 0) + h - was
        owed.set(box, m)
        box.style.marginTop = `${-m}px`
        idle(settleOwed)
      }
    }
  })
  holdWatch.observe(el)
  return () => {
    holdWatch?.unobserve(el)
    heights.delete(el)
    owed.delete(el)
  }
}

/** Once the page stands still, each held margin goes and the scroll moves by as much (nothing on screen moves), while that box's top is off screen. */
function settleOwed() {
  if (!calm()) return idle(settleOwed)
  let left = false
  for (const [box, m] of owed) {
    const top = box.getBoundingClientRect().top
    if (top > -1 && top < window.innerHeight + 1) {
      left = true
      continue
    }
    owed.delete(box)
    box.style.marginTop = ""
    if (top < 0) scrollWith(m)
  }
  if (left) window.setTimeout(() => idle(settleOwed), 500)
}

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
  /*
   * Landing round 12 (the owner's iPhone recording: sections stutter, pop and arrive blank after the hero). Measured
   * at 4x CPU on 12 Mbps: the load event came at 6.3s (it waits for the hero film and every picture), the first
   * section under the hero mounted at 4.3s and after 34s three were still not built, so a visitor who scrolled in
   * the first seconds made the page build sections in the middle of the scroll. Now the line starts two frames after
   * the page is alive (the hero has painted) and does not wait for the load event.
   */
  return (settled ??= new Promise<void>((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(done, LAZY_START_AFTER_PAINT_MS)))
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
function mountNext() {
  if (!waiting.size) return
  const [el, mount] = [...waiting].sort(([a], [b]) => farness(a) - farness(b) || (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
  waiting.delete(el)
  /* Landing round 12: after it has drawn (two frames), the next one, with no wait for an idle slot. */
  void mount().finally(() => requestAnimationFrame(() => requestAnimationFrame(mountNext)))
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
  /*
   * Landing round 12: every section is built as early as the page can, back to back, nearest first, scrolling or
   * not. The idle slots and the wait for the scroll to stop are gone from this line: each was there to keep one
   * frame from dropping, and together they put the building off to the moment the visitor started scrolling.
   */
  const start = () => {
    for (const load of [...loaders].sort((a, b) => farness(a.box ?? document.body) - farness(b.box ?? document.body))) void load().catch(() => undefined)
    mountNext()
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

    /* Landing round 11: from its first frame, empty or mounted (React keeps the same box), held while it is above the screen (holdAbove). */
    useEffect(() => {
      const el = ref.current
      return el ? holdAbove(el) : undefined
    }, [])

    /*
     * Landing round 12: A MOUNTED SECTION IS NEVER SKIPPED. It was content-visibility: auto, switched to visible a
     * few screens ahead and back as it left: every switch made the browser work out the whole section's style and
     * layout again (measured at 4x CPU in a fling down the page: 1.5s of style and layout, in tasks of up to 200ms),
     * and on an iPhone a switch written during a fling is drawn late, so a section came on screen blank or half
     * drawn and popped in. Once built, a section is laid out once and stays drawn; scrolling it costs nothing more.
     */
    if (Section)
      return (
        <div ref={ref} data-lazy-section={options.name} data-lazy-mounted="">
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
  /* Landing round 12: drawn as the server drew it, never skipped (see the mounted sections), so it never arrives blank. */
  useEffect(() => {
    const el = ref.current
    if (sticky || !el) return
    return holdAbove(el)
  }, [sticky])
  void minHeight
  return (
    <div ref={ref} data-lazy-section={name ?? ""}>
      {children}
    </div>
  )
}
