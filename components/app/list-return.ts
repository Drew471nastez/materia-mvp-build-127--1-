"use client"

import { useEffect } from "react"
import { moveLayer } from "@/components/app/page-layer"
import { backThen } from "@/lib/navigation/go-back"
import { isTraversing, markTraversal, prefetchAppPage } from "@/lib/ui/app-navigation"
import type { ListReturnBase } from "@/lib/ui/rows-with-return"

export type { ListReturnBase }

/**
 * ===========================================================================
 *  A LIST AND THE PAGE ONE OF ITS ROWS OPENS
 * ===========================================================================
 * The one round trip between a list in /app and the page one of its rows
 * opens, shared by every commerce list: Coupons (app/app/coupons), Upsells
 * and bundles (app/app/offers), Collections (app/app/products/collections)
 * and Size charts (app/app/products/size-charts). Each list makes one with
 * createListReturn and its own address; nothing here is written twice.
 *
 *   ONE MOVE EACH WAY. On a phone the page rises over the list and drops
 *   back to it (components/app/page-layer moveLayer); from 768px it lands as
 *   every page does.
 *
 *   THE HISTORY STAYS HONEST. A page the list opened is one entry after it,
 *   so leaving is a back; one opened any other way (a link, a reload) is
 *   replaced by the list, marked as a return.
 *
 *   WHAT CHANGED. A save or a delete hands the list what it did, and a line
 *   to say. The list lays the change over the rows the router kept, says the
 *   line, and asks the server for the rows again (router.refresh).
 */

type Router = {
  push: (href: string) => void
  replace: (href: string) => void
  back: () => void
  prefetch: (href: string, options?: never) => void
}


/** How long after a press from the list the page still counts as opened by it. */
const PUSH_KEPT_MS = 10_000

type NavigationEntries = { currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] }

/** The Navigation API, where the engine has it (Chromium, Safari 26.2): it can say how far back the list is. */
function navigationEntries(): NavigationEntries | null {
  if (typeof window === "undefined") return null
  const nav = (window as unknown as { navigation?: NavigationEntries }).navigation
  return nav && nav.currentEntry && typeof nav.entries === "function" ? nav : null
}

/**
 * HOW MANY ENTRIES BACK THE LIST IS. A page that moves its own address while it
 * is open (a community's sections, components/community/creator/community-shell)
 * is more than one entry after the list that opened it, and one back would land
 * on its own previous address. With the Navigation API the list's entry is
 * known by its index and checked by its address; without it, one back, and the
 * landing is checked instead (leave).
 */
export function stepsBackTo(listHref: string, listIndex: number | null): number {
  const nav = navigationEntries()
  if (!nav || listIndex === null) return 1
  const here = nav.currentEntry?.index ?? -1
  const entry = nav.entries?.()[listIndex]
  if (!entry?.url || here <= listIndex) return 1
  try {
    if (new URL(entry.url).pathname !== listHref) return 1
  } catch {
    return 1
  }
  return here - listIndex
}

export function createListReturn<R extends ListReturnBase>(listHref: string) {
  let handoff: R | null = null
  let pushedAt: number | null = null
  let fromList = false
  let pages = 0
  let returnTo: string | null = null
  /* The list's own entry in the history, where the Navigation API says (stepsBackTo). */
  let listIndex: number | null = null

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      returnTo = window.location.pathname
    })
  }

  return {
    href: listHref,

    /** Open a row's page, or a new one, from the list. */
    open(router: Router, href: string) {
      moveLayer("enter", () => {
        pushedAt = Date.now()
        listIndex = navigationEntries()?.currentEntry?.index ?? null
        router.push(href)
      })
    },

    /** The page's side: was it opened by the list, one history entry after it? */
    useOrigin() {
      useEffect(() => {
        pages++
        if (pushedAt !== null && Date.now() - pushedAt < PUSH_KEPT_MS) fromList = true
        pushedAt = null
        return () => {
          pages--
          window.setTimeout(() => {
            if (pages === 0) fromList = false
          }, 0)
        }
      }, [])
    },

    /**
     * Leave for the list, with what was done. A back that goes nowhere still
     * ends on the list (backThen falls back to replacing the address).
     */
    leave(router: Router, what: R) {
      handoff = what
      returnTo = listHref
      const back = fromList
      const steps = back ? stepsBackTo(listHref, listIndex) : 0
      fromList = false
      listIndex = null
      const replaceWithList = () => {
        markTraversal()
        router.replace(listHref)
      }
      /* A back that landed somewhere else (an entry the page added that nothing counted): the list is put up there. */
      const landedOnList = () => {
        window.removeEventListener("popstate", landedOnList)
        window.setTimeout(() => {
          if (window.location.pathname !== listHref) replaceWithList()
        }, 0)
      }
      moveLayer("leave", () => {
        if (!back) return replaceWithList()
        window.addEventListener("popstate", landedOnList)
        backThen(() => {
          window.removeEventListener("popstate", landedOnList)
          replaceWithList()
        }, undefined, steps)
      })
    },

    /** Is the list about to draw a return rather than a fresh visit? */
    isReturning() {
      return returnTo === listHref || isTraversing()
    },

    /** What the page did, without taking it: read by the list's first state. */
    peek(): R | null {
      return handoff
    },

    /** The list is on the screen: what the page did, once. */
    take(): R | null {
      const what = handoff
      handoff = null
      pushedAt = null
      returnTo = null
      return what
    },

    /** The list, fetched ahead, so the way back is instant. */
    warm(router: Router) {
      prefetchAppPage(router, listHref)
    },
  }
}

export { rowsWithReturn } from "@/lib/ui/rows-with-return"

/** The row the page had open, tinted for a moment once the list is back, and brought into view inside its pane. */
export function tintReturnedRow(section: HTMLElement | null, id: string, delayMs: number) {
  if (!section) return
  const row = Array.from(section.querySelectorAll<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)).find((el) => el.getClientRects().length > 0)
  if (!row || typeof row.animate !== "function") return
  const pane = section.closest<HTMLElement>(".orders-pane")
  if (pane) {
    const r = row.getBoundingClientRect()
    const p = pane.getBoundingClientRect()
    if (r.top < p.top || r.bottom > p.bottom) pane.scrollTo({ top: pane.scrollTop + r.top - p.top - (p.height - r.height) / 2, behavior: "smooth" })
  }
  const targets = row.tagName === "TR" ? (Array.from(row.children) as HTMLElement[]) : [row]
  for (const el of targets) el.animate([{ backgroundColor: "#eceef1" }, { backgroundColor: "rgba(236, 238, 241, 0)" }], { duration: 1200, delay: delayMs, easing: "ease-out", fill: "backwards" })
}
