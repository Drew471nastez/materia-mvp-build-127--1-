"use client"

/**
 * ===========================================================================
 *  A THEME SETTING UNDER A FINGER IS DRAWN WHERE IT CAN BE SEEN
 * ===========================================================================
 * The owner, round 34: "when I adjust sliders or change colors, should feel
 * smooth clean ... real time".
 *
 * A theme setting reaches every section on the page: a scheme's background
 * colour, a page width, a corner radius. While a finger is on the control the
 * canvas draws each new value as a transition (live-settings.ts
 * useLiveTheme), and on a 44 section page that transition was every section
 * on the page rendered again, so it was thrown away by the next move before
 * it could finish. Measured (scripts/check-editor-live-edit.mjs): a scheme
 * colour dragged for half a second drew once, after the finger lifted, 1.3s
 * late at 1x and 3.4s at 4x CPU; a theme slider rendered 616 sections for 63
 * values.
 *
 * So while a theme value is live, only the sections on screen (and 200px
 * either side) are drawn with it. They are a handful, which renders
 * between two moves. The rest keep the committed theme until the finger
 * lifts, and the commit then draws the whole page once, with the value the
 * editor keeps: what is published is never drawn from anything else.
 *
 * Which sections are on screen is read by an IntersectionObserver on the
 * canvas's scroller, never by measuring during a render. A section scrolled
 * into view while the value is still live asks to be drawn with it.
 */

import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

/** How far past the visible canvas a section still counts as on screen: a wheel turn away. */
export const ON_SCREEN_MARGIN = "200px 0px"

/*
  A LOOP NOBODY CAN SEE IS HELD (round 44). A section's endless animation (a
  logo marquee, scrolling text) is drawn by the compositor, and still asked
  the main thread for a frame sixty times a second, each one restyled and
  layerized (scripts/check-editor-perf.mjs PART=scroll, TRACE=scroll: with the
  canvas's one marquee paused a wheel at a quarter speed dropped 11% of its
  frames, running 24%). The same observer that knows which sections are on
  screen pauses those of a section that has left, and plays them again when
  it comes back, by the animations themselves: no style is changed, so
  nothing is restyled. Only endless ones, and only ones it paused itself.
*/
const heldLoops = new WeakMap<Element, Animation[]>()
export function holdLoops(el: Element, onScreen: boolean): void {
  if (onScreen) {
    const held = heldLoops.get(el)
    if (!held) return
    heldLoops.delete(el)
    for (const a of held) if (a.playState === "paused") a.play()
    return
  }
  if (heldLoops.has(el) || typeof (el as Element & { getAnimations?: unknown }).getAnimations !== "function") return
  const loops = el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && a.effect?.getTiming().iterations === Infinity)
  if (!loops.length) return
  for (const a of loops) a.pause()
  heldLoops.set(el, loops)
}

/**
 * Whether a section is on screen, by its id. `ids` are the sections drawn
 * (their elements are `#<prefix><id>`); `live` says a theme value is under a
 * finger, which is the only time a section coming into view needs a render.
 * Until the observer has reported, every section counts as on screen.
 */
export function useOnScreenSections(
  ids: readonly string[],
  live: boolean,
  opts: { rootId: string; prefix: string },
): (id: string) => boolean {
  const seen = useRef<Set<string>>(new Set())
  const ready = useRef(false)
  const liveRef = useRef(live)
  const observer = useRef<IntersectionObserver | null>(null)
  const observed = useRef<Map<Element, string>>(new Map())
  const [, setTick] = useState(0)
  useLayoutEffect(() => {
    liveRef.current = live
  })

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const root = document.getElementById(opts.rootId)
    if (!root) return
    const map = observed.current
    const io = new IntersectionObserver(
      (entries) => {
        let arrived = false
        for (const e of entries) {
          const id = map.get(e.target)
          if (!id) continue
          holdLoops(e.target, e.isIntersecting)
          if (e.isIntersecting) {
            if (!seen.current.has(id)) {
              seen.current.add(id)
              arrived = true
            }
          } else seen.current.delete(id)
        }
        ready.current = true
        /* A section scrolled into view while a value is live is drawn with it. */
        if (arrived && liveRef.current) startTransition(() => setTick((n) => n + 1))
      },
      { root, rootMargin: ON_SCREEN_MARGIN },
    )
    observer.current = io
    for (const el of map.keys()) io.observe(el)
    return () => {
      io.disconnect()
      observer.current = null
    }
  }, [opts.rootId])

  /* Every section drawn is watched, and one no longer drawn (or drawn again as a new element) is let go of. After every render: a pass over a page's ids, nothing measured. */
  useLayoutEffect(() => {
    const map = observed.current
    const io = observer.current
    const want = new Set(ids)
    for (const [el, id] of map) {
      if (want.has(id) && el.isConnected) continue
      io?.unobserve(el)
      map.delete(el)
      seen.current.delete(id)
    }
    const have = new Set(map.values())
    for (const id of ids) {
      if (have.has(id)) continue
      const el = document.getElementById(`${opts.prefix}${id}`)
      if (!el) continue
      map.set(el, id)
      io?.observe(el)
    }
  })

  return useCallback((id: string) => !ready.current || seen.current.has(id), [])
}
