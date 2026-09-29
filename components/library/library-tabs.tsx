"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import { LIBRARY_TABS, cleanPath as clean, showsLibraryTabs } from "./library-tab-list"

/**
 * ===========================================================================
 *  THE LIBRARY'S OWN PLACES
 * ===========================================================================
 * What a buyer comes here for is the things they bought, and those come in
 * three kinds that live on three screens: products (files to download),
 * courses (/library/courses) and memberships (/library/memberships). Then
 * what they did about them: reviews and receipts. Then what they have not
 * bought yet: the wishlist.
 *
 * So the heading is "Library" and under it one row of pills. The owner asked
 * for separate pills rather than the underlined row it was, in Storelib's
 * own style, so each one is Explore's category pill (components/explore/
 * explore-page-client.tsx): white on a hairline, and the chosen one pressed
 * in on a grey fill. They switch the way /app settings switches its tabs
 * (components/app/settings-form-new.tsx): every pill carries its own fill,
 * the pressed pill's fill fades in and grows from 96% where it is, the old
 * one fades out where it is, and the words ease from grey to ink, all over
 * 150ms on one ease out. A press also dips the pill to 97%. Only opacity and
 * scale move, so the compositor carries it.
 *
 * THE PILL ANSWERS THE PRESS, NOT THE SERVER. The tabs are routes, and a
 * route can take a moment. The pressed pill is chosen on the press itself
 * and the address catches up. The screen under the row answers the same
 * press on its own (components/library/library-panel.tsx hears the click):
 * the old screen fades out over the new one's shape. Every tab is fetched whole while the page is
 * idle, and again the moment a pointer comes near one, so by the time a
 * finger lands the next screen is usually already on the phone.
 *
 * On a phone the row scrolls sideways and fades at whichever edge has more
 * behind it. Settings is not a tab: it is the account (/account), which the
 * avatar in the header opens. The row is on the library's list screens only:
 * a product, a course player or a membership opened from it has its own back
 * link and needs the room.
 */
export { LIBRARY_TABS, showsLibraryTabs } from "./library-tab-list"

/** Settings' own numbers (components/app/settings-form-new.tsx TAB_FADE_MS, TAB_EASE). */
export const TAB_FADE_MS = 150
export const TAB_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"

/** A whole page, data included, rather than the shell a Link fetches on its own. */
const FULL = "full" as PrefetchKind

const PILL =
  "relative inline-flex h-9 shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-full border bg-white px-4 text-[13px] font-medium outline-none transition-[color,scale] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent]"

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }

export function LibraryTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const path = clean(pathname)
  const shows = showsLibraryTabs(pathname)
  /* The pill pressed, ahead of the address. Dropped once the address arrives. */
  const [pressed, setPressed] = useState<string | null>(null)
  /* A pill that is simply on when the page loads does not animate into place. */
  const [moved, setMoved] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => setPressed(null), [path])
  /* Back or forward while a press was still on its way: the address decides again. */
  useEffect(() => {
    const drop = () => setPressed(null)
    window.addEventListener("popstate", drop)
    return () => window.removeEventListener("popstate", drop)
  }, [])

  const current = pressed ?? path

  /* Every tab, whole, once the page has settled. The router keeps each for five minutes (next.config.mjs staleTimes). */
  useEffect(() => {
    if (!shows) return
    const run = () => {
      for (const tab of LIBRARY_TABS) if (tab.href !== path) router.prefetch(tab.href, { kind: FULL })
    }
    const w = window as IdleWindow
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 800)
    return () => window.clearTimeout(t)
  }, [shows, path, router])

  /* And the one a pointer is on its way to, in case the idle pass has not reached it. */
  const warm = useCallback(
    (href: string) => {
      if (href !== path) router.prefetch(href, { kind: FULL })
    },
    [path, router],
  )

  /* Which edge of the row has more behind it, for the fade. */
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [])
  useLayoutEffect(() => {
    if (!shows) return
    measure()
    const el = trackRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shows, measure])

  /* The chosen pill brought whole into view: on load at once, after a press smoothly. */
  useLayoutEffect(() => {
    const el = trackRef.current
    const pill = el?.querySelector<HTMLElement>(`[data-library-tab-href="${current}"]`)
    if (!el || !pill) return
    const pad = 24
    const from = pill.offsetLeft - pad
    const to = pill.offsetLeft + pill.offsetWidth + pad - el.clientWidth
    const next = el.scrollLeft > from ? from : el.scrollLeft < to ? to : el.scrollLeft
    if (Math.abs(next - el.scrollLeft) < 1) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: Math.max(0, next), behavior: moved && !reduce ? "smooth" : "auto" })
  }, [current, moved])

  if (!shows) return null

  const press = (href: string) => {
    if (href === current) return
    setMoved(true)
    setPressed(href)
  }

  const fade = edges.left && edges.right ? "both" : edges.right ? "right" : edges.left ? "left" : "none"
  const mask = {
    both: "[mask-image:linear-gradient(to_right,transparent_0,black_20px,black_calc(100%-28px),transparent_100%)]",
    right: "[mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent_100%)]",
    left: "[mask-image:linear-gradient(to_right,transparent_0,black_20px)]",
    none: "",
  }[fade]

  return (
    <header data-library-header="" className="mb-5 sm:mb-6">
      <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Library</h1>
      <nav aria-label="Library" className="-mx-4 mt-3 sm:mx-0 sm:mt-4">
        <div ref={trackRef} onScroll={measure} data-library-tabs="" data-fade={fade} className={`overflow-x-auto overscroll-x-contain px-4 py-0.5 scrollbar-hide sm:px-0 ${mask}`}>
          <div className="flex w-max items-center gap-2">
            {LIBRARY_TABS.map((tab) => {
              const active = tab.href === current
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={tab.href === path ? "page" : undefined}
                  data-library-tab={tab.label}
                  data-library-tab-href={tab.href}
                  data-active={active ? "true" : "false"}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                    press(tab.href)
                  }}
                  onPointerEnter={() => warm(tab.href)}
                  onTouchStart={() => warm(tab.href)}
                  onFocus={() => warm(tab.href)}
                  style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
                  className={`${PILL} ${active ? "border-[#d7dadf] text-[#1a1a2e]" : "border-[#e4e7ec] text-[#6b7280] hover:text-[#1a1a2e]"}`}
                >
                  {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
                  <span
                    aria-hidden
                    data-library-tab-fill=""
                    style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
                    className={`pointer-events-none absolute -inset-px rounded-full border border-[#d7dadf] bg-[#e2e4e8] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)] ${moved ? "transition-[opacity,scale]" : "transition-none"} motion-reduce:transition-none ${
                      active ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"
                    }`}
                  />
                  <span className="relative">{tab.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </header>
  )
}
