"use client"

/**
 * ===========================================================================
 *  THE BAR ACROSS THE TOP, WHICH IS WHAT A BROWSER TAB DOES
 * ===========================================================================
 * Pressing a product card starts a server render. The page you are on stays
 * put until it is ready, which is correct and is why there is no blank screen
 * and no skeleton — but on its own it means a press can be followed by most
 * of a second in which the only thing that answered was a small bar on the
 * card itself.
 *
 * So the wait gets the indicator every browser and every large shop uses: a
 * thin line across the very top that starts when a navigation starts, creeps
 * while it is out, and finishes when the page lands.
 *
 * ---------------------------------------------------------------------------
 *  IT IS NOT A FADE, A VEIL OR A SKELETON, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------
 * Those all cover the page you are reading with something that is not the
 * page. This adds three pixels at the top and touches nothing else, so the
 * grid stays readable and scrollable the whole time the next page is being
 * fetched.
 *
 * ---------------------------------------------------------------------------
 *  IT WAITS BEFORE IT SHOWS
 * ---------------------------------------------------------------------------
 * Going back is a client-side restore and lands in about 40ms. A bar that
 * appeared instantly would flash for two frames on every back press, which is
 * the flicker this whole file is meant to avoid. DELAY_MS is longer than a
 * restore and far shorter than a server render, so back gets nothing and a
 * real fetch gets the bar.
 *
 * ---------------------------------------------------------------------------
 *  THE CREEP IS HONEST ABOUT BEING A GUESS
 * ---------------------------------------------------------------------------
 * Nothing can report real progress for a server render, so it does what every
 * implementation of this does: moves quickly at first, then approaches a
 * ceiling it never reaches, and only completes when the route actually
 * changes. It never sits at 100% waiting, which would be a lie, and it never
 * reaches the end on its own.
 *
 * ---------------------------------------------------------------------------
 *  AND IT CANNOT STRAND ANYBODY
 * ---------------------------------------------------------------------------
 * `pointer-events: none` throughout, so it can never take a tap. The resting
 * state is zero width and no opacity, written in the base style rather than
 * at the end of an animation. And GIVE_UP_MS finishes it even if the route
 * never changes — a blocked navigation, an anchor that went nowhere — because
 * a progress bar stuck at 80% for ever is worse than none.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

/** Longer than a client restore, far shorter than a server render. */
const DELAY_MS = 140
/** How long the finished bar stays at full width before it goes. */
const DONE_MS = 180
/** A navigation that never lands still has to give the bar back. */
const GIVE_UP_MS = 12000

/** Where the creep pauses, in order. It never reaches the end by itself. */
const CREEP = [
  { at: 0, pct: 12 },
  { at: 120, pct: 32 },
  { at: 320, pct: 52 },
  { at: 620, pct: 68 },
  { at: 1100, pct: 79 },
  { at: 1900, pct: 86 },
  { at: 3200, pct: 91 },
  { at: 6000, pct: 95 },
]

export function NavigationProgress() {
  const pathname = usePathname()
  const [pct, setPct] = useState(0)
  const [shown, setShown] = useState(false)
  const running = useRef(false)
  const timers = useRef<number[]>([])
  /** The path the navigation started from, so an arrival can be recognised. */
  const from = useRef<string | null>(null)

  const clear = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  const finish = useCallback(() => {
    if (!running.current) return
    running.current = false
    from.current = null
    clear()
    setPct(100)
    timers.current.push(
      window.setTimeout(() => {
        setShown(false)
        /* Width goes back to zero only once it is invisible, so the bar does
           not appear to rewind across the screen on its way out. */
        timers.current.push(window.setTimeout(() => setPct(0), 220))
      }, DONE_MS),
    )
  }, [clear])

  const start = useCallback(() => {
    if (running.current) return
    running.current = true
    from.current = window.location.pathname
    clear()
    setPct(0)
    timers.current.push(
      window.setTimeout(() => {
        if (!running.current) return
        setShown(true)
        for (const step of CREEP) {
          timers.current.push(
            window.setTimeout(() => {
              if (running.current) setPct(step.pct)
            }, step.at),
          )
        }
      }, DELAY_MS),
    )
    timers.current.push(window.setTimeout(finish, GIVE_UP_MS))
  }, [clear, finish])

  useEffect(() => {
    /**
     * A navigation begins at the press, not when React notices. Listening on
     * the document in the capture phase catches every internal link without
     * any of them having to know this exists.
     */
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(link.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      /* Same page, or only a hash: nothing is being fetched. */
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }

    /* Back and forward are navigations too, and they have no click. */
    const onPopState = () => start()

    document.addEventListener("click", onClick, { capture: true })
    window.addEventListener("popstate", onPopState)
    return () => {
      document.removeEventListener("click", onClick, { capture: true })
      window.removeEventListener("popstate", onPopState)
      clear()
    }
  }, [start, clear])

  /** The route landed. */
  useEffect(() => {
    if (running.current && from.current !== null && pathname !== from.current) finish()
  }, [pathname, finish])

  return (
    <div aria-hidden="true" className="nav-progress" data-shown={shown ? "true" : "false"}>
      <div className="nav-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
