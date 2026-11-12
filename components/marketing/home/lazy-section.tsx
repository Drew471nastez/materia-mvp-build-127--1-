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
 *       render is sliced between frames. Once the page has loaded and the
 *       browser is idle, the code is fetched ahead one section at a time and
 *       its stylesheets put in <head> (`styles`, see SectionStyle), so a fast
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

import { startTransition, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"

/** How far ahead of the screen a lazy section mounts: a screen and a half either way. */
export const LAZY_AHEAD = "150% 0px 150% 0px"
/**
 * Further ahead, a section mounts when the browser is idle (a visitor
 * reading, not flicking), so the work of drawing it rarely lands in a frame
 * of a scroll. LAZY_AHEAD still mounts it at once if it gets that close first.
 */
export const LAZY_IDLE_AHEAD = "300% 0px 300% 0px"
/** How long after the load event the idle prefetch starts, so it never competes with the hero or a first tap. */
export const LAZY_PREFETCH_AFTER_MS = 3000
/** An idle slot shorter than this is passed over: fetching and running a section's code needs room. */
const IDLE_ROOM_MS = 12

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
}

type Idle = (cb: (deadline?: IdleDeadline) => void, timeout?: number) => void
const idle: Idle = (cb, timeout) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cb, timeout ? { timeout } : undefined)
  else window.setTimeout(() => cb(), timeout ? Math.min(timeout, 600) : 1200)
}

const loaders = new Set<() => Promise<unknown>>()
let prefetchScheduled = false
let settled: Promise<void> | null = null
/** Resolves LAZY_PREFETCH_AFTER_MS after the load event: nothing optional starts before. */
function afterLoad() {
  return (settled ??= new Promise<void>((done) => {
    const later = () => window.setTimeout(done, LAZY_PREFETCH_AFTER_MS)
    if (document.readyState === "complete") later()
    else window.addEventListener("load", later, { once: true })
  }))
}

/** Sections still showing their box, by box: what mounts each one. */
const waiting = new Map<HTMLElement, () => Promise<unknown>>()

/**
 * Once every section's code is here, the ones still far below are mounted
 * one at a time, top first, each in an idle slot with room for it (never on
 * a timeout): while a visitor reads, the page finishes drawing itself, so the
 * scroll that follows has nothing left to build. A visitor who is scrolling
 * leaves the browser no such slots, and the observers mount what they reach.
 */
function mountNext(deadline?: IdleDeadline) {
  if (!waiting.size) return
  if (deadline && !deadline.didTimeout && deadline.timeRemaining() < IDLE_ROOM_MS) return idle(mountNext)
  const [el, mount] = [...waiting].sort(([a], [b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0]
  waiting.delete(el)
  /* After it has drawn (two frames), wait for the next idle slot. */
  void mount().finally(() => requestAnimationFrame(() => requestAnimationFrame(() => idle(mountNext))))
}

/**
 * After load, when the browser is idle: fetch every lazy section's code and
 * put its styles in place, one section per roomy idle slot, in page order.
 * Only real idle time (no timeout), so it never delays a frame or a tap.
 */
function schedulePrefetch() {
  if (prefetchScheduled || typeof window === "undefined") return
  prefetchScheduled = true
  /* Not on Save-Data or 2g: those visitors fetch a section only when they reach it. */
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return
  const start = () => {
    const queue = [...loaders]
    const next = (deadline?: IdleDeadline) => {
      if (deadline && !deadline.didTimeout && deadline.timeRemaining() < IDLE_ROOM_MS) return idle(next)
      const load = queue.shift()
      if (load) void load().catch(() => undefined).finally(() => idle(next))
      else idle(mountNext)
    }
    idle(next)
  }
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
  /* The prefetch: the code, then (in an idle slot of its own) the styles. */
  loaders.add(() => get().then(style))

  function LazySectionMount(props: P) {
    const ref = useRef<HTMLDivElement>(null)
    const [Section, setSection] = useState<ComponentType<P> | null>(() => cached)

    useEffect(() => {
      schedulePrefetch()
      if (Section) return
      let live = true
      let asked = false
      const el = ref.current
      /* Drawn as a transition: React renders the section in slices between frames, never as one long task. */
      const mount = () => {
        if (el) waiting.delete(el)
        if (asked) return Promise.resolve()
        asked = true
        return get().then(
          (c) => {
            if (live) startTransition(() => setSection(() => c))
          },
          () => {
            asked = false
          },
        )
      }
      const now =
        !el ||
        typeof IntersectionObserver !== "function" ||
        location.hash.length > 1 ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      if (now) {
        mount()
        return () => {
          live = false
        }
      }
      /* Near: mount now. */
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect()
            mount()
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
            .then(() => idle(() => live && mount(), 1500))
        },
        { rootMargin: LAZY_IDLE_AHEAD },
      )
      io.observe(el)
      if (!options.rootMargin) far.observe(el)
      waiting.set(el, mount)
      return () => {
        live = false
        waiting.delete(el)
        io.disconnect()
        far.disconnect()
      }
    }, [Section])

    if (Section) return <Section {...props} />
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
  const style: CSSProperties | undefined = sticky ? undefined : { contentVisibility: "auto", containIntrinsicSize: `auto ${minHeight}` }
  return (
    <div data-lazy-section={name ?? ""} style={style}>
      {children}
    </div>
  )
}
