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
 *       within LAZY_AHEAD of the screen. Once the page has loaded and the
 *       browser is idle, the code is fetched ahead one section at a time, so
 *       a fast flick to the bottom finds it ready. Defined in a client file
 *       (components/marketing/home/lazy-sections.tsx holds the home page's):
 *
 *         export const LazyCheckoutScene = lazySection(
 *           () => import("./checkout-scene").then((m) => m.CheckoutScene),
 *           { name: "checkout", minHeight: "clamp(900px, 160vh, 1600px)" },
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

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react"

/** How far ahead of the screen a lazy section mounts: a screen and a half either way. */
export const LAZY_AHEAD = "150% 0px 150% 0px"
/** How long after the load event the idle prefetch starts, so it never competes with the hero. */
export const LAZY_PREFETCH_AFTER_MS = 2500

type Options = {
  /** A short name, drawn as data-lazy-section (tests and probes find the box by it). */
  name: string
  /** The height the box keeps until the section mounts: as close to the real one as possible. */
  minHeight: string
  /** How far ahead it mounts (an IntersectionObserver rootMargin), when not LAZY_AHEAD. */
  rootMargin?: string
}

const loaders = new Set<() => Promise<unknown>>()
let prefetchScheduled = false

/** After load, when the browser is idle: fetch every lazy section's code, one per idle slot. */
function schedulePrefetch() {
  if (prefetchScheduled || typeof window === "undefined") return
  prefetchScheduled = true
  /* Not on Save-Data or 2g: those visitors fetch a section only when they reach it. */
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 1200)
  const start = () =>
    idle(() => {
      const queue = [...loaders]
      const next = () => {
        const load = queue.shift()
        if (load) void load().catch(() => undefined).finally(() => idle(next))
      }
      next()
    })
  const later = () => window.setTimeout(start, LAZY_PREFETCH_AFTER_MS)
  if (document.readyState === "complete") later()
  else window.addEventListener("load", later, { once: true })
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
  loaders.add(get)

  function LazySectionMount(props: P) {
    const ref = useRef<HTMLDivElement>(null)
    const [Section, setSection] = useState<ComponentType<P> | null>(() => cached)

    useEffect(() => {
      schedulePrefetch()
      if (Section) return
      let live = true
      const mount = () => {
        get().then(
          (c) => {
            if (live) setSection(() => c)
          },
          () => undefined,
        )
      }
      const el = ref.current
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
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect()
            mount()
          }
        },
        { rootMargin: options.rootMargin ?? LAZY_AHEAD },
      )
      io.observe(el)
      return () => {
        live = false
        io.disconnect()
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
