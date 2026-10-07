"use client"

/**
 * ===========================================================================
 *  PULL TO REFRESH, THE WAY A PHONE DOES IT, FOR ANY PAGE
 * ===========================================================================
 * <PullToRefresh onRefresh={() => Promise<void>}>{children}</PullToRefresh>
 *
 * At the top of the page, pull down: the page follows the finger on a rubber
 * band (UIScrollView's curve: one for one at first, heavier and heavier,
 * never a hard stop), iOS's spinner appears in the room the pull opens, its
 * spokes one by one as the pull grows (round 11), the phone gives one light
 * tick as the pull crosses the line where letting go refreshes, and the
 * page rests a spinner's height down, the spinner turning, until onRefresh
 * settles; then it springs home.
 *
 * THE SPINNER HAS ITS OWN ROOM (round 11: "it never overlaps any
 * container"). It is drawn only inside the gap between the top of the page
 * and the content the pull moved down, sized to that gap, so it never sits
 * on the content (a feed's chips, a card) at any frame: while the gap is
 * small it is small, and it shrinks with the gap as the page springs home
 * (hooks/use-pull-to-refresh.ts THE SPOKES).
 *
 * ONE ENGINE. The gesture and the spring are the /app home's own
 * (hooks/use-pull-to-refresh.ts, measured by scripts/check-pull-refresh.mjs):
 * this wraps them so any page can have them without copying a line. What it
 * adds is finding the page's scroller, which is one of three things:
 *
 *   inside the children   a page that is its own scroll box, or anything
 *                         marked data-pull-scroller
 *   just outside it       the same, when the pull wraps only the part under
 *                         a bar that stays put (/app analytics)
 *   around it             /app's `.app-content-scroll`
 *   the document          every page that scrolls the window (a community)
 *
 * WHAT IT NEVER DOES
 *   Fight the page's scroll. A pull only starts on a touch that lands
 *   while the scroller is at its very top and moves down; going up is a
 *   scroll and is let go at once, and a sideways row or a chart keeps its
 *   swipe. The one listener that can cancel a move (touchmove, which is
 *   the only thing that stops iOS bouncing a scroller) is attached only
 *   while the top of the page is on screen, so a swipe anywhere below
 *   never waits for it.
 *   Move anything off the compositor, or anything at rest: the page is
 *   only translated while it moves and carries nothing once it is home,
 *   so fixed things inside it stay fixed.
 *   Use a mouse. Touch only.
 *   Buzz an iPhone's browser. The tick is @capacitor/haptics in the app,
 *   a vibration on Android, and nothing in Safari (lib/native-bridge.ts).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import { usePathname, useRouter } from "next/navigation"

import { SPINNER_SPOKES } from "@/components/community/member/place-spinner"
import { SPOKES_HOLD, SPOKES_SIZE, cancelAllPullToRefresh, usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { cn } from "@/lib/utils"

/** Longest the ring waits for a refresh before the page comes home anyway. */
export const REFRESH_MAX_MS = 10_000

function scrollerFor(root: HTMLElement): HTMLElement {
  const inside = root.querySelector<HTMLElement>("[data-pull-scroller], .page-scroll")
  if (inside) return inside
  /* Inside a page's own scroll box, under something that stays put (/app analytics' purple bar): that box. */
  const own = root.closest<HTMLElement>("[data-pull-scroller], .page-scroll")
  if (own) return own
  const around = root.closest<HTMLElement>(".app-content-scroll")
  if (around) return around
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  fill = false,
  spinnerYOffset = 0,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
  className?: string
  /** For a page that is its own scroll box at full height (h-full): the wrapper passes the height through. */
  fill?: boolean
  /** Nudge the iOS spokes indicator down (px). */
  spinnerYOffset?: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLElement | null>(null)
  /* Found before the gesture's own effect runs (layout effects come first), once per mount. */
  useLayoutEffect(() => {
    if (rootRef.current) scrollerRef.current = scrollerFor(rootRef.current)
  }, [])

  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const run = useCallback(async () => {
    let timer = 0
    try {
      await Promise.race([
        Promise.resolve(refreshRef.current()).catch(() => {}),
        new Promise((r) => {
          timer = window.setTimeout(r, REFRESH_MAX_MS)
        }),
      ])
    } finally {
      window.clearTimeout(timer)
    }
  }, [])

  const { contentRef, indicatorRef } = usePullToRefresh(scrollerRef as RefObject<HTMLElement | null>, run, {
    refreshHold: SPOKES_HOLD,
    listenOn: rootRef,
    /* Whatever is inside is somebody else's: a sideways row keeps its swipe without having to be named. */
    axisFirst: true,
    spinnerYOffset,
  })

  const pathname = usePathname()
  const pathRef = useRef(pathname)
  useEffect(() => {
    if (pathRef.current !== pathname) {
      pathRef.current = pathname
      cancelAllPullToRefresh()
    }
  }, [pathname])

  useEffect(() => {
    const onRoute = () => cancelAllPullToRefresh()
    window.addEventListener("storelib-route-loading", onRoute)
    return () => window.removeEventListener("storelib-route-loading", onRoute)
  }, [])

  return (
    <div ref={rootRef} data-pull-to-refresh="" className={cn("relative", fill && "h-full", className)}>
      <PullSpokes ref={indicatorRef} />
      <div ref={contentRef} data-pull-content="" data-keep-transform="" className={fill ? "h-full" : undefined}>
        {children}
      </div>
    </div>
  )
}

/**
 * THE SPINNER IN THE PULL'S ROOM: the community's own spinner
 * (member/place-spinner.tsx, its eight spokes and their fading tail), drawn
 * once and painted by the hook, one write per frame, never through React:
 *
 *   [data-ptr-indicator]  where it sits, how large, how visible
 *   [data-ptr-turn]       the box will-change is put on while it moves
 *   [data-ptr-spin]       the turn while refreshing (a CSS animation)
 *   [data-ptr-spoke]      each spoke's opacity: one by one with the pull,
 *                         their resting tail (data-rest) while it turns
 *
 * At rest it is invisible, at the top of the room, and takes no space.
 */
function PullSpokes({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden
      data-ptr-indicator=""
      data-keep-transform=""
      className="pointer-events-none absolute left-1/2 -top-1 z-20 -ml-[12px] origin-center text-[#8a8f98]"
      style={{ width: SPOKES_SIZE, height: SPOKES_SIZE, transform: "translate3d(0, 0, 0) scale(0)", opacity: 0 }}
    >
      <span data-ptr-turn="" data-keep-transform="" className="block h-full w-full">
        <span data-ptr-spin="" data-keep-transform="" className="block h-full w-full">
          <svg viewBox="0 0 24 24" width={SPOKES_SIZE} height={SPOKES_SIZE} className="block">
            {SPINNER_SPOKES.map((l, i) => (
              <line key={i} data-ptr-spoke="" data-rest={l.opacity} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity: 0 }} />
            ))}
          </svg>
        </span>
      </span>
      <style>{"@keyframes ptr-spokes-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
    </div>
  )
}

/* ── Two ways to refresh, for the pages that use it ───────────────────── */

export const PULL_REFRESH_EVENT = "storelib:pull-refresh"

export type PullRefreshDetail = { scope: string; done?: Promise<unknown> }

/**
 * THE EVENT CONTRACT. A page whose list is somebody else's component (the
 * community feed) asks for the refresh by event:
 *
 *   window.dispatchEvent(new CustomEvent("storelib:pull-refresh", { detail: { scope } }))
 *
 * and the part that owns the data listens for its scope and sets
 * `event.detail.done` to a promise; the ring turns until it settles. Nobody
 * listening is a refresh that is over at once (the ring still turns for its
 * minimum, so it never blinks).
 */
export function dispatchPullRefresh(scope: string): Promise<void> {
  const detail: PullRefreshDetail = { scope }
  window.dispatchEvent(new CustomEvent<PullRefreshDetail>(PULL_REFRESH_EVENT, { detail }))
  return Promise.resolve(detail.done).then(
    () => undefined,
    () => undefined,
  )
}

/** A page whose data a listener owns: the pull is the event, and the ring waits for the listener. */
export function PullToRefreshEvent({
  scope,
  children,
  className,
  fill,
  spinnerYOffset,
}: {
  scope: string
  children: ReactNode
  className?: string
  fill?: boolean
  spinnerYOffset?: number
}) {
  const onRefresh = useCallback(() => dispatchPullRefresh(scope), [scope])
  return (
    <PullToRefresh onRefresh={onRefresh} className={className} fill={fill} spinnerYOffset={spinnerYOffset}>
      {children}
    </PullToRefresh>
  )
}

/**
 * A server rendered page: the pull asks the server for the page's own data
 * again (router.refresh) and tells any part with data of its own through the
 * same event and `scope`. The ring waits for both.
 *
 * NOT IN A TRANSITION WHILE THE PAGE IS HELD OPEN. startTransition kept the
 * old tree on screen until the new one was ready; with the content wrapper
 * translated down for the spinner that read as two copies of the same header
 * stacked on each other (/app home, Analytics, account).
 */
export function RouterPullToRefresh({
  scope,
  children,
  className,
  fill,
  spinnerYOffset,
}: {
  scope: string
  children: ReactNode
  className?: string
  fill?: boolean
  spinnerYOffset?: number
}) {
  const router = useRouter()
  const onRefresh = useCallback(() => {
    const server = new Promise<void>((resolve) => {
      router.refresh()
      /* One frame for the refresh to commit without overlapping stale UI under a pull transform. */
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      window.setTimeout(resolve, 6000)
    })
    return Promise.all([server, dispatchPullRefresh(scope)])
  }, [router, scope])
  return (
    <PullToRefresh onRefresh={onRefresh} className={className} fill={fill} spinnerYOffset={spinnerYOffset}>
      {children}
    </PullToRefresh>
  )
}
