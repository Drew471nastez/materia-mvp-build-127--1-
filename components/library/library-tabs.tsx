"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import { cleanPath as clean, libraryTabs, showsLibraryTabs } from "./library-tab-list"
import { LIBRARY_TITLE, LIBRARY_TITLE_GAP } from "./library-ui"
import { useFirstTap } from "@/lib/navigation/first-tap"
import { PILL_FADE_EASE, PILL_FADE_MS, PILL_FILL, PILL_PRESS, PILL_WORDS, PILL_WORDS_OFF, PILL_WORDS_ON, pressPill, releasePill } from "@/lib/ui/pill-switch"
import { watchNavigation } from "@/lib/nav/stuck-navigation"

/**
 * ===========================================================================
 *  THE LIBRARY'S OWN PLACES
 * ===========================================================================
 * What a buyer comes here for is the things they bought, and those live on
 * two screens: products (files to download, and any membership bought on
 * its own, labelled Membership) and courses (/account/library/courses).
 * While communities are on, the communities they run and are in come next
 * (`communities`, read by the layout on the server). Then what they have
 * not bought yet: the wishlist. Then what they did about them: reviews and
 * receipts. Memberships are communities now, so they have no pill of their
 * own (./library-tab-list.ts).
 *
 * THE LIBRARY IS ITS OWN PAGE (/account/library): "Library opens as its own
 * page ... WITHOUT the profile hero above them (like /account/settings
 * does), with their own page title and the sub pills". So this is the
 * page's head: the title, set as Settings sets its own (LIBRARY_TITLE), and
 * under it one row of sub pills. The profile's Library pill still leads
 * here. The owner asked
 * for separate pills rather than the underlined row it was, in Storelib's
 * own style, so each one is Explore's category pill (components/explore/
 * explore-page-client.tsx): white on a hairline, and the chosen one pressed
 * in on a grey fill.
 *
 * THEY SWITCH THE WAY A COMMUNITY'S SPACE PILLS DO (round 17, lib/ui/
 * pill-switch.ts): the chosen pill's own fill fades in where it is over
 * 140ms and the one it leaves fades out the same way, the words turn colour
 * in one step, a finger lands as a light tint. Nothing slides and nothing
 * scales: round 16's own grew from 96% and dipped to 97% on the press, which
 * the space pills had stopped doing.
 *
 * THE PILL ANSWERS THE PRESS, NOT THE SERVER. The tabs are routes, and a
 * route can take a moment. The pressed pill is chosen on the press itself
 * and the address catches up. The screen under the row is replaced by the
 * next one in the frame it arrives (components/library/library-panel.tsx),
 * and the row itself never moves or fades. Every tab is fetched whole while
 * the page is idle, and again the moment a pointer comes near one, so by
 * the time a finger lands the next screen is usually already on the phone.
 *
 * On a phone the row scrolls sideways and fades at whichever edge has more
 * behind it. Settings is not a tab: it is a pill of the profile above. The row is on the library's list screens only:
 * a product, a course player or a membership opened from it has its own back
 * link and needs the room.
 */
export { LIBRARY_TABS, showsLibraryTabs } from "./library-tab-list"

/** The space pills' numbers (lib/ui/pill-switch.ts), so every row of pills moves alike. */
export const TAB_FADE_MS = PILL_FADE_MS
export const TAB_EASE = PILL_FADE_EASE

/** A whole page, data included, rather than the shell a Link fetches on its own. */
const FULL = "full" as PrefetchKind

/* White on a hairline, the same size chosen or not: the fill, the press and the words are layers inside it (lib/ui/pill-switch.ts). */
const PILL =
  "group/pill relative isolate inline-flex h-10 sm:h-9 shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white px-4 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }

/**
 * ONE PILL, ANSWERING THE FIRST TAP. On a finger the move starts on the lift
 * (lib/navigation/first-tap.ts), not on a click the browser may never send:
 * a tap while the row is still gliding the last pill into view, or while
 * the screen under it is cross fading, used to be spent on the glide or
 * cancelled by the fade, and the pill needed a second tap. A mouse and the
 * keyboard keep the Link's own click.
 */
function LibraryPill({
  href,
  label,
  active,
  current,
  onPress,
  onTap,
  onWarm,
}: {
  href: string
  label: string
  active: boolean
  current: boolean
  onPress: () => void
  onTap: () => void
  onWarm: () => void
}) {
  const tap = useFirstTap<HTMLAnchorElement>((via) => {
    if (via === "tap") {
      if (!active) onTap()
      return
    }
    onPress()
    /* A plain click: the Link navigates itself, as it always has. */
    return false
  })
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? "page" : undefined}
      data-library-tab={label}
      data-library-tab-href={href}
      data-active={active ? "true" : "false"}
      onPointerDown={(e) => {
        onWarm()
        if (e.button === 0 && !active) pressPill(e.currentTarget)
        tap.onPointerDown(e)
      }}
      onPointerUp={(e) => {
        releasePill(e.currentTarget)
        tap.onPointerUp(e)
      }}
      onPointerCancel={(e) => {
        releasePill(e.currentTarget)
        tap.onPointerCancel()
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") releasePill(e.currentTarget)
      }}
      onClick={(e) => {
        /* Not ours: a new tab, a new window, a context menu. */
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        /* The pill already chosen: nothing to do but not to push it again. */
        if (active) {
          e.preventDefault()
          return
        }
        tap.onClick(e)
      }}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      className={PILL}
    >
      <span aria-hidden data-pill-press="" className={PILL_PRESS} />
      {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
      <span aria-hidden data-library-tab-fill="" className={`${PILL_FILL} ${active ? "opacity-100" : "opacity-0"}`} />
      <span className={`${PILL_WORDS} ${active ? PILL_WORDS_ON : PILL_WORDS_OFF}`}>{label}</span>
    </Link>
  )
}

export function LibraryTabs({ communities = false }: { communities?: boolean } = {}) {
  const tabs = libraryTabs(communities)
  const pathname = usePathname()
  const router = useRouter()
  const path = clean(pathname)
  const shows = showsLibraryTabs(pathname)
  /* The pill pressed, ahead of the address. Dropped once the address arrives. */
  const [pressed, setPressed] = useState<string | null>(null)
  /* After the first press the row glides a chosen pill into view; on load it is put there at once. */
  const [panelEntrance, setPanelEntrance] = useState(false)
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
      for (const tab of tabs) if (tab.href !== path) router.prefetch(tab.href, { kind: FULL })
    }
    const w = window as IdleWindow
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 2000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 800)
    return () => window.clearTimeout(t)
    // `tabs` is rebuilt each render from a constant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shows, path, router, communities])

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
  /* The chosen pill brought whole into view: on load at once, after a press smoothly. */
  const intoView = useCallback(
    (smooth: boolean) => {
      const el = trackRef.current
      const pill = el?.querySelector<HTMLElement>(`[data-library-tab-href="${current}"]`)
      if (!el || !pill) return
      const pad = 24
      const from = pill.offsetLeft - pad
      const to = pill.offsetLeft + pill.offsetWidth + pad - el.clientWidth
      const next = el.scrollLeft > from ? from : el.scrollLeft < to ? to : el.scrollLeft
      if (Math.abs(next - el.scrollLeft) < 1) return
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      el.scrollTo({ left: Math.max(0, next), behavior: smooth && !reduce ? "smooth" : "auto" })
    },
    [current],
  )
  const intoViewRef = useRef(intoView)
  intoViewRef.current = intoView
  /*
    MEASURED WHEN THE BROWSER HAS LAID THE PAGE OUT, NOT BEFORE (round 25, the owner: entering the library "should be smooth,
    not abrupt"). Both reads used to run in the commit that brings the library, each making the browser lay out the whole
    arriving page on the spot (86ms of the arrival at 4x CPU, traced). The row's ResizeObserver hands over its first size
    after the page's own layout, before it is painted, with nothing forced: the edges are read and the chosen pill brought
    into view there. A press later moves it the usual way.
  */
  useLayoutEffect(() => {
    if (!shows) return
    const el = trackRef.current
    if (!el) return
    if (typeof ResizeObserver === "undefined") {
      measure()
      intoViewRef.current(false)
      return
    }
    let first = true
    const ro = new ResizeObserver(() => {
      measure()
      if (first) {
        first = false
        intoViewRef.current(false)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [shows, measure])
  useLayoutEffect(() => {
    if (panelEntrance) intoView(true)
  }, [intoView, panelEntrance])

  if (!shows) return null

  const press = (href: string) => {
    if (href === current) return
    setPanelEntrance(true)
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
      <h1 className={`${LIBRARY_TITLE} ${LIBRARY_TITLE_GAP}`} data-library-title="">
        Library
      </h1>
      <nav aria-label="Library" className="-mx-4 sm:mx-0">
        <div ref={trackRef} onScroll={measure} data-library-tabs="" data-fade={fade} className={`overflow-x-auto overscroll-x-contain px-4 py-0.5 scrollbar-hide sm:px-0 ${mask}`}>
          <div className="flex w-max items-center gap-2">
            {tabs.map((tab) => {
              const active = tab.href === current
              return (
                <LibraryPill
                  key={tab.href}
                  href={tab.href}
                  label={tab.label}
                  active={active}
                  current={tab.href === path}
                  onPress={() => press(tab.href)}
                  onWarm={() => warm(tab.href)}
                  onTap={() => {
                    press(tab.href)
                    router.push(tab.href, { scroll: false })
                    /* Never a pill lit over a screen that never comes (lib/nav/stuck-navigation.ts). */
                    watchNavigation(tab.href)
                  }}
                />
              )
            })}
          </div>
        </div>
      </nav>
    </header>
  )
}
