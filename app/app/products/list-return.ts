"use client"

import { useEffect } from "react"
import { moveLayer } from "@/components/app/page-layer"
import { isTraversing, markTraversal, prefetchAppPage } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  BETWEEN THE PRODUCTS LIST AND A PRODUCT
 * ===========================================================================
 * Both ways are one move of the editor's layer (moveLayer): in from the
 * list, out to it. What else the round trip keeps:
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

/** Open a product, or a new one, from the list. */
export function openEditor(router: Router, href: string) {
  moveLayer("enter", () => {
    pushedAt = Date.now()
    router.push(href)
  })
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

/** The product the editor just had open, once. */
export function takeEdited(): string | null {
  const id = edited
  edited = null
  return id
}
