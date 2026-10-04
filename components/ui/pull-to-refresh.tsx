"use client"

/**
 * ===========================================================================
 *  PULL TO REFRESH, THE WAY A PHONE DOES IT, FOR ANY PAGE
 * ===========================================================================
 * <PullToRefresh onRefresh={() => Promise<void>}>{children}</PullToRefresh>
 *
 * At the top of the page, pull down: the page follows the finger on a rubber
 * band (UIScrollView's curve: one for one at first, heavier and heavier,
 * never a hard stop), a thin grey ring draws itself in the room the pull
 * opens, the phone gives one light tick as the pull crosses the line where
 * letting go refreshes, and the page rests a ring's height down, the ring
 * turning, until onRefresh settles; then it springs home.
 *
 * ONE ENGINE. The gesture, the spring and the ring are the /app home's own
 * (hooks/use-pull-to-refresh.ts, measured by scripts/check-pull-refresh.mjs):
 * this wraps them so any page can have them without copying a line. What it
 * adds is finding the page's scroller, which is one of three things:
 *
 *   inside the children   a page that is its own scroll box (/app's
 *                         analytics: `.page-scroll`), or anything marked
 *                         data-pull-scroller
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

import { useCallback, useEffect, useLayoutEffect, useRef, useTransition, type ReactNode, type RefObject } from "react"
import { useRouter } from "next/navigation"

import { PullToRefreshIndicator } from "@/components/app/pull-to-refresh-indicator"
import { PULL_TO_REFRESH, usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { cn } from "@/lib/utils"

/** Longest the ring waits for a refresh before the page comes home anyway. */
export const REFRESH_MAX_MS = 10_000

function scrollerFor(root: HTMLElement): HTMLElement {
  const inside = root.querySelector<HTMLElement>("[data-pull-scroller], .page-scroll")
  if (inside) return inside
  const around = root.closest<HTMLElement>(".app-content-scroll")
  if (around) return around
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  fill = false,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
  className?: string
  /** For a page that is its own scroll box at full height (h-full): the wrapper passes the height through. */
  fill?: boolean
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
    refreshHold: PULL_TO_REFRESH.refreshHold,
    listenOn: rootRef,
    /* Whatever is inside is somebody else's: a sideways row keeps its swipe without having to be named. */
    axisFirst: true,
  })

  return (
    <div ref={rootRef} data-pull-to-refresh="" className={cn("relative", fill && "h-full", className)}>
      <PullToRefreshIndicator ref={indicatorRef} topOffset={0} refreshHold={PULL_TO_REFRESH.refreshHold} />
      <div ref={contentRef} data-pull-content="" data-keep-transform="" className={fill ? "h-full" : undefined}>
        {children}
      </div>
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
export function PullToRefreshEvent({ scope, children, className, fill }: { scope: string; children: ReactNode; className?: string; fill?: boolean }) {
  const onRefresh = useCallback(() => dispatchPullRefresh(scope), [scope])
  return (
    <PullToRefresh onRefresh={onRefresh} className={className} fill={fill}>
      {children}
    </PullToRefresh>
  )
}

/**
 * A server rendered page: the pull asks the server for the page's own data
 * again (router.refresh, in a transition, so what is on screen stays until
 * the new answer is in place) and tells any part with data of its own
 * through the same event and `scope`. The ring waits for both.
 */
export function RouterPullToRefresh({ scope, children, className, fill }: { scope: string; children: ReactNode; className?: string; fill?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const waiting = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (!pending && waiting.current) {
      waiting.current()
      waiting.current = null
    }
  }, [pending])
  const onRefresh = useCallback(() => {
    const server = new Promise<void>((resolve) => {
      waiting.current = resolve
      startTransition(() => router.refresh())
      /* A transition that never reported itself pending still lets the ring go. */
      window.setTimeout(resolve, 6000)
    })
    return Promise.all([server, dispatchPullRefresh(scope)])
  }, [router, scope])
  return (
    <PullToRefresh onRefresh={onRefresh} className={className} fill={fill}>
      {children}
    </PullToRefresh>
  )
}
