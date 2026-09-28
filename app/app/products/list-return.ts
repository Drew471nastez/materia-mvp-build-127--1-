"use client"

import { useEffect } from "react"
import { moveLayer } from "@/components/app/page-layer"
import { isAnswerFor, isTraversing, markTraversal, prefetchAppPage } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  BETWEEN THE PRODUCTS LIST AND A PRODUCT
 * ===========================================================================
 * Both ways are one move of the editor's layer (components/app/page-layer):
 * it rises from the bottom over the list, and drops back down to it, and
 * the press that did it is answered on its own frame (moveLayer: the row is
 * tinted, New product and the back arrow dim; Cancel and Back answer
 * themselves). What else the round trip keeps:
 *
 *   THE HISTORY STAYS HONEST. An editor the list opened sits on the history
 *   entry right after the list's, so Back, Cancel and Discard go back in
 *   history (router.back()): the browser's back button on the list then
 *   leaves the app's Products rather than reopening the editor, and forward
 *   reopens it, as it would anywhere else. An editor opened any other way (a
 *   link from somewhere else, a new tab, a reload) has no list behind it, so
 *   it is replaced by the list instead (router.replace), which leaves no
 *   editor in the history to come back to.
 *
 *   "The list opened it" is known only while that editor has stayed on the
 *   screen: it is noted when the editor mounts after the list pushed it, and
 *   forgotten the moment no editor is mounted any more (a press on the pill,
 *   a browser back). A new product's first save swaps one editor for another
 *   at its own address in one commit (history.replaceState, so the list is
 *   still the entry behind it) and keeps the note.
 *
 *   THE LIST IS ALREADY HERE. The editor prefetches /app/products in full
 *   when it opens, and again once a save's refresh has landed (a refresh
 *   drops every page the router kept).
 *
 *   WHERE YOU WERE. Both ways back are a return (a back is one already; the
 *   replace is marked as one with markTraversal), so the stage puts the
 *   list's scroll back, and the list takes up its view, order, search and
 *   page again (isReturning). A fresh visit from the sidebar or the pill is
 *   none of these, and starts at All, Newest, no search, page one.
 *
 *   WHICH ONE YOU OPENED. The product the editor had open is handed to the
 *   list, which tints its row for a moment as it comes back into view.
 */

type Router = {
  push: (href: string) => void
  replace: (href: string) => void
  back: () => void
  prefetch: (href: string, options?: never) => void
}

export const PRODUCTS_HREF = "/app/products"

let edited: string | null = null
/* The list has just pushed an editor, which has not mounted yet. */
let pushedAt: number | null = null
/* The editor on the screen was opened by the list, one history entry after it. */
let fromList = false
/* Editors mounted right now: 0 between two navigations, 1 while one is up. */
let editors = 0
const PUSH_KEPT_MS = 10_000

/**
 * Open a product, or a new one, from the list.
 *
 * ONE SIGN OF PROGRESS, IN ONE PLACE. "You can see the double loading there."
 * A press on a row was answered twice: the list drew its own spinner where
 * Preview is, and the layer answered whatever was under the pointer as well,
 * which on a computer is the product's name (page-layer holdPress). That one
 * paints its element's text transparent and puts a spinner in its place, so
 * the pressed row had an empty name with a spinner in the middle of it AND a
 * second spinner at the end of the row. `answered` says the list has drawn
 * the answer itself, and the layer adds none of its own. New product has no
 * answer of its own and is still the layer's to answer.
 */
export function openEditor(router: Router, href: string, answered = false) {
  moveLayer(
    "enter",
    () => {
      pushedAt = Date.now()
      router.push(href)
    },
    answered ? false : undefined,
  )
}

/**
 * The editor's side of the note, called once by the editor. An editor that
 * mounts right after the list pushed it was opened by the list; the note is
 * dropped a tick after the last editor unmounts, which a swap from one editor
 * to the next in one commit never reaches.
 */
export function useListOrigin() {
  useEffect(() => {
    editors++
    if (pushedAt !== null && Date.now() - pushedAt < PUSH_KEPT_MS) fromList = true
    pushedAt = null
    return () => {
      editors--
      window.setTimeout(() => {
        if (editors === 0) fromList = false
      }, 0)
    }
  }, [])
}

/** The list is on the screen: a push that never became an editor (a redirect back) is forgotten. */
export function listShown() {
  pushedAt = null
  returnTo = null
}

/** Leave the editor for the list. `productId` is the saved product, if there is one. */
export function returnToProducts(router: Router, productId: string | null) {
  edited = productId
  returnTo = PRODUCTS_HREF
  const back = fromList
  fromList = false
  moveLayer("leave", () => {
    if (back) {
      /* A popstate: the app marks it a return itself (navigation-loading-bar). */
      router.back()
    } else {
      markTraversal()
      router.replace(PRODUCTS_HREF)
    }
  })
}

/*
  A RETURN, NOTED BY ADDRESS. The list decides its first state while it
  renders, which can be after the commit that takes the stage's traversal
  mark (a page that waits on its data renders in a later pass). So a return
  is noted here, with the address it goes to, and kept until the list shows:
  by the way back from the editor, and by every popstate (the browser's back
  or forward), with the address it landed on. A press on the sidebar or the
  pill notes nothing, and a return to some other page does not count for
  the list.
*/
let returnTo: string | null = null
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    returnTo = window.location.pathname
  })
}

/**
 * Is the list about to draw a return (a way back from the editor, or the
 * browser's back or forward) rather than a fresh visit? Read while it renders
 * its first state.
 */
export function isReturning() {
  return returnTo === PRODUCTS_HREF || isTraversing()
}

/** The list, fetched ahead, so the way back is instant. */
export function warmProducts(router: Router) {
  prefetchAppPage(router, PRODUCTS_HREF)
}

/*
  THE WAY IN, FETCHED AHEAD. A full prefetch brings the editor's whole
  payload, the product read on the server and the references to the
  editor's code, whose chunks the router starts loading as it reads them. So
  the press that follows has nothing left to wait for. The router keeps it
  for staleTimes (five minutes); asking again for one it holds costs nothing.
*/
export function warmEditor(router: Router, href: string) {
  prefetchAppPage(router, href)
}

/*
  ===========================================================================
   THE SIGN OF PROGRESS LASTS AS LONG AS THE WAIT
  ===========================================================================
  "Sometimes it ends, and then I have to wait another 10 seconds to load the
  page." Two clocks were ending the press's answer on their own: the layer
  lets a press go after LAYER_PRESS_KEPT_MS (8s) and the shell drops a
  navigation it has heard nothing about after GIVE_UP_MS (10s). An editor
  whose server read ran longer than that left the row quiet, with the editor
  arriving seconds later, which is the worst reading of all: the press looks
  refused and then the screen changes by itself.

  So while the router's own request for the editor's address is still out,
  the navigation is reported again on a tick. The row, the loading bar and
  the shell all read the one record, so all three last exactly as long as the
  server does. Once the answer is back the shell takes over as it does
  everywhere: a page that does not land within NAV_STUCK_AFTER_ANSWER_MS of
  its answer is loaded as a document (lib/ui/app-navigation
  watchRouterAnswers), and either way the press is over.

  Resource timing only: nothing is fetched, no request is touched and no
  response is read. Where a browser has none, WAIT_LONGEST_MS is the end of
  it, as the old ten seconds was.
*/
export const WAIT_TICK_MS = 2000
/** Nothing on the list waits longer than this, whatever the timings say. */
export const WAIT_LONGEST_MS = 45_000

/** Has the router's own request for `href`, sent at or after `since`, come back? */
export function editorAnswered(href: string, since: number): boolean {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return true
  try {
    const nav = { href, startedAt: since }
    return performance
      .getEntriesByType("resource")
      .some((entry) => isAnswerFor(nav, entry as PerformanceResourceTiming, window.location.origin))
  } catch {
    return true
  }
}

/**
 * THE WAY IN FOR SEVERAL PRODUCTS, ONE AFTER ANOTHER, ON A FRESH SESSION.
 *
 * The list used to fetch New product and its first three rows ahead all at
 * once. Each of those is a request that asks Supabase who is signed in, in
 * the proxy and again in the page. When the list was drawn from the router's
 * copy (kept five minutes) and the session had expired in the meantime, all
 * of them arrived with the same old token and every one tried to renew it
 * with the same refresh token at the same moment. That is when the auth
 * service stops answering: the production logs show "[proxy] auth
 * undetermined on /app/products/new: timed out" inside exactly such a burst,
 * and a request that times out there waits 3s, retries, and waits 3s again,
 * which is the five seconds a press on a product could sit on the list.
 *
 * So the session is made fresh in the browser first (`fresh`, one renewal if
 * it is due, nothing if it is not), and the pages are then asked for one at
 * a time, WARM_GAP_MS apart, each carrying the fresh cookie. Returns the
 * cancel, for an unmount before it finished.
 */
export const WARM_GAP_MS = 250
/** The longest the fresh session is waited for; past it the pages are asked for anyway. */
const FRESH_WAIT_MS = 2000

export function warmInTurn(warm: Array<() => void>, fresh: () => Promise<unknown>): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const next = (i: number) => {
    if (cancelled || i >= warm.length) return
    warm[i]()
    timer = setTimeout(() => next(i + 1), WARM_GAP_MS)
  }
  let started = false
  const start = () => {
    if (started || cancelled) return
    started = true
    next(0)
  }
  const cap = setTimeout(start, FRESH_WAIT_MS)
  fresh().then(start, start).finally(() => clearTimeout(cap))
  return () => {
    cancelled = true
    clearTimeout(cap)
    if (timer) clearTimeout(timer)
  }
}

/**
 * Run `task` once the browser is idle (a frame with nothing else to do), or
 * after `timeout` at the latest; at once where idle callbacks do not exist.
 * Returns the cancel, for an unmount before it ran.
 */
export function whenIdle(task: () => void, timeout = 1500): () => void {
  if (typeof window === "undefined") return () => {}
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void }
  if (typeof w.requestIdleCallback === "function" && typeof w.cancelIdleCallback === "function") {
    const handle = w.requestIdleCallback(task, { timeout })
    return () => w.cancelIdleCallback?.(handle)
  }
  const handle = window.setTimeout(task, 200)
  return () => window.clearTimeout(handle)
}

/** The product the editor just had open, once. */
export function takeEdited(): string | null {
  const id = edited
  edited = null
  return id
}
